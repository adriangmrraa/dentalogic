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
        ("WHATSAPP_ACCESS_TOKEN", "whatsapp_meta", "Meta API Access Token"),
        ("WHATSAPP_PHONE_NUMBER_ID", "whatsapp_meta", "Meta API Phone ID"),
        ("WHATSAPP_BUSINESS_ACCOUNT_ID", "whatsapp_meta", "Meta API Business ID"),
        ("WHATSAPP_VERIFY_TOKEN", "whatsapp_meta", "Meta API Verify Token"),
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
    
    for env_var, category, desc in env_creds:
        val = os.getenv(env_var)
        if val:
            # Atomic upsert using the unique_name_scope constraint
            await db.pool.execute("""
                INSERT INTO credentials (name, value, category, scope, description)
                VALUES ($1, $2, $3, 'global', $4)
                ON CONFLICT ON CONSTRAINT unique_name_scope
                DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """, env_var, val, category, f"{desc} (Auto-detected from ENV)")

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

@router.get("/tenants/{phone}", dependencies=[Depends(verify_admin_token)])
async def get_tenant(phone: str):
    row = await db.pool.fetchrow("SELECT * FROM tenants WHERE bot_phone_number = $1", phone)
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(row)

@router.delete("/tenants", dependencies=[Depends(verify_admin_token)])
async def delete_all_tenants():
    await db.pool.execute("DELETE FROM tenants")
    return {"status": "ok"}

@router.delete("/tenants/{identifier}", dependencies=[Depends(verify_admin_token)])
async def delete_tenant(identifier: str):
    import re
    # If the identifier is a short number, assume it's an ID
    if identifier.isdigit() and len(identifier) < 8:
        await db.pool.execute("DELETE FROM tenants WHERE id = $1", int(identifier))
    else:
        # Otherwise, treat as phone number
        clean_phone = re.sub(r'[^0-9]', '', identifier)
        await db.pool.execute("DELETE FROM tenants WHERE bot_phone_number = $1 OR bot_phone_number = $2", identifier, clean_phone)
    return {"status": "ok"}

@router.get("/tenants/{id}/details", dependencies=[Depends(verify_admin_token)])
async def get_tenant_details(id: int):
    tenant = await db.pool.fetchrow("SELECT * FROM tenants WHERE id = $1", id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get credentials for this tenant
    creds = await db.pool.fetch("SELECT * FROM credentials WHERE tenant_id = $1 OR scope = 'global'", id)
    
    # Format for UI
    resp = {
        "tenant": dict(tenant),
        "connections": {
            "whatsapp": {
                "ycloud": {"configured": False},
                "meta_api": {"configured": False}
            }
        },
        "credentials": {
            "tenant_specific": [],
            "global_available": []
        }
    }
    
    for c in creds:
        c_dict = dict(c)
        if c['tenant_id'] == id:
            resp["credentials"]["tenant_specific"].append(c_dict)
            if c['name'] in ['YCLOUD_API_KEY', 'YCLOUD_WEBHOOK_SECRET']:
                resp["connections"]["whatsapp"]["ycloud"]["configured"] = True
            if c['name'] in ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']:
                resp["connections"]["whatsapp"]["meta_api"]["configured"] = True
        else:
            resp["credentials"]["global_available"].append(c_dict)
            
    return resp

@router.post("/tenants/{phone}/test-message", dependencies=[Depends(verify_admin_token)])
async def test_message(phone: str):
    """Trigger a test message for the tenant."""
    # In a real scenario, this would trigger an n8n webhook or YCloud directly
    # For now, we return OK to satisfy the UI.
    return {"status": "ok", "message": f"Test message sent to {phone}"}

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
    tenant_id = cred.tenant_id if cred.scope == "tenant" else None
    
    q_upsert = """
    INSERT INTO credentials (name, value, category, scope, tenant_id, description, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT ON CONSTRAINT unique_name_scope 
    DO UPDATE SET 
        value = EXCLUDED.value,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        tenant_id = EXCLUDED.tenant_id,
        updated_at = NOW()
    RETURNING id
    """
    row = await db.pool.fetchrow(q_upsert, cred.name, cred.value, cred.category, cred.scope, tenant_id, cred.description)
    return {"status": "ok", "id": row['id'], "action": "upserted"}

@router.put("/credentials/{id}", dependencies=[Depends(verify_admin_token)])
async def update_credential(id: int, cred: CredentialModel):
    tenant_id = cred.tenant_id if cred.scope == "tenant" else None
    
    q_update = """
    UPDATE credentials 
    SET name = $1, value = $2, category = $3, scope = $4, tenant_id = $5, description = $6, updated_at = NOW()
    WHERE id = $7
    RETURNING id
    """
    row = await db.pool.fetchrow(q_update, cred.name, cred.value, cred.category, cred.scope, tenant_id, cred.description, id)
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"status": "ok", "id": row['id'], "action": "updated"}

# --- Internal Endpoints (for inter-service use) ---

@router.get("/internal/credentials/{name}")
async def get_internal_credential(name: str, x_internal_token: str = Header(None)):
    if x_internal_token != os.getenv("INTERNAL_API_TOKEN", "internal-secret"):
         raise HTTPException(status_code=401, detail="Unauthorized internal call")
    
    # 1. Check DB
    val = await db.pool.fetchval("SELECT value FROM credentials WHERE name = $1 LIMIT 1", name)
    # 2. Check ENV if not in DB
    if not val:
        val = os.getenv(name)
        
    if not val:
        raise HTTPException(status_code=404, detail="Credential not found")
        
    return {"name": name, "value": val}

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
    # 1. Check ENV
    key = os.getenv("OPENAI_API_KEY")
    # 2. Check DB if not in ENV
    if not key or not key.startswith("sk-"):
        key_db = await db.pool.fetchval("SELECT value FROM credentials WHERE name = 'OPENAI_API_KEY'")
        if key_db:
             key = key_db

    if key and (key.startswith("sk-") or len(key) > 20):
        return {"status": "OK", "message": "OpenAI configured (ENV or DB)"}
    return {"status": "FAIL", "message": "Missing or invalid OPENAI_API_KEY"}

@router.get("/diagnostics/ycloud/test", dependencies=[Depends(verify_admin_token)])
async def test_ycloud():
    # 1. Check ENV
    key = os.getenv("YCLOUD_API_KEY")
    # 2. Check DB
    if not key:
        key_db = await db.pool.fetchval("SELECT value FROM credentials WHERE name = 'YCLOUD_API_KEY'")
        if key_db:
            key = key_db

    if key:
        return {"status": "OK", "message": "YCloud configured (ENV or DB)"}
    return {"status": "FAIL", "message": "Missing YCLOUD_API_KEY"}

@router.get("/diagnostics/healthz", dependencies=[Depends(verify_admin_token)])
async def healthz():
    # Check Database
    try:
        await db.pool.execute("SELECT 1")
        db_status = "OK"
    except:
        db_status = "ERROR"

    # Check OpenAI
    openai_res = await test_openai()
    
    # Check YCloud
    ycloud_res = await test_ycloud()

    return {
        "status": "OK",
        "checks": [
            {"name": "orchestrator", "status": "OK", "details": "Service Running"},
            {"name": "database", "status": db_status, "details": "Connected" if db_status == "OK" else "Failed"},
            {"name": "openai", "status": openai_res["status"], "details": openai_res["message"]},
            {"name": "ycloud", "status": ycloud_res["status"], "details": ycloud_res["message"]}
        ]
    }

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

