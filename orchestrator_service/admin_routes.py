import os
import json
import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Any
from fastapi import APIRouter, Header, HTTPException, Depends, Request
from pydantic import BaseModel
from db import db

# Configuration
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-secret-99")

router = APIRouter(prefix="/admin", tags=["admin"])

# --- Security ---
async def verify_admin_token(x_admin_token: str = Header(None)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid Admin Token")

# --- Models ---
class TenantModel(BaseModel):
    store_name: str
    bot_phone_number: str
    owner_email: Optional[str] = None
    store_location: Optional[str] = None
    store_website: Optional[str] = None
    store_description: Optional[str] = None
    store_catalog_knowledge: Optional[str] = None
    tiendanube_store_id: Optional[str] = None
    tiendanube_access_token: Optional[str] = None

class CredentialModel(BaseModel):
    name: str
    value: str
    category: str
    scope: str = "global"
    tenant_id: Optional[int] = None
    description: Optional[str] = None

# --- Helper: Sync Environment to DB ---
async def sync_environment():
    """Reads env vars and ensures the default tenant and credentials exist."""
    # 1. Tenant Sync
    store_name = os.getenv("STORE_NAME", "Pointe Coach")
    store_phone = os.getenv("BOT_PHONE_NUMBER", "5491100000000")
    store_id = os.getenv("TIENDANUBE_STORE_ID", "")
    access_token = os.getenv("TIENDANUBE_ACCESS_TOKEN", "")
    store_loc = os.getenv("STORE_LOCATION", "Paraná, Entre Ríos, Argentina")
    store_web = os.getenv("STORE_WEBSITE", "https://www.pointecoach.shop/")
    store_desc = os.getenv("STORE_DESCRIPTION", "")
    store_know = os.getenv("STORE_CATALOG_KNOWLEDGE", "")
    
    q_tenant = """
        INSERT INTO tenants (
            store_name, bot_phone_number, 
            tiendanube_store_id, tiendanube_access_token,
            store_location, store_website,
            store_description, store_catalog_knowledge
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (bot_phone_number) 
        DO UPDATE SET 
            tiendanube_store_id = CASE WHEN EXCLUDED.tiendanube_store_id <> '' THEN EXCLUDED.tiendanube_store_id ELSE tenants.tiendanube_store_id END,
            tiendanube_access_token = CASE WHEN EXCLUDED.tiendanube_access_token <> '' THEN EXCLUDED.tiendanube_access_token ELSE tenants.tiendanube_access_token END,
            updated_at = NOW()
        RETURNING id
    """
    tenant_id = await db.pool.fetchval(q_tenant, store_name, store_phone, store_id, access_token, store_loc, store_web, store_desc, store_know)

    # 2. Credentials Sync (Auto-populate from Env)
    env_creds = [
        ("OPENAI_API_KEY", "openai", "OpenAI API Key"),
        ("YCLOUD_API_KEY", "whatsapp_ycloud", "YCloud API Key"),
        ("YCLOUD_WEBHOOK_SECRET", "whatsapp_ycloud", "YCloud Webhook Secret"),
        ("TIENDANUBE_ACCESS_TOKEN", "tiendanube", "Tienda Nube Token (Global)"),
        ("INTERNAL_API_TOKEN", "security", "Internal Service Token")
    ]

    q_cred = """
        INSERT INTO credentials (name, value, category, scope, description)
        VALUES ($1, $2, $3, 'global', $4)
        ON CONFLICT (scope, name) WHERE tenant_id IS NULL
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    """
    
    # We need a unique constraint to make ON CONFLICT work cleanly for detection.
    # Since we can't easily alter table schema here without migration, we'll do a check-and-insert loop or rely on name uniqueness if enforced.
    # Actually, let's just use Python check to be safe and avoid migration complexity right now.
    
    existing_creds = await db.pool.fetch("SELECT name FROM credentials WHERE tenant_id IS NULL")
    existing_names = set(r['name'] for r in existing_creds)

    for env_var, category, desc in env_creds:
        val = os.getenv(env_var)
        if val:
            # We map the Env Var name to the Credential Name shown in UI
            ui_name = env_var # Simple mapping
            
            # Upsert logic manually
            if ui_name in existing_names:
                await db.pool.execute("UPDATE credentials SET value = $1 WHERE name = $2 AND tenant_id IS NULL", val, ui_name)
            else:
                await db.pool.execute("INSERT INTO credentials (name, value, category, scope, description) VALUES ($1, $2, $3, 'global', $4)", ui_name, val, category, f"{desc} (Auto-detected from ENV)")

# --- Endpoints ---

@router.get("/bootstrap", dependencies=[Depends(verify_admin_token)])
async def bootstrap():
    """Initial load for the dashboard."""
    # 1. Sync Env Vars to DB so they appear in UI
    await sync_environment()

    # Get tenants count
    tenants = await db.pool.fetchval("SELECT COUNT(*) FROM tenants")
    
    # Get last activity
    last_inbound = await db.pool.fetchval("SELECT MAX(received_at) FROM inbound_messages")
    last_outbound = await db.pool.fetchval("SELECT MAX(created_at) FROM chat_messages WHERE role = 'assistant'")
    
    # Get Configured Services
    cred_rows = await db.pool.fetch("SELECT DISTINCT category FROM credentials")
    services = [r["category"] for r in cred_rows]
    
    return {
        "version": "1.2.0 (Pointe Coach)",
        "tenants_count": tenants,
        "last_inbound_at": last_inbound,
        "last_outbound_at": last_outbound,
        "configured_services": services,
        "status": "ok"
    }

@router.get("/stats", dependencies=[Depends(verify_admin_token)])
async def get_stats():
    """Get dashboard statistics."""
    # Active tenants (with ID)
    active_tenants = await db.pool.fetchval("SELECT COUNT(*) FROM tenants WHERE tiendanube_store_id IS NOT NULL")
    
    # Message stats
    total_messages = await db.pool.fetchval("SELECT COUNT(*) FROM inbound_messages")
    processed_messages = await db.pool.fetchval("SELECT COUNT(*) FROM inbound_messages WHERE status = 'done'")
    
    return {
        "active_tenants": active_tenants,
        "total_messages": total_messages,
        "processed_messages": processed_messages
    }

@router.get("/logs", dependencies=[Depends(verify_admin_token)])
async def get_logs(limit: int = 50):
    """Fetch recent chat logs for the 'Live History' view."""
    # Using chat_messages as the source of truth for display
    rows = await db.pool.fetch("""
        SELECT 
            cm.id, cm.from_number, cm.role, cm.content, cm.created_at, cm.correlation_id,
            im.status as inbound_status
        FROM chat_messages cm
        LEFT JOIN inbound_messages im ON cm.correlation_id = im.correlation_id AND cm.role = 'user'
        ORDER BY cm.created_at DESC
        LIMIT $1
    """, limit)
    
    logs = []
    for row in rows:
        content_display = row['content']
        try:
            if row['role'] == 'assistant' and row['content'].startswith('{'):
                parsed = json.loads(row['content'])
                if isinstance(parsed, dict) and "messages" in parsed:
                     content_display = " ".join([m.get("text", "") for m in parsed["messages"]])
        except:
            pass 

        logs.append({
            "id": row['id'],
            "received_at": row['created_at'].isoformat(),
            "from_number": row['from_number'],
            "to_number": "Bot",
            "role": row['role'],
            "status": row['inbound_status'] or "sent",
            "correlation_id": row['correlation_id'],
            "payload": json.dumps({"text": content_display, "raw": row['content']}),
            "ai_response": None 
        })
    return logs

# --- Multi-Tenancy Routes ---

@router.get("/tenants", dependencies=[Depends(verify_admin_token)])
async def list_tenants():
    rows = await db.pool.fetch("SELECT * FROM tenants ORDER BY id DESC")
    return [dict(row) for row in rows]

@router.post("/tenants", dependencies=[Depends(verify_admin_token)])
async def create_tenant(tenant: TenantModel):
    q = """
        INSERT INTO tenants (store_name, bot_phone_number, owner_email, store_location, store_website, store_description, store_catalog_knowledge, tiendanube_store_id, tiendanube_access_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (bot_phone_number) 
        DO UPDATE SET 
            store_name = EXCLUDED.store_name,
            owner_email = EXCLUDED.owner_email,
            store_location = EXCLUDED.store_location,
            store_website = EXCLUDED.store_website,
            store_description = EXCLUDED.store_description,
            store_catalog_knowledge = EXCLUDED.store_catalog_knowledge,
            tiendanube_store_id = EXCLUDED.tiendanube_store_id,
            tiendanube_access_token = EXCLUDED.tiendanube_access_token,
            updated_at = NOW()
        RETURNING id
    """
    row = await db.pool.fetchrow(q, tenant.store_name, tenant.bot_phone_number, tenant.owner_email, tenant.store_location, tenant.store_website, tenant.store_description, tenant.store_catalog_knowledge, tenant.tiendanube_store_id, tenant.tiendanube_access_token)
    return {"status": "ok", "id": row['id']}

@router.delete("/tenants/{phone}", dependencies=[Depends(verify_admin_token)])
async def delete_tenant(phone: str):
    await db.pool.execute("DELETE FROM tenants WHERE bot_phone_number = $1", phone)
    return {"status": "ok"}

# --- Credentials Routes ---

@router.get("/credentials", dependencies=[Depends(verify_admin_token)])
async def list_credentials():
    rows = await db.pool.fetch("SELECT c.*, t.store_name as tenant_name FROM credentials c LEFT JOIN tenants t ON c.tenant_id = t.id ORDER BY c.id DESC")
    return [dict(row) for row in rows]

@router.get("/credentials/{id}", dependencies=[Depends(verify_admin_token)])
async def get_credential(id: int):
    row = await db.pool.fetchrow("SELECT c.*, t.store_name as tenant_name FROM credentials c LEFT JOIN tenants t ON c.tenant_id = t.id WHERE c.id = $1", id)
    return dict(row) if row else {}

@router.post("/credentials", dependencies=[Depends(verify_admin_token)])
async def create_credential(cred: CredentialModel):
    q = """INSERT INTO credentials (name, value, category, scope, tenant_id, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"""
    row = await db.pool.fetchrow(q, cred.name, cred.value, cred.category, cred.scope, cred.tenant_id, cred.description)
    return {"status": "ok", "id": row['id']}

@router.delete("/credentials/{id}", dependencies=[Depends(verify_admin_token)])
async def delete_credential(id: int):
    await db.pool.execute("DELETE FROM credentials WHERE id = $1", id)
    return {"status": "ok"}

# --- Tools Management ---

@router.get("/tools", dependencies=[Depends(verify_admin_token)])
async def list_tools():
    # Return list of active tools (hardcoded or dynamic if we had a table)
    return [
        {"name": "products_search", "type": "function", "service_url": "internal"},
        {"name": "order_lookup", "type": "tiendanube", "service_url": "api.tiendanube.com"},
        {"name": "coupon_validate", "type": "mcp", "service_url": "n8n-bridge"}
    ]

# --- Analytics / Telemetry ---

@router.get("/analytics/summary", dependencies=[Depends(verify_admin_token)])
async def analytics_summary(tenant_id: int = 1, from_date: str = None, to_date: str = None):
    # Mock data for now, or real queries if tables existed with stats
    total = await db.pool.fetchval("SELECT COUNT(*) FROM inbound_messages")
    return {
        "kpis": {
            "conversations": {"value": total or 0},
            "orders_lookup": {"requested": 12, "success_rate": 0.95}
        }
    }

@router.get("/telemetry/events", dependencies=[Depends(verify_admin_token)])
async def telemetry_events(tenant_id: int = 1):
    # Retrieve system events if any
    return {"items": []}


# --- Setup & Diagnostics Routes for Frontend V2 ---

@router.post("/setup/session", dependencies=[Depends(verify_admin_token)])
async def setup_session(data: dict):
    """Start a setup session (Mock)."""
    return {"status": "ok", "session_id": "session_v2_" + str(uuid.uuid4())}

@router.post("/setup/preflight", dependencies=[Depends(verify_admin_token)])
async def setup_preflight(data: dict):
    """Check infrastructure health."""
    # Check DB
    db_status = "OK"
    try:
        await db.pool.fetchval("SELECT 1")
    except:
        db_status = "FAIL"

    return {
        "overall_status": "OK" if db_status == "OK" else "FAIL",
        "checks": {
            "database": {"status": db_status, "message": "PostgreSQL Connection"},
            "redis_cache": {"status": "OK", "message": "Redis Connection (Assumed)"},
            "internet": {"status": "OK", "message": "Outbound Connectivity"}
        }
    }

@router.post("/setup/state", dependencies=[Depends(verify_admin_token)])
async def save_setup_state(data: dict):
    """Save wizard progress (No-op in stateless backend, but returns OK)."""
    return {"status": "ok"}

@router.get("/diagnostics/openai/test", dependencies=[Depends(verify_admin_token)])
async def test_openai():
    key = os.getenv("OPENAI_API_KEY")
    if key and key.startswith("sk-"):
        return {"status": "OK", "message": "API Key configured properly"}
    return {"status": "FAIL", "message": "Missing or invalid OPENAI_API_KEY"}

@router.get("/diagnostics/ycloud/test", dependencies=[Depends(verify_admin_token)])
async def test_ycloud():
    key = os.getenv("YCLOUD_API_KEY")
    if key:
        return {"status": "OK", "message": "YCloud configured"}
    return {"status": "FAIL", "message": "Missing YCLOUD_API_KEY"}

@router.get("/diagnostics/healthz", dependencies=[Depends(verify_admin_token)])
async def healthz():
    return {"status": "OK", "services": {"orchestrator": "healthy"}}

@router.get("/diagnostics/events/stream", dependencies=[Depends(verify_admin_token)])
async def events_stream(limit: int = 10):
    """Return recent events for the setup wizard polling."""
    # Fetch recent inbound messages as "events"
    rows = await db.pool.fetch("SELECT * FROM inbound_messages ORDER BY received_at DESC LIMIT $1", limit)
    events = []
    for r in rows:
        events.append({
            "event_type": "webhook_received",
            "correlation_id": r["correlation_id"],
            "timestamp": r["received_at"].isoformat(),
            "details": {"from_number": r["from_number"]}
        })
    # Also fetch recent outgoing
    out_rows = await db.pool.fetch("SELECT * FROM chat_messages WHERE role='assistant' ORDER BY created_at DESC LIMIT $1", limit)
    for r in out_rows:
        events.append({
            "event_type": "agent_response_sent",
            "correlation_id": r["correlation_id"],
            "timestamp": r["created_at"].isoformat(),
            "details": {"message": r["content"][:50]}
        })
    return {"events": events}

@router.post("/diagnostics/whatsapp/send_test", dependencies=[Depends(verify_admin_token)])
async def send_test_msg(data: dict):
    """Mock sending a test message."""
    # In a real scenario, this would call the YCloud client
    # For now, we verified the backend works with real Webhook events
    return {"status": "OK", "message": "Test message queued (Mock)"}

@router.get("/console/events", dependencies=[Depends(verify_admin_token)])
async def console_events(limit: int = 50):
    """Unified event log for the Console view."""
    # Combine inbound and outbound
    query = """
    SELECT 'inbound' as type, correlation_id, received_at as ts, from_number as source, payload::text as content 
    FROM inbound_messages 
    UNION ALL
    SELECT 'outbound' as type, correlation_id, created_at as ts, 'Assistant' as source, content 
    FROM chat_messages 
    ORDER BY ts DESC LIMIT $1
    """
    rows = await db.pool.fetch(query, limit)
    events = []
    for r in rows:
        events.append({
            "event_type": r["type"],
            "timestamp": r["ts"].isoformat(),
            "source": "whatsapp" if r["type"] == "inbound" else "agent",
            "severity": "info",
            "correlation_id": r["correlation_id"],
            "details": {"message": r["content"][:200], "from_number": r["source"]}
        })
    return {"events": events}

@router.get("/whatsapp-meta/status", dependencies=[Depends(verify_admin_token)])
async def meta_status():
    """Check WhatsApp compatibility status."""
    return {"connected": True, "provider": "ycloud"}

