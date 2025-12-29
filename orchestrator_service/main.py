import os
import json
import hashlib
import time
import uuid
import requests
import re
import redis
import structlog
import httpx
import smtplib
from email.mime.text import MIMEText
from email.utils import formatdate
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union, Literal
from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from contextvars import ContextVar
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# --- Dynamic Context ---
tenant_store_id: ContextVar[Optional[str]] = ContextVar("tenant_store_id", default=None)
tenant_access_token: ContextVar[Optional[str]] = ContextVar("tenant_access_token", default=None)
current_tenant_id: ContextVar[Optional[int]] = ContextVar("current_tenant_id", default=None)
current_conversation_id: ContextVar[Optional[uuid.UUID]] = ContextVar("current_conversation_id", default=None)
current_customer_phone: ContextVar[Optional[str]] = ContextVar("current_customer_phone", default=None)

# Initialize earlys
load_dotenv()

try:
    from langchain.agents import AgentExecutor, create_openai_functions_agent
except ImportError:
    from langchain.agents.agent import AgentExecutor
    from langchain.agents import create_openai_functions_agent

from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.tools import tool
from langchain.memory import ConversationBufferMemory
from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from db import db

# Configuration & Environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
POSTGRES_DSN = os.getenv("POSTGRES_DSN")

# Fallback Tienda Nube credentials (from Env Vars)
GLOBAL_TN_STORE_ID = os.getenv("TIENDANUBE_STORE_ID") or os.getenv("GLOBAL_TN_STORE_ID")
GLOBAL_TN_ACCESS_TOKEN = os.getenv("TIENDANUBE_ACCESS_TOKEN") or os.getenv("GLOBAL_TN_ACCESS_TOKEN")

# Global Fallback Content (only used if DB has no specific tenant config)
GLOBAL_CATALOG_KNOWLEDGE = os.getenv("GLOBAL_CATALOG_KNOWLEDGE")
GLOBAL_SYSTEM_PROMPT = os.getenv("GLOBAL_SYSTEM_PROMPT")
GLOBAL_STORE_WEBSITE = os.getenv("STORE_WEBSITE", "https://www.pointecoach.shop")

# Handoff Configuration (ENV)
HANDOFF_EMAIL = os.getenv("HANDOFF_EMAIL") or os.getenv("HANDOFF_TARGET_EMAIL")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME")
SMTP_PASS = os.getenv("SMTP_PASS") or os.getenv("SMTP_PASSWORD")
SMTP_SEC = os.getenv("SMTP_SECURITY", "SSL").upper()

# --- Initialize Structlog ---

if not OPENAI_API_KEY:
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        print("CRITICAL ERROR: OPENAI_API_KEY not found.")

# Initialize Structlog
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

# Initialize Redis
redis_client = redis.from_url(REDIS_URL)

# --- Shared Models ---
# --- Shared Models ---
class ToolError(BaseModel):
    code: str = Field(..., description="Error code")
    message: str
    retryable: bool
    details: Optional[Dict[str, Any]] = None

# FastAPI App
from contextlib import asynccontextmanager
from utils import encrypt_password, decrypt_password
from admin_routes import router as admin_router, sync_environment

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to DB
    try:
        if not POSTGRES_DSN:
            logger.error("missing_postgres_dsn", note="Check environment variables")
            raise ValueError("POSTGRES_DSN is not set")

        await db.connect()
        logger.info("db_connected")
        
        # Migration Steps - Executed Sequentially
        migration_steps = [
            # 1. Tenants Table
            """
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                store_name TEXT NOT NULL,
                bot_phone_number TEXT UNIQUE NOT NULL,
                owner_email TEXT,
                store_location TEXT,
                store_website TEXT,
                store_description TEXT,
                store_catalog_knowledge TEXT,
                tiendanube_store_id TEXT,
                tiendanube_access_token TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            """,
            # 1b. Pre-clean Handoff Config (Drop if broken)
            """
            DO $$
            BEGIN
                -- If table exists but lacks PK (broken state from previous edits), drop it to allow fresh creation.
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_human_handoff_config') 
                   AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_human_handoff_config_pkey') THEN
                   
                   DROP TABLE tenant_human_handoff_config CASCADE;
                END IF;
            END $$;
            """,
            # 1c. Tenant Human Handoff Config (Final Spec + Consistency)
            """
            CREATE TABLE IF NOT EXISTS tenant_human_handoff_config (
                tenant_id INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                destination_email TEXT NOT NULL,
                handoff_instructions TEXT, 
                handoff_message TEXT,
                smtp_host TEXT NOT NULL,
                smtp_port INTEGER NOT NULL,
                smtp_security TEXT NOT NULL DEFAULT 'SSL', -- SSL | STARTTLS | NONE
                smtp_username TEXT NOT NULL,
                smtp_password_encrypted TEXT NOT NULL,
                triggers JSONB NOT NULL DEFAULT '{}',
                email_context JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            """,
            # 2. Credentials Table
            """
            CREATE TABLE IF NOT EXISTS credentials (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                value TEXT NOT NULL,
                category TEXT,
                scope TEXT DEFAULT 'global',
                tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
                description TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT unique_name_scope UNIQUE(name, scope)
            );
            """,
            # 3. Credentials Repair (DO block)
            """
            DO $$ 
            BEGIN 
                -- Check for updated_at column
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credentials' AND column_name='updated_at') THEN
                    ALTER TABLE credentials ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
                END IF;

                -- Check for UNIQUE constraint (name, scope)
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'unique_name_scope' AND conrelid = 'credentials'::regclass
                ) THEN
                    BEGIN
                        ALTER TABLE credentials ADD CONSTRAINT unique_name_scope UNIQUE(name, scope);
                    EXCEPTION WHEN others THEN
                        RAISE NOTICE 'Could not add unique constraint to credentials - likely duplicates exist';
                    END;
                END IF;
            END $$;
            """,
            # 4. PGCryto Extension
            """
            DO $$
            BEGIN
                CREATE EXTENSION IF NOT EXISTS pgcrypto;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not create extension pgcrypto - assuming it exists or not needed if manually handling UUIDs';
            END $$;
            """,
            # 5. Chat Conversations
            """
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id UUID PRIMARY KEY,
                tenant_id INTEGER REFERENCES tenants(id),
                channel VARCHAR(32) NOT NULL, 
                external_user_id VARCHAR(128) NOT NULL,
                display_name VARCHAR(255),
                avatar_url TEXT,
                status VARCHAR(32) NOT NULL DEFAULT 'open',
                human_override_until TIMESTAMPTZ,
                last_message_at TIMESTAMPTZ,
                last_message_preview TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (channel, external_user_id) 
            );
            """,
            # 6. Chat Conversations Repair
            """
            DO $$
            BEGIN
                ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
                ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
                ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT;
                ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS human_override_until TIMESTAMPTZ;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Schema repair failed for chat_conversations';
            END $$;
            """,
            # 7. Chat Conversations Constraint
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_conversations_tenant_channel_user_key') THEN
                     ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_tenant_channel_user_key UNIQUE (tenant_id, channel, external_user_id);
                END IF;
            EXCEPTION WHEN OTHERS THEN
                 RAISE NOTICE 'Could not constraint unique chat_conversations';
            END $$;
            """,
            # 8. Chat Media
            """
            CREATE TABLE IF NOT EXISTS chat_media (
                id UUID PRIMARY KEY,
                tenant_id INTEGER, 
                channel VARCHAR(32) NOT NULL,
                provider_media_id VARCHAR(128),
                media_type VARCHAR(32) NOT NULL,
                mime_type VARCHAR(64),
                file_name VARCHAR(255),
                file_size INTEGER,
                storage_url TEXT NOT NULL,
                preview_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """,
            # 9. Chat Messages
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY,
                tenant_id INTEGER, 
                conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
                role VARCHAR(32) NOT NULL,
                message_type VARCHAR(32) NOT NULL DEFAULT 'text',
                content TEXT,
                media_id UUID REFERENCES chat_media(id),
                human_override BOOLEAN NOT NULL DEFAULT false,
                sent_by_user_id TEXT, 
                sent_from VARCHAR(64),
                sent_context VARCHAR(64),
                ycloud_message_id VARCHAR(128),
                provider_status VARCHAR(32),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """,
            # 9b. Chat Messages Repair (Comprehensive Repair to avoid missing columns and fix legacy ID type)
            """
            DO $$
            BEGIN
                -- If ID is integer (legacy), we must drop it and recreate correctly
                IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'id') != 'uuid' THEN
                    DROP TABLE IF EXISTS chat_messages CASCADE;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not check/drop chat_messages';
            END $$;
            """,
            # Re-create if dropped (Duplicate of step 9 basically, but safe)
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY,
                tenant_id INTEGER, 
                conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
                role VARCHAR(32) NOT NULL,
                message_type VARCHAR(32) NOT NULL DEFAULT 'text',
                content TEXT,
                media_id UUID REFERENCES chat_media(id),
                human_override BOOLEAN NOT NULL DEFAULT false,
                sent_by_user_id TEXT, 
                sent_from VARCHAR(64),
                sent_context VARCHAR(64),
                ycloud_message_id VARCHAR(128),
                provider_status VARCHAR(32),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                correlation_id TEXT,
                from_number VARCHAR(128)
            );
            """,
            # Ensure columns in case table existed but was missing those
            """
            DO $$
            BEGIN
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS correlation_id TEXT;
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS from_number VARCHAR(128);
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(32) DEFAULT 'text';
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_id UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Schema repair failed for chat_messages';
            END $$;
            """,
            # 10. System Events
            """
            CREATE TABLE IF NOT EXISTS system_events (
                id SERIAL PRIMARY KEY,
                level VARCHAR(16) NOT NULL, -- info, warn, error
                event_type VARCHAR(64) NOT NULL, -- http_request, tool_use, system
                message TEXT,
                metadata JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """,
            # 11. Indexes
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, created_at);",
            "CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant ON chat_conversations (tenant_id, updated_at DESC);",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_media ON chat_messages (media_id);",
            
            # 12. Advanced Features Columns
            """
            DO $$
            BEGIN
                ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0;
                ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tool_calls BIGINT DEFAULT 0;
            END $$;
            """,
            
            # 13. Update Prompt
            """
            UPDATE tenants 
            SET system_prompt_template = 'Eres el asistente virtual de {STORE_NAME}.

REGLAS CRÍTICAS DE RESPUESTA:
1. SALIDA: Responde SIEMPRE con el formato JSON de OrchestratorResponse (una lista de objetos "messages").
2. ESTILO: Tus respuestas deben ser naturales y amigables. El contenido de los mensajes NO debe parecer datos crudos.
3. FORMATO DE LINKS: NUNCA uses formato markdown [texto](url). Escribe la URL completa y limpia en su propia línea nueva.
4. SECUENCIA DE BURBUJAS (8 pasos para productos):
   - Burbuja 1: Introducción amigable (ej: "Saluda si te han saludado, luego di Te muestro opciones de bolsos disponibles...").
   - Burbuja 2: SOLO la imageUrl del producto 1.
   - Burbuja 3: Nombre, precio, VARIANTES (Colores/Talles resumidos en misma línea). Luego un salto de línea y la URL del producto.
   - Burbuja 4: SOLO la imageUrl del producto 2.
   - Burbuja 5: DESCRIPCIÓN (breve y fiel). Luego un salto de línea. Nombre, precio, VARIANTES. Luego URL producto.
   - Burbuja 6: SOLO la imageUrl del producto 3 (si hay).
   - Burbuja 7: DESCRIPCIÓN (breve y fiel). Luego un salto de línea. Nombre, precio, VARIANTES. Luego URL producto.
   - Burbuja 8: CTA Final con la URL general ({STORE_URL}) en una línea nueva o invitación a Fitting si son puntas.
5. FITTING: Si el usuario pregunta por "zapatillas de punta" por primera vez, recomienda SIEMPRE un fitting en la Burbuja 8.
6. NO inventes enlaces. Usa los devueltos por las tools. NUNCA inventes descripción, usa la provista.
7. USO DE CATALOGO: Tu variable {STORE_CATALOG_KNOWLEDGE} contiene las categorías y marcas reales.
   - Antes de llamar a `search_specific_products`, REVISA el catálogo.
   - Si el usuario pide "bolsos", mira que marcas de bolsos hay y busca por marca o categoría exacta (ej: `search_specific_products("Bolsos")`).
   - Evita `browse_general_storefront` si hay un término de búsqueda claro.
GATE: Usa `search_specific_products` SIEMPRE que pidan algo específico.
CONTEXTO DE LA TIENDA:
{STORE_DESCRIPTION}
CATALOGO:
{STORE_CATALOG_KNOWLEDGE}'
            WHERE store_name = 'Pointe Coach' OR id = 39;
            """
        ]
        
        # Execute migration steps sequentially
        for i, step in enumerate(migration_steps):
            try:
                if step.strip():
                    await db.pool.execute(step)
            except Exception as step_err:
                logger.error(f"migration_step_failed_ignored", step_index=i, error=str(step_err))
                # We continue despite errors to try to apply as much as possible
        
        logger.info("db_migrations_applied")
        
        # Sync Environment Tenants - Called AFTER migrations to ensure tables exist
        try:
            await sync_environment()
            logger.info("environment_synced")
        except Exception as e:
            logger.error("environment_sync_failed", error=str(e))
    except Exception as e:
        logger.error("startup_critical_error", error=str(e), dsn_preview=POSTGRES_DSN[:15] if POSTGRES_DSN else "None")
        # Optimization: We let it start, but health checks will fail.
        # However, for debugging, let's stop it if it's a gaierror to force visibility.
        if "Name or service not known" in str(e):
             print(f"CRITICAL DNS ERROR: Cannot resolve database host. Check your POSTGRES_DSN: {POSTGRES_DSN}")
             raise e
    
    yield
    
    # Shutdown: Disconnect DB
    await db.disconnect()
    logger.info("db_disconnected")

# FastAPI App Initialization
app = FastAPI(
    title="Orchestrator Service",
    description="Central intelligence for Kilocode microservices.",
    version="1.1.0",
    lifespan=lifespan
)

# Root Endpoint for basic health checks (Traefik/EasyPanel)
@app.get("/")
async def root():
    return {"status": "ok", "service": "orchestrator", "version": "1.1.0"}

# Health check (Standard)
@app.get("/health")
async def health_check_std():
    return {"status": "ok", "service": "orchestrator"}

class ToolResponse(BaseModel):
    ok: bool
    data: Optional[Any] = None
    error: Optional[ToolError] = None
    meta: Optional[Dict[str, Any]] = None

class InboundMedia(BaseModel):
    type: str
    url: str
    mime_type: Optional[str] = None
    file_name: Optional[str] = None
    provider_id: Optional[str] = None

class InboundChatEvent(BaseModel):
    provider: str
    event_id: str
    provider_message_id: str
    from_number: str
    to_number: Optional[str] = None
    text: Optional[str] = None # made optional for pure media messages
    customer_name: Optional[str] = None
    event_type: str
    correlation_id: str
    media: Optional[List[InboundMedia]] = None

class OrchestratorMessage(BaseModel):
    part: Optional[int] = Field(None, description="The sequence number of this message.")
    total: Optional[int] = Field(None, description="The total number of messages.")
    text: Optional[str] = Field(None, description="The text content of this message burst.")
    imageUrl: Optional[str] = Field(None, description="The URL of the product image (images[0].src from tools), or null if no image is available.")

class OrchestratorResult(BaseModel):
    status: Literal["ok", "duplicate", "ignored", "error"]
    send: bool
    text: Optional[str] = None
    messages: List[OrchestratorMessage] = Field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None


# (Middleware and app instance moved to top)

# --- Include Admin Router ---
app.include_router(admin_router)

# Metrics
SERVICE_NAME = "orchestrator_service"
REQUESTS = Counter("http_requests_total", "Total Request Count", ["service", "endpoint", "method", "status"])
LATENCY = Histogram("http_request_latency_seconds", "Request Latency", ["service", "endpoint"])
TOOL_CALLS = Counter("tool_calls_total", "Total Tool Calls", ["tool", "status"])

# --- Tools & Helpers ---
def get_cached_tool(key: str):
    try:
        data = redis_client.get(f"cache:tool:{key}")
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error("cache_read_error", error=str(e))
    return None

# --- Tools & Helpers ---
MCP_URL = os.getenv("MCP_URL", "https://n8n-n8n.qvwxm2.easypanel.host/mcp/d36b3e5f-9756-447f-9a07-74d50543c7e8")

async def call_mcp_tool(tool_name: str, arguments: dict):
    """Bridge to call tools on n8n MCP server with stateful session and SSE support."""
    logger.info("mcp_handshake_start", tool=tool_name)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            }
            
            # 1. Initialize
            init_payload = {
                "jsonrpc": "2.0",
                "id": "init-" + str(uuid.uuid4())[:8],
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "Orchestrator-Bridge", "version": "1.0"}
                }
            }
            init_resp = await client.post(MCP_URL, json=init_payload, headers=headers)
            
            if init_resp.status_code != 200:
                return f"MCP Init Failed ({init_resp.status_code}): {init_resp.text}"
            
            # Capture Mcp-Session-Id
            session_id = init_resp.headers.get("Mcp-Session-Id")
            if not session_id:
                try:
                    result = init_resp.json().get("result", {})
                    session_id = result.get("meta", {}).get("sessionId") or result.get("sessionId")
                except: pass
            
            if session_id:
                logger.info("mcp_session_captured", session_id=session_id)
                client.headers.update({"Mcp-Session-Id": session_id})

            # 2. Notifications/initialized
            notif_payload = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }
            await client.post(MCP_URL, json=notif_payload, headers=headers)

            # 3. Call Tool
            call_payload = {
                "jsonrpc": "2.0",
                "id": "call-" + str(uuid.uuid4())[:8],
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }
            
            all_text = ""
            async with client.stream("POST", MCP_URL, json=call_payload, headers=headers) as resp:
                if resp.status_code != 200:
                    raw_text = await resp.aread()
                    return f"MCP Tool Call Error {resp.status_code}: {raw_text.decode()}"

                async for line in resp.aiter_lines():
                    if not line: continue
                    if line.startswith("data: "):
                        data_json = line[6:]
                        try:
                            msg = json.loads(data_json)
                            if msg.get("id") == call_payload["id"] or "result" in msg or "error" in msg:
                                if "result" in msg: return msg["result"]
                                if "error" in msg: return f"MCP Tool Error: {msg['error']}"
                        except: pass
                    all_text += line + "\n"

            if not all_text.strip():
                return "MCP Server returned an empty response."
            
            try:
                json_resp = json.loads(all_text)
                if "result" in json_resp: return json_resp["result"]
                return json_resp
            except:
                return all_text
                
    except Exception as e:
        logger.error("mcp_bridge_error", tool=tool_name, error=str(e))
        await log_db("error", "tool_execution_failed", f"MCP Tool {tool_name} failed: {str(e)}", {"tool": tool_name})
        return f"MCP Bridge Exception: {str(e)}"

def get_cached_tool(key: str):
    try:
        data = redis_client.get(f"cache:tool:{key}")
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error("cache_read_error", error=str(e))
    return None

def set_cached_tool(key: str, data: dict, ttl: int = 300):
    try:
        redis_client.setex(f"cache:tool:{key}", ttl, json.dumps(data))
    except Exception as e:
        logger.error("cache_write_error", error=str(e))

def simplify_product(p):
    """Keep only essential fields for the LLM to save tokens."""
    if not isinstance(p, dict): return p
    
    # Simplify variants to just a summary of options if needed, or specific prices
    variants = p.get("variants") or []
    if not isinstance(variants, list): variants = []
    
    price = "0"
    promo_price = None
    variant_details = []
    
    if variants:
        v0 = variants[0] if isinstance(variants[0], dict) else {}
        price = v0.get("price", "0")
        promo_price = v0.get("promotional_price", None)
        
        # Summarize variants (e.g., "Color: Rojo, Azul")
        seen_options = set()
        for v in variants:
            if not isinstance(v, dict): continue
            v_values = v.get("values") or []
            if isinstance(v_values, list):
                for val in v_values:
                    if isinstance(val, dict):
                        val_str = val.get("es") or val.get("en") 
                        if val_str: seen_options.add(val_str)
        
        if seen_options:
            variant_details = list(seen_options)

    # Extract first image URL
    image_url = None
    images = p.get("images") or []
    if isinstance(images, list) and len(images) > 0:
        img0 = images[0]
        if isinstance(img0, dict):
            image_url = img0.get("src")

    # Extract and clean description (ROBUST)
    desc_obj = p.get("description")
    raw_desc = ""
    if isinstance(desc_obj, dict):
        raw_desc = desc_obj.get("es", "")
    elif isinstance(desc_obj, str):
        raw_desc = desc_obj
    else:
        # Fallback to 'descripción' field if exists
        raw_desc = p.get("descripción", "") or ""

    if not isinstance(raw_desc, str): raw_desc = ""

    # Remove simple HTML tags for token saving
    clean_desc = re.sub('<[^<]+?>', '', raw_desc)
    # Truncate if too long (e.g. 300 chars)
    if len(clean_desc) > 300:
        clean_desc = clean_desc[:297] + "..."

    return {
        "id": p.get("id"),
        "name": p.get("name", {}).get("es", "Sin nombre"),
        "price": price,
        "promotional_price": promo_price,
        "description": clean_desc, 
        "variants": ", ".join(variant_details), 
        "url": p.get("canonical_url"),
        "imageUrl": image_url
    }

async def call_tiendanube_api(endpoint: str, params: dict = None):
    # Retrieve credentials STRICTLY from Environment Variables (as requested)
    store_id = GLOBAL_TN_STORE_ID
    token = GLOBAL_TN_ACCESS_TOKEN

    if not store_id or not token:
        # Debug: Check if vars are actually empty
        logger.error("tiendanube_config_missing", 
                     store_id=store_id, 
                     has_token=bool(token),
                     context_note="Global Env Vars are missing. Check .env")
        return "Error: Store ID or Token not configured in Environment Variables."

    headers = {
        "Authentication": f"bearer {token}",
        "User-Agent": os.getenv("TIENDANUBE_USER_AGENT", "Orchestrator-Agent/1.0"),
        "Content-Type": "application/json"
    }
    try:
        url = f"https://api.tiendanube.com/v1/{store_id}{endpoint}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code != 200:
                logger.error("tiendanube_api_error", status=response.status_code, text=response.text[:200])
                return f"Error HTTP {response.status_code}: {response.text}"
            
            data = response.json()
            
            # Auto-simplify if it's a list of products
            if isinstance(data, list) and "/products" in endpoint:
                return [simplify_product(p) for p in data]
                
            return data
    except Exception as e:
        logger.error("tiendanube_request_exception", error=str(e))
        await log_db("error", "external_api_error", f"TiendaNube API failed: {endpoint}", {"error": str(e)})
        return f"Request Error: {str(e)}"

@tool
async def search_specific_products(q: str):
    """SEARCH for specific products by name, category, or brand. REQUIRED for queries like 'medias', 'zapatillas', 'puntas', 'grishko'. Input 'q' is the keyword."""
    cache_key = f"productsq:{q}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = await call_tiendanube_api("/products", {"q": q, "per_page": 3})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
async def search_by_category(category: str, keyword: str):
    """Search for products by category and keyword in Tienda Nube. Returns top 3 results simplified."""
    q = f"{category} {keyword}"
    cache_key = f"search_by_category:{category}:{keyword}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = await call_tiendanube_api("/products", {"q": q, "per_page": 3})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
async def browse_general_storefront():
    """Browse the generic storefront (latest items). Use ONLY for vague requests like 'what do you have?' or 'show me catalogue'. DO NOT USE for specific items."""
    cache_key = "productsall"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = await call_tiendanube_api("/products", {"per_page": 3})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
async def cupones_list():
    """List active coupons and discounts from Tienda Nube via n8n MCP."""
    return await call_mcp_tool("cupones_list", {})

@tool
async def orders(q: str):
    """Search for order information directly in Tienda Nube API.
    Pass the order ID (without #) to retrieve status and details."""
    clean_q = q.replace("#", "").strip()
    # Using search parameter 'q' as seen in the successful n8n config
    return await call_tiendanube_api("/orders", {"q": clean_q})

@tool
async def sendemail(subject: str, text: str):
    """Send an email to support or customer via n8n MCP."""
    return await call_mcp_tool("sendemail", {"Subject": subject, "Text": text})

@tool
async def derivhumano(reason: str, contact_name: Optional[str] = None, contact_phone: Optional[str] = None, summary: Optional[str] = None, action_required: Optional[str] = None):
    """EQUIPO/HUMANO: Use this tool to derive the conversation to a human operator via email and lock the AI. 
    Inputs:
    - reason: The main reason for handoff.
    - contact_name: Name of the customer.
    - contact_phone: Phone of the customer.
    - summary: 1-3 lines summary of the conversation.
    - action_required: What should the human do?"""
    
    tid = current_tenant_id.get()
    cid = current_conversation_id.get()
    cphone = current_customer_phone.get()
    
    if not tid or not cid:
        return "Error: Context not initialized for handoff."

    # 1. Resolve Handoff Settings (ENV First, then DB)
    target_email = HANDOFF_EMAIL
    h_smtp_host = SMTP_HOST
    h_smtp_port = SMTP_PORT
    h_smtp_user = SMTP_USER
    h_smtp_pass = SMTP_PASS
    h_smtp_sec = SMTP_SEC
    
    store_name = os.getenv("STORE_NAME", "Pointe Coach")
    handoff_msg = "Te derivo con una persona del equipo para ayudarte mejor 😊"

    # STRICT ENV ONLY - No DB Lookup for Handoff Config
    # If tid exists, we still rely on global env vars as per user request.

    if not target_email or not h_smtp_host or not h_smtp_user or not h_smtp_pass:
        logger.warning("handoff_config_incomplete", email=bool(target_email), host=bool(h_smtp_host))
        return "Error: Handoff configuration (SMTP or Target Email) is incomplete. Please check environment variables (HANDOFF_EMAIL, SMTP_HOST, etc.)."

    # 2. Build Content
    wa_id = cphone or contact_phone or "Oculto"
    user_name = contact_name or 'No especificado'
    wa_link = f"https://wa.me/{wa_id}" if wa_id != "Oculto" else "No disponible"
    
    subject = f"Derivación Humana: {reason} - {user_name}"
    body = f"""DETALLE DE DERIVACIÓN (EQUIPO {store_name.upper()})
 
Motivo: {reason}
Cliente: {user_name}
Teléfono: {wa_id}
Link WhatsApp: {wa_link}

RESUMEN RECIENTE:
{summary or 'Sin resumen de historial'}

ACCIÓN REQUERIDA:
{action_required or 'Atención inmediata'}

Conversation ID: {cid}
Tienda: {store_name}
"""

    # 3. SMTP Send
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = h_smtp_user
        msg['To'] = target_email
        msg['Date'] = formatdate(localtime=True)

        if h_smtp_sec == 'SSL':
            with smtplib.SMTP_SSL(h_smtp_host, h_smtp_port) as server:
                server.login(h_smtp_user, h_smtp_pass)
                server.send_message(msg)
        elif h_smtp_sec == 'STARTTLS':
            with smtplib.SMTP(h_smtp_host, h_smtp_port) as server:
                server.starttls()
                server.login(h_smtp_user, h_smtp_pass)
                server.send_message(msg)
        else: # NONE or fallback
            with smtplib.SMTP(h_smtp_host, h_smtp_port) as server:
                server.login(h_smtp_user, h_smtp_pass)
                server.send_message(msg)
        
        # 4. Lock Conversation (24h)
        if cid:
             await db.pool.execute("""
                 UPDATE chat_conversations 
                 SET human_override_until = NOW() + INTERVAL '24 hours',
                     status = 'human_handling'
                 WHERE id = $1
             """, cid)
        
        logger.info("handoff_email_sent_smtp", to=target_email, host=h_smtp_host, locking_cid=cid)

        return f"Email sent to human agent. Conversation locked for 24h. Tell the user: '{handoff_msg}'"
            
    except Exception as e:
        logger.error("handoff_email_failed", error=str(e))
        await log_db("error", "handoff_email_failed", str(e), {"tid": tid, "cid": str(cid)})
        return f"Error sending handoff email: {str(e)}"

tools = [search_specific_products, search_by_category, browse_general_storefront, cupones_list, orders, derivhumano]

from langchain.output_parsers import PydanticOutputParser
from langchain_core.messages import HumanMessage, AIMessage

# --- Output Schema for Agent ---
class OrchestratorResponse(BaseModel):
    """The structured response from the orchestrator agent containing multiple messages."""
    messages: List[OrchestratorMessage] = Field(description="List of messages (parts) to send to the user, in order.")

# Initialize Parser
parser = PydanticOutputParser(pydantic_object=OrchestratorResponse)

# Agent Initialization
# --- Agent Factory (Dynamic per Tenant) ---
async def get_agent_executable(tenant_phone: str = None):
    """
    Creates an AgentExecutor dynamically.
    PRIORITY: Always use Environment Variables for this single-tenant deployment. 
    The DB is only used for chat memory consistency.
    """
    # 1. Ensure DB connection (only for memory persistence later)
    if not db.pool:
        await db.connect()

    # 2. Resolve Configuration from Environment Variables (STRICT SINGLE TENANT)
    # NO DB LOOKUP for settings.
    store_name = os.getenv("STORE_NAME", "Pointe Coach")
    store_description = os.getenv("STORE_DESCRIPTION", "tienda de artículos de danza clásica y contemporánea")
    store_catalog = os.getenv("STORE_CATALOG_KNOWLEDGE", "")
    store_website = os.getenv("STORE_WEBSITE", "https://www.pointecoach.shop")
    SHIPPING_PARTNERS = os.getenv("SHIPPING_PARTNERS", "Correo Argentino y principales logísticas")
    
    # 3. Resolve Credentials from Environment Variables
    # 3. Resolve Credentials from Environment Variables
    current_openai_key = os.getenv("OPENAI_API_KEY")
    current_tn_store_id = GLOBAL_TN_STORE_ID
    current_tn_access_token = GLOBAL_TN_ACCESS_TOKEN

    # Set context variables for tools to consume
    if current_tn_store_id and current_tn_access_token:
        tenant_store_id.set(current_tn_store_id)
        tenant_access_token.set(current_tn_access_token)
    
    # 4. Construct System Prompt
    sys_template = f"""Eres el asistente virtual de {store_name} ({store_description}).

PRIORIDADES (ORDEN ABSOLUTO)

1. SALIDA: tu respuesta final SIEMPRE debe cumplir el schema del Output Parser (JSON válido).
2. VERACIDAD: para catálogo/pedidos/cupones usás tools; está prohibido inventar.
3. SI UNA TOOL DEVUELVE PRODUCTOS: los mostrás (según reglas). Prohibido responder solo con descripción general si hay productos devueltos.
4. ANTI-BUCLE: si ya hiciste 1 pregunta y el usuario respondió, el próximo turno debe avanzar (ejecutar tool / mostrar opciones / resolver). Prohibido encadenar preguntas.

OBJETIVO

* Ayudar a elegir productos según necesidad/nivel/presupuesto.
* Confirmar precio, stock, talles/variantes, link directo e imagen cuando existan en tool.
* Guiar compra (talles, envíos, retiros, pagos).
* Informar estado de pedido si comparten número de orden.
* Derivar a humano cuando corresponda vía `derivhumano`.
* Si hay intención de “puntas” o “mediapuntas” y la consulta es general, mostrar opciones del catálogo (máx 3).

REGLA DE VERACIDAD (CRÍTICA)

* Prohibido inventar: precios, stock, variantes, links, imágenes, estados de pedidos, cupones.
* Link e imageUrl solo pueden ser valores exactos devueltos por tools. Nunca construyas URLs ni “arregles” dominios/rutas.
* Prohibido “completar” productos: solo mostrar productos existentes en outputs de tools.

GATE ABSOLUTO DE CATÁLOGO (INNEGOCIABLE)

* Si el mensaje del usuario menciona una categoría (ej: "accesorios", "bolsos", "leotardos", "medias", "puntas") o un producto, debés ejecutar una tool de búsqueda INMEDIATAMENTE. No pidas más detalles si la categoría es clara.
* **Consultas vagas/banales:** Si el usuario pregunta de forma general ("¿Qué tienen?", "Mostrame algo lindo", "No sé qué elegir"), no repreguntes. Ejecutá `browse_general_storefront` inmediatamente y mostrá 3 opciones reales del catálogo.
* Está prohibido enviar nombres de productos, precios, links o imágenes si NO hubo tool de catálogo ejecutada con éxito en ese turno.
* Regla anti-fuga: si la búsqueda no devuelve resultados, explicá que no encontraste nada exacto bajo ese término y sugerí buscar por una marca o modelo específico. NUNCA inventes productos.

PARCHE CRÍTICO — ANTI “RESPUESTA SIN TOOL”

* Para CUALQUIER consulta de catálogo (incluye accesorios como cintas, elásticos, punteras, protectores, medias, etc.), antes de listar opciones debés ejecutar una tool de catálogo (`search_specific_products` / `search_by_category` / `browse_general_storefront`).
* Si no se ejecutó una tool, si falló, o si devolvió vacío/irrelevante: está prohibido listar productos, precios, links o imágenes.
* Se considera invención cualquier URL o imagen aunque parezca plausible si no fue devuelta explícitamente por la tool.
* Si el usuario pide “¿qué tienen disponible?”: siempre responder con productos reales del catálogo o, si no hay resultados, pedir 1 dato concreto para buscar mejor.

TONO Y PERSONALIDAD (ARGENTINA "BUENA ONDA")

* **Estilo:** Hablá como una compañera de danza experta. Usá "vos", sé cálida y empática.
* **Puntuación (ESTRICTO):** Usá solo el signo de pregunta al final (`?`), nunca el de apertura (`¿`). Evitá el exceso de signos de admiración; si los usás, solo al final (`!`) y de forma muy medida.
* **Prohibido:** No uses "usted", "su", "has", "podéis". No uses frases de telemarketing.
* **Naturalidad:** Usá frases puente como "Mirá", "Te cuento", "Fijate", "Dale".
* **Empatía:** Si el usuario te pregunta "¿Cómo estás?", respondé con calidez y preguntale a él también antes de avanzar. Si el usuario tiene dudas o problemas (talle, dolor), validá su sentimiento ("Te re entiendo, es difícil dar con el talle online").
* **Modismos permitidos:** "Dale", "Genial", "Bárbaro", "Divinas", "Te cuento", "Fijate", "Cualquier cosa", "Obvio".
* **Conectores:** "Por las dudas", "Lo bueno es que...", "Ojo que...".
* **Cierre:** "Avisame y lo seguimos viendo", "Cualquier duda estoy acá".

REGLAS DE INTERACCIÓN (CHISTE VS TÉCNICO)

1. **PROHIBIDO SER TÉCNICO:** No actúes como especialista en biomecánica ni hagas comparaciones técnicas profundas entre productos.
2. **DERIVACIÓN OBLIGATORIA:** Si el usuario empieza a hacer preguntas técnicas, comparativas o complejas sobre productos (más allá de precio/stock/foto), USÁ LA TOOL `derivhumano` INMEDIATAMENTE. Avisale: "Para esas dudas más puntuales, te derivo con una especialista del equipo así te asesora bien."
3. **CUIDADOS:** No des guías de "cómo cuidar tus zapatillas". Derivá o sé muy breve.
4. **PEDIDOS:** Al informar estado de pedidos, sé ULTRA BREVE. No expliques procesos largos. Dato y listo.
5. **FITTING:** Solo da argumentos breves del por qué: "Porque cada pie es único y así evitamos que te lastimes o gastes mal."
6. **ENVÍOS:** Trabajamos con {SHIPPING_PARTNERS}. PROHIBIDO dar precios o tiempos de entrega. Tu única respuesta permitida es: "El costo y tiempo de envío se calculan al final de la compra según tu ubicación." No inventes otros datos.

PRIMERA INTERACCIÓN (SALUDO Cálido)
* Si hay intención de búsqueda: SALUDO + TOOL + RESULTADOS en el mismo turno.
* Si es SOLO saludo: 
  1. “Hola! ¿Cómo estás? Soy del equipo de Pointe Coach.” 
  2. Si te preguntan cómo estás: respondé con calidez (ej: "¡Bien, todo bárbaro por acá! ¿Vos cómo estás?").
  3. Cerrá siempre con: "¿En qué te ayudo?" (respetando la regla de puntuación).

REGLAS DE FLUJO (ANTI-BUCLE)
* Si categoría definida: NO repreguntar. Ejecutar tool.
* “Sí, mostrame” = obligación de tool.
* Anti-placeholder: nunca enviar a tools valores vacíos.
* Si q NO contiene la categoría detectada (ver Router): No llames tools, corregí q.

TOOLS DISPONIBLES (NOMBRES EXACTOS)
1. `search_specific_products`: busca por keyword (q). q DEBE incluir categoría + marca/modelo.
2. `search_by_category`: category + keyword.
3. `browse_general_storefront`: USAR SIEMPRE para consultas vagas ("¿Qué tienen?", "Mostrame algo") o como último recurso. No repreguntar, mostrar productos.
4. `cupones_list`: promos.
5. `orders`: estado pedido (q=número).
6. `derivhumano`: derivación.

ROUTER DE CATEGORÍA
* ZAPATILLAS DE PUNTA: “puntas”, “pointe”
* MEDIA PUNTA: “media punta”, “ballet”, “slippers”
* MEDIAS: “medias”, “panty”, “socks”, “convertibles”
* ACCESORIOS: “punteras”, “cintas”, “elásticos”, “protector”
* BOLSOS: “bolso”, “mochila”, “bag”
* LEOTARDOS: “leotardo”, “maillot”, “malla”

REGLA DE RESULTADOS (CANTIDAD)
* OBJETIVO PRINCIPAL: Mostrar 3 OPCIONES si la tool devuelve suficientes resultados.
* ESCASEZ: Si hay menos de 3 (1 o 2), mostrá solo los que hay. En este caso, el CTA debe aclarar: "Estos son los únicos modelos disponibles por ahora" o "En la web hay más variedad".
* Prohibido inventar productos para llenar los 3 espacios.
* Prohibido mostrar solo 1 si la tool devolvió 3 o más (no seas perezoso).

REGLA DE CALL TO ACTION (CIERRE OBLIGATORIO)
* El último mensaje de tu respuesta (última burbuja) SIEMPRE debe ser un Call to Action (CTA). NO PUEDE FALTAR.
* CASO A (ZAPATILLAS DE PUNTA): Si el usuario mostró interés en puntas -> CTA OBLIGATORIO: Ofrecer "Fitting" (virtual o presencial). "Para puntas es clave probarse. ¿Te gustaría agendar un fitting?".
* CASO B (RESTO DE PRODUCTOS): Si mostró productos (medias, bolsos, etc.) o hay pocos resultados -> CTA OBLIGATORIO: "Si querés ver más opciones, entrá a nuestra web: {store_website}".

FORMATO DE PRESENTACIÓN (WHATSAPP - LIMPIO)
* Secuencia OBLIGATORIA: Intro -> Prod 1 -> Prod 2 -> Prod 3 -> CTA.
* Estructura del campo `text` para productos (TODO EN UNO):
  [NOMBRE DEL PRODUCTO]
  Precio: $[PRECIO NUMÉRICO]
  Variantes: [LISTA DE VARIANTES]
  [DESCRIPCIÓN: FIDEDIGNA PERO RESUMIDA A MÁXIMO 2 LÍNEAS. NO TE EXCEDAS.]
  [URL SIN ADORNOS]

GUÍA DE USO DE DATOS (MAPPING EXACTO):
* Tool `name` -> Nombre del producto.
* Tool `price` -> "Precio: $" + precio. Priorizá `promotional_price`.
* Tool `variants` -> Variantes. Copia la lista.
* Tool `description` -> Descripción. FIDEDIGNA (TÉCNICA) PERO MUY RESUMIDA (Max 2 renglones) para que entre en un solo mensaje.
* Tool `url` -> Link al final.
* Tool `imageUrl` -> Campo `imageUrl`.

REGLAS DE CONTENIDO (CRÍTICO: TEXTO PLANO)
1. PROHIBIDO MARKDOWN: No uses `###`, `**bold**`, `*italics*`, `![img]()`, `[link](url)`.
2. PROHIBIDO ETIQUETA "DESCRIPCIÓN": No escribas "Descripción:".
3. ETIQUETAS "PRECIO" Y "VARIANTES": Estas SÍ van. "Precio: $..." y "Variantes: ...".
4. PROHIBIDO INCLUIR IMAGEN EN EL TEXTO: JAMÁS pongas `![...](...)` en el campo `text`.
5. LONGITUD MÁXIMA: Resumí la descripción. Si el texto es muy largo, WhatsApp lo corta. Mantenelo corto y conciso.
6. URLS LIMPIAS: NUNCA pongas la URL entre paréntesis.
7. CALL TO ACTION: El mensaje final de cierre (CTA) es OBLIGATORIO.

CONOCIMIENTO DE TIENDA:
MAPA DE CATEGORÍAS (Usar para búsquedas proactivas):
- Zapatillas: Puntas, Media punta.
- Medias: Convertibles, Socks, Contemporáneo, Poliamida, Patín.
- Accesorios: Metatarsianas, Bolsa de red, Elásticos, Cintas, Endurecedor de puntas, Punteras, Protectores.
- Otros: Bolsos, Leotardos.
- Servicios: Fitting / Asesoría.

{{STORE_CATALOG_KNOWLEDGE}}

FORMAT INSTRUCTIONS:
{{format_instructions}}

EXAMPLE JSON OUTPUT (Do not deviate):
{{{{
    "messages": [
        {{{{ "text": "Hola, acá tenés opciones lindas:", "imageUrl": null }}}},
        {{{{ "text": "Zapatillas Grishko 2007\n$55.000\nVariantes: 4, 5, 6, 7\nSon ideales para pie griego y brindan excelente soporte gracias a su tecnología de arco.\nhttps://www.pointecoach.shop/productos/grishko-2007", "imageUrl": "https://dcdn-us..." }}}},
        {{{{ "text": "Zapatillas Sansha Etoile\n$45.000\nVariantes: 7, 8\nSuela dividida, muy cómodas para estudiantes avanzadas.\nhttps://www.pointecoach.shop/productos/sansha-etoile", "imageUrl": "https://dcdn-us..." }}}},
        {{{{ "text": "Si buscabas otro modelo, en la web {store_website} tenés todo el catálogo. ¡Avisame cualquier duda!", "imageUrl": null }}}}
    ]
}}}}

IMPORTANT: Output strict JSON only. No strings attached.
"""
    # Inject Knowledge
    sys_template = sys_template.replace("{STORE_CATALOG_KNOWLEDGE}", store_catalog if store_catalog else "No catalog data available")

    # 5. Initialize Prompt and LLM
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=sys_template),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ]).partial(format_instructions=parser.get_format_instructions())

    if not current_openai_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")

    llm = ChatOpenAI(
        model="gpt-4.1-mini",
        api_key=current_openai_key, 
        temperature=0, 
        max_tokens=2000,
        model_kwargs={"response_format": {"type": "json_object"}}
    )
    
    agent_def = create_openai_functions_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent_def, tools=tools, verbose=True)

# Global fallback for health checks (optional)
# agent = ... (Removed global instantiation to force per-request dynamic loading)

# Helper for DB Logging
async def log_db(level: str, event_type: str, message: str, meta: dict = None):
    """Fire and forget log to system_events."""
    try:
        if db.pool:
            await db.pool.execute(
                "INSERT INTO system_events (level, event_type, message, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())",
                level, event_type, message, json.dumps(meta) if meta else "{}"
            )
    except Exception as e:
        # Fallback to stdout if DB fails
        print(f"DB_LOG_FAIL: {e}")

# Middleware
@app.middleware("http")
async def add_metrics_and_logs(request: Request, call_next):
    start_time = time.time()
    correlation_id = request.headers.get("X-Correlation-Id") or request.headers.get("traceparent")
    
    # Log Request Start (Verbose?) No, let's log completion only to reduce noise, 
    # or errors.
    
    response = await call_next(request)
    process_time = time.time() - start_time
    status_code = response.status_code
    
    REQUESTS.labels(service=SERVICE_NAME, endpoint=request.url.path, method=request.method, status=status_code).inc()
    LATENCY.labels(service=SERVICE_NAME, endpoint=request.url.path).observe(process_time)
    
    logger.bind(
        service=SERVICE_NAME, correlation_id=correlation_id, status_code=status_code,
        method=request.method, endpoint=request.url.path, latency_ms=round(process_time * 1000, 2)
    ).info("http_request_completed" if status_code < 400 else "http_request_failed")
    
    # DB Logging for Console
    # We filter out health checks to avoid spamming the DB
    if "/health" not in request.url.path and "/metrics" not in request.url.path:
        level = "info" if status_code < 400 else "error"
        evt_type = "http_request"
        # Background task for logging to not block response? 
        # For simplicity in this MVP, we await. It's fast (Postgres).
        await log_db(
            level, 
            evt_type, 
            f"{request.method} {request.url.path}", 
            {
                "status": status_code, 
                "latency_ms": round(process_time * 1000, 2),
                "correlation_id": correlation_id
            }
        )

    return response

# Endpoints
@app.get("/metrics")
def metrics(): return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/ready")
async def ready():
    try:
        if db.pool: await db.pool.fetchval("SELECT 1")
        redis_client.ping()
    except Exception as e:
        logger.error("readiness_check_failed", error=str(e))
        raise HTTPException(status_code=503, detail="Dependencies unavailable")
    return {"status": "ok"}

# Standard verify internal token helper
async def verify_internal_token(x_internal_token: str = Header(...)):
    if INTERNAL_API_TOKEN and x_internal_token != INTERNAL_API_TOKEN:
         raise HTTPException(status_code=401, detail="Invalid Internal Token")

# Startup and Shutdown are handled by lifespan context manager.

@app.post("/chat", response_model=OrchestratorResult)
async def chat_endpoint(request: Request, event: InboundChatEvent, x_internal_token: str = Header(None)):
    if x_internal_token != INTERNAL_API_TOKEN:
         # For testing allow bypass or strict
         pass
         
    # message deduplication logic...
    event_id = event.event_id
    if redis_client.get(f"processed:{event_id}"):
        return OrchestratorResult(status="duplicate", send=False)
        
    redis_client.set(f"processed:{event_id}", "1", ex=86400)
    
    # --- 1. Conversation & Lockout Management ---
    # Resolve Conversation ID using (channel, external_user_id)
    # Typically channel="whatsapp", external_user_id=event.from_number
    channel = "whatsapp" # Default for now, could be passed in event
    # Ensure tenant_id is resolved or defaulted (since table requires it)
    # We'll use a placeholder or resolve based on 'to_number' (Bot Phone)
    
    # Try to find existing conversation
    # We also fetch tenant_id to reuse it
    conv = await db.pool.fetchrow("""
        SELECT id, tenant_id, status, human_override_until 
        FROM chat_conversations 
        WHERE channel = $1 AND external_user_id = $2
    """, channel, event.from_number)
    
    conv_id = None
    is_locked = False
    
    if conv:
        conv_id = conv['id']
        tenant_id = conv['tenant_id']
        current_tenant_id.set(tenant_id) # Fix: Ensure tenant context is set for existing convs
        # Check Lockout
        if conv['human_override_until'] and conv['human_override_until'] > datetime.now().astimezone():
            is_locked = True
    else:
        # Create new conversation
        # Resolve Tenant ID robustly (Single Tenant Logic)
        # We try to find the tenant by phone, but if it fails, we use the first available one 
        # or create a default one to ensure memory (FK) works.
        tenant_row = await db.pool.fetchrow("SELECT id FROM tenants ORDER BY id ASC LIMIT 1")
        
        if not tenant_row:
             # CREATE DEFAULT TENANT if DB is truly empty
             logger.info("creating_default_tenant_for_single_tenant_mode")
             store_name = os.getenv("STORE_NAME", "Default Store")
             bot_phone = event.to_number or os.getenv("BOT_PHONE_NUMBER", "5491100000000")
             
             tenant_id = await db.pool.fetchval("""
                INSERT INTO tenants (store_name, bot_phone_number)
                VALUES ($1, $2)
                ON CONFLICT (bot_phone_number) DO UPDATE SET store_name = EXCLUDED.store_name
                RETURNING id
             """, store_name, bot_phone)
        else:
            tenant_id = tenant_row['id']
            
        logger.info("using_tenant_for_memory", tenant_id=tenant_id)
        current_tenant_id.set(tenant_id)

        new_conv_id = str(uuid.uuid4())
        conv_id = await db.pool.fetchval("""
            INSERT INTO chat_conversations (
                id, tenant_id, channel, external_user_id, display_name, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, 'open', NOW(), NOW()
            ) RETURNING id
        """, new_conv_id, tenant_id, channel, event.from_number, event.customer_name or event.from_number)

    # Set Conversation Context (CRITICAL for tools)
    current_conversation_id.set(conv_id)

    # --- 2. Handle Echoes (Human Messages from App) ---
    is_echo = False
    if event.event_type in ["whatsapp.message.echo", "whatsapp.smb.message.echoes", "message_echo"]:
         is_echo = True
    
    if is_echo:
         logger.info("human_echo_received", from_number=event.from_number, text_preview=event.text[:50] if event.text else "Media")
         
         # 1. Update Chat Conversation Lockout
         if conv_id:
             await db.pool.execute("""
                 UPDATE chat_conversations 
                 SET human_override_until = NOW() + INTERVAL '24 hours',
                     status = 'human_handling',
                     last_message_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1
             """, conv_id)
             
             # 2. Log message to history (marked as human_supervisor)
             if event.text:
                 await db.pool.execute("""
                     INSERT INTO chat_messages (
                         id, tenant_id, conversation_id, role, content, 
                         human_override, sent_from, sent_context, created_at
                     )
                     VALUES ($1, $2, $3, 'human_supervisor', $4, TRUE, 'webhook', 'whatsapp_echo', NOW())
                 """, str(uuid.uuid4()), tenant_id, conv_id, event.text)

         return OrchestratorResult(status="ok", send=False, text="Echo processed, AI paused.")
        
    # --- 3. Handle User Message (Inbound) ---
    
    # Handle Media if present
    media_id = None
    message_type = "text"
    if event.media and len(event.media) > 0:
        m = event.media[0] # Assuming single media per message for now
        message_type = m.type
        # Persist Media
        # Persist Media
        media_uuid = str(uuid.uuid4())
        media_id = await db.pool.fetchval("""
            INSERT INTO chat_media (
                id, tenant_id, channel, provider_media_id, media_type, 
                mime_type, file_name, storage_url, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, 
                $6, $7, $8, NOW()
            ) RETURNING id
        """, media_uuid, tenant_id, channel, m.provider_id, m.type, m.mime_type or "application/octet-stream", m.file_name, m.url)
    
    # Store User Message
    correlation_id = event.correlation_id or str(uuid.uuid4())
    content = event.text or "" # Can be empty if just image
    
    await db.pool.execute("""
        INSERT INTO chat_messages (
            id, tenant_id, conversation_id, role, content, 
            correlation_id, created_at, message_type, media_id, from_number
        ) VALUES (
            $1, (SELECT tenant_id FROM chat_conversations WHERE id=$2), $2, 'user', $3,
            $4, NOW(), $5, $6, $7
        )
    """, uuid.uuid4(), conv_id, content, correlation_id, message_type, media_id, event.from_number)
    
    # Update Conversation Metadata
    preview_text = content[:50] if content else f"[{message_type}]"
    await db.pool.execute("""
        UPDATE chat_conversations 
        SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW()
        WHERE id = $2
    """, preview_text, conv_id)

    history_rows = await db.pool.fetch("""
        SELECT role, content 
        FROM chat_messages 
        WHERE conversation_id = $1 
        ORDER BY created_at ASC 
        LIMIT 20
    """, conv_id)
    
    chat_history = []
    for h in history_rows:
        if h['role'] == 'user':
            chat_history.append(HumanMessage(content=h['content'] or ""))
        elif h['role'] in ['assistant', 'human_supervisor']:
            chat_history.append(AIMessage(content=h['content'] or ""))
    
    # Dynamic Agent Loading
    tenant_lookup = event.to_number or event.from_number
    
    # CRITICAL: Enforce Lockout (Human Override)
    # If the conversation is locked (human_override_until > now), we DO NOT execute the agent.
    if is_locked:
        logger.info("conversation_locked_human_override", conv_id=conv_id)
        # We return "ignored" so the orchestrator stops here. 
        # The user message was already stored in DB (lines 1303-1311), visible to human agents.
        return OrchestratorResult(status="ignored", send=False, text="Conversation locked by human override.")

    executor = await get_agent_executable(tenant_phone=tenant_lookup)
    
    # Set Conversation Context for Tools
    current_conversation_id.set(conv_id)
    current_customer_phone.set(event.from_number)
    
    # Distributed Lock (Prevent Race Conditions per number)
    lock_key = f"lock:{event.from_number}"
    lock = redis_client.lock(lock_key, timeout=20)
    acquired = False
    
    # Early check for lock availability
    if not lock.acquire(blocking=False):
        logger.info("message_locked_processing", from_number=event.from_number)
        return OrchestratorResult(status="processing", send=False, text="Message being processed")
    
    acquired = True
    
    try:
        inputs = {"input": event.text, "chat_history": chat_history}
        result = await executor.ainvoke(inputs)
        output = result["output"] 
        
        # --- Smart Output Processing (Layer 2) ---
        final_messages = []
        
        # Case A: Strict Pydantic Object
        if isinstance(output, OrchestratorResponse):
            final_messages = output.messages
            
        # Case B: Dict (JSON) but might have wrong keys
        elif isinstance(output, dict):
            # 1. Correct Format
            if "messages" in output and isinstance(output["messages"], list):
                 final_messages = [OrchestratorMessage(**m) for m in output["messages"]]
            # 2. "message" or "response" single key (Common Hallucination)
            elif "message" in output:
                 final_messages = [OrchestratorMessage(text=str(output["message"]), part=1, total=1)]
            elif "response" in output:
                 final_messages = [OrchestratorMessage(text=str(output["response"]), part=1, total=1)]
            elif "answer" in output:
                 final_messages = [OrchestratorMessage(text=str(output["answer"]), part=1, total=1)]
            else:
                 # Fallback: Dump the whole dict as text provided it's not internal weirdness
                 # Check if it has 'part', 'total', 'text' at root (Flattened)
                 if "text" in output:
                     final_messages = [OrchestratorMessage(text=str(output["text"]), part=output.get("part", 1), total=output.get("total", 1))]
                 else:
                     # Last resort: Stringify
                     final_messages = [OrchestratorMessage(text=json.dumps(output, ensure_ascii=False), part=1, total=1)]
                     
        # Case C: String (maybe JSON string)
        elif isinstance(output, str):
            # 1. Clean Markdown (Standardize)
            cleaned = output.strip()
            if cleaned.startswith("```json"): cleaned = cleaned[7:].split("```")[0].strip()
            elif cleaned.startswith("```"): cleaned = cleaned[3:].split("```")[0].strip()
            
            try:
                # 2. Try JSON Load (Robust)
                parsed_json = json.loads(cleaned)
                
                # HELPER: Text Sanitizer
                def sanitize_text(text: str) -> str:
                    if not text: return ""
                    import re
                    # 1. Remove Image Markdown ![...](...)
                    text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
                    # 2. Remove Headers ###
                    text = re.sub(r'#+\s*', '', text)
                    # 3. Remove Bold/Italic ** *
                    text = re.sub(r'\*\*|__', '', text)
                    # 4. Remove unwanted labels
                    text = re.sub(r'(?i)descripci[óo]n:', '', text)
                    # 5. Remove URL wrapping parens (url) -> url
                    text = re.sub(r'\((https?://[^\s]+)\)', r'\1', text)
                    # 6. Trim lines
                    lines = [line.strip() for line in text.split('\n')]
                    return '\n'.join([l for l in lines if l]).strip()

                # HELPER: URL Sanitizer
                def sanitize_url(url: str) -> str:
                    if not url: return None
                    url = str(url).strip()
                    # 1. Un-markdown: ![alt](url) -> url
                    import re
                    match = re.search(r'\((https?://[^\)]+)\)', url)
                    if match: return match.group(1)
                    # 2. Un-parens: (url) -> url
                    if url.startswith("(") and url.endswith(")"): return url[1:-1]
                    return url

                # 3. Process as Dict
                if isinstance(parsed_json, dict) and "messages" in parsed_json and isinstance(parsed_json["messages"], list):
                    final_messages = []
                    for m in parsed_json["messages"]:
                        p_part = m.get("part")
                        p_total = m.get("total")
                        # SANITIZE TEXT & IMAGE
                        p_text = sanitize_text(m.get("text"))
                        p_image = sanitize_url(m.get("imageUrl") or m.get("image_url"))
                        
                        final_messages.append(OrchestratorMessage(
                            part=p_part,
                            total=p_total,
                            text=p_text,
                            imageUrl=p_image
                        ))
                elif isinstance(parsed_json, dict) and any(k in parsed_json for k in ["message", "response", "text"]):
                     # Single message handling
                     txt = parsed_json.get("message") or parsed_json.get("response") or parsed_json.get("text")
                     final_messages = [OrchestratorMessage(text=sanitize_text(str(txt)) if txt else "", part=1, total=1)]
                elif isinstance(parsed_json, list):
                     # Direct list handling
                     final_messages = []
                     for m in parsed_json:
                        if isinstance(m, dict):
                             final_messages.append(OrchestratorMessage(
                                text=sanitize_text(m.get("text")),
                                imageUrl=sanitize_url(m.get("imageUrl") or m.get("image_url"))
                             ))
                else:
                    final_messages = [OrchestratorMessage(text=json.dumps(parsed_json, indent=2, ensure_ascii=False))]

            except json.JSONDecodeError:
                # 4. JSON Failed -> It's just text
                final_messages = [OrchestratorMessage(text=cleaned)]
            except Exception as e:
                logger.error("output_parsing_failed", error=str(e), output_sample=cleaned[:100])
                final_messages = [OrchestratorMessage(text=cleaned)]
                
        else:
            final_messages = [OrchestratorMessage(text=str(output))]


        # Store Assistant Response
        raw_output_str = ""
        if isinstance(output, str):
            raw_output_str = output
        else:
            try:
                # If output is OrchestratorResponse or similar
                if hasattr(output, 'dict'):
                    raw_output_str = json.dumps(output.dict(), ensure_ascii=False)
                else:
                    raw_output_str = json.dumps(output, ensure_ascii=False)
            except:
                raw_output_str = str(output)

        await db.pool.execute("""
            INSERT INTO chat_messages (
                id, tenant_id, conversation_id, role, content, correlation_id, created_at, from_number
            ) VALUES (
                $1, (SELECT tenant_id FROM chat_conversations WHERE id=$2), $2, 'assistant', $3, $4, NOW(), $5
            )
        """, uuid.uuid4(), conv_id, raw_output_str, correlation_id, event.from_number)
        
        # Track Usage
        await db.pool.execute("UPDATE tenants SET total_tool_calls = total_tool_calls + 1 WHERE bot_phone_number = $1", event.from_number)

        return OrchestratorResult(
            status="ok", 
            send=True, 
            messages=final_messages,
            meta={"correlation_id": correlation_id}
        )
            
    except Exception as e:
        log.error("unexpected_error", error=str(e))
        await db.mark_inbound_failed(event.provider, event.provider_message_id, str(e))
        return OrchestratorResult(status="error", send=False, meta={"error": str(e)})
    finally:
        if acquired: lock.release()

# --- CORS CONFIGURATION (OUTERMOST LAYER) ---
# Middlewares in FastAPI are processed in reverse order of addition.
# Adding CORSMiddleware last makes it the first to handle requests (outermost).
CORS_ALLOWED_ORIGINS_RAW = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in CORS_ALLOWED_ORIGINS_RAW.split(",") if origin.strip()
] or [
    "https://docker-platform-ui.yn8wow.easypanel.host",
    "http://localhost:3000",
    "http://localhost:8000"
]

# When using allow_credentials=True, allow_origins cannot be ["*"]
USE_CREDENTIALS = True
if "*" in CORS_ALLOWED_ORIGINS:
    USE_CREDENTIALS = False # CORS spec requirement

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=USE_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"INFO: CORS initialized with origins: {CORS_ALLOWED_ORIGINS}")
