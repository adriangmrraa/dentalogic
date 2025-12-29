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
GLOBAL_STORE_DESCRIPTION = os.getenv("GLOBAL_STORE_DESCRIPTION")
GLOBAL_CATALOG_KNOWLEDGE = os.getenv("GLOBAL_CATALOG_KNOWLEDGE")
GLOBAL_SYSTEM_PROMPT = os.getenv("GLOBAL_SYSTEM_PROMPT")

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
    # Retrieve current tenant credentials from ContextVar
    store_id = tenant_store_id.get()
    token = tenant_access_token.get()

    if not store_id or not token:
        # Debug: Check if vars are actually empty
        logger.error("tiendanube_config_missing", 
                     store_id=store_id, 
                     has_token=bool(token),
                     context_note="ContextVar might not have propagated to tool task")
        return "Error: Store ID or Token not configured for this tenant. Please check database configuration for this phone number."

    headers = {
        "Authentication": f"bearer {token}",
        "User-Agent": "n8n (santiago@atendo.agency)",
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

    # 1. Fetch Tenant Handoff Settings
    config = await db.pool.fetchrow("""
        SELECT c.*, t.store_name 
        FROM tenant_human_handoff_config c
        JOIN tenants t ON c.tenant_id = t.id
        WHERE c.tenant_id = $1
    """, tid)
    
    if not config or not config['enabled']:
        return "Error: Handoff is currently disabled or not configured for this tenant."
    
    target_email = config['destination_email']
    handoff_msg = config['handoff_message'] or "Te derivo con una persona del equipo para ayudarte mejor 😊"

    # 2. Build Email Content based on email_context flags
    ctx = config['email_context'] or {}
    if isinstance(ctx, str):
        try:
            ctx = json.loads(ctx)
        except:
            ctx = {}
            
    wa_id = (cphone or contact_phone) if ctx.get('ctx-phone') else "Oculto"
    user_name = (contact_name or 'No especificado') if ctx.get('ctx-name') else "Oculto"
    wa_link = f"https://wa.me/{wa_id}" if wa_id != "Oculto" else "No disponible"
    
    history_section = ""
    if ctx.get('ctx-history'):
        history_section = f"\nRESUMEN RECIENTE:\n{summary or 'Sin resumen de historial'}\n"

    metadata_section = ""
    if ctx.get('ctx-id'):
        metadata_section = f"Conversation ID: {cid}\nTimestamp: {formatdate(localtime=True)}\n"

    subject = f"Derivación Humana: {reason} - {user_name}"
    body = f"""DETALLE DE DERIVACIÓN (EQUIPO {config['store_name'].upper()})

Motivo: {reason}
Cliente: {user_name}
Teléfono: {wa_id}
Link WhatsApp: {wa_link}
{history_section}
ACCIÓN REQUERIDA:
{action_required or 'Atención inmediata'}

{metadata_section}Tienda: {config['store_name']}
"""

    # 3. SMTP Send
    try:
        smtp_host = str(config['smtp_host']).strip().replace("http://", "").replace("https://", "") if config['smtp_host'] else ""
        smtp_user = str(config['smtp_username']).strip() if config['smtp_username'] else ""
        smtp_pass = decrypt_password(config['smtp_password_encrypted'])
        smtp_port = config['smtp_port']
        smtp_sec = str(config['smtp_security']).strip().upper() if config['smtp_security'] else "SSL"
        
        target_email = str(config['destination_email']).strip() if config['destination_email'] else ""

        if smtp_user and smtp_pass and smtp_host and target_email:
            msg = MIMEText(body)
            msg['Subject'] = subject
            msg['From'] = smtp_user
            msg['To'] = target_email
            msg['Date'] = formatdate(localtime=True)

            if smtp_sec == 'SSL':
                with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            elif smtp_sec == 'STARTTLS':
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            else: # NONE or fallback
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.login(smtp_user, smtp_pass)
                    server.send_message(msg)
            
            logger.info("handoff_email_sent_smtp", to=target_email, host=smtp_host, port=smtp_port, security=smtp_sec)
        else:
            await call_mcp_tool("sendemail", {"Subject": subject, "Text": body})
            logger.info("handoff_email_sent_mcp_fallback", to=target_email)
            
    except Exception as e:
        logger.error("handoff_email_failed", error=str(e))
        await log_db("error", "handoff_email_failed", str(e), {"tid": tid, "cid": str(cid)})

    # 4. Lock Conversation (24h)
    await db.pool.execute("UPDATE chat_conversations SET human_override_until = NOW() + INTERVAL '24 hours' WHERE id = $1", cid)
    
    return handoff_msg

tools = [search_specific_products, search_by_category, browse_general_storefront, cupones_list, orders, sendemail, derivhumano]

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
async def get_agent_executable(tenant_phone: str = "5491100000000"):
    """
    Creates an AgentExecutor dynamically based on the Tenant's System Prompt in DB.
    """
    # 1. Fetch Tenant Context
    if not db.pool:
        try:
            await db.connect()
        except:
            raise HTTPException(status_code=503, detail="Database connection pool not initialized (Check DSN/Connectivity)")

    # Normalize phone numbers for lookup
    # Heuristic: Match matches if the DB number Ends With the user's last 8 digits (ignoring area codes/prefixes)
    # This solves +549 vs 549 vs 09 issues.
    short_phone = tenant_phone.strip()[-8:] 
    
    logger.info("tenant_lookup_attempt", raw=tenant_phone, search_suffix=short_phone)

    tenant = await db.pool.fetchrow(
        """SELECT t.id, t.store_name, t.system_prompt_template, t.store_catalog_knowledge, t.store_description, 
                  t.tiendanube_store_id, t.tiendanube_access_token,
                  h.enabled as handoff_enabled, h.handoff_instructions, h.triggers as handoff_policy
           FROM tenants t
           LEFT JOIN tenant_human_handoff_config h ON t.id = h.tenant_id
           WHERE t.bot_phone_number LIKE $1""", 
        f"%{short_phone}"
    )
    if not tenant:
        logger.warning("tenant_lookup_failed", searched=[tenant_phone, f"+{tenant_phone}"], note="Verify DB entry matches YCloud 'to' number")
    else:
        logger.info("tenant_lookup_success", store=tenant['store_name'])

    # Set context variables for this execution
    # USER PRIORITY: DB First > Global Env Fallback
    
    conn_success = False
    
    # 1. Try DB Credentials
    if tenant:
        local_store_id = tenant['tiendanube_store_id']
        local_token = tenant['tiendanube_access_token']
        if local_store_id and local_token:
            logger.info("tenant_found_in_db", store_name=tenant['store_name'], store_id=local_store_id)
            tenant_store_id.set(local_store_id)
            tenant_access_token.set(local_token)
            current_tenant_id.set(tenant['id']) # Set Tenant ID context
            conn_success = True
    
    # 2. Fallback to Global Env if DB failed/missing
    if not conn_success and GLOBAL_TN_STORE_ID and GLOBAL_TN_ACCESS_TOKEN:
         logger.info("using_global_env_fallback", store_id=GLOBAL_TN_STORE_ID, reason="db_credentials_missing_or_tenant_not_found")
         tenant_store_id.set(GLOBAL_TN_STORE_ID)
         tenant_access_token.set(GLOBAL_TN_ACCESS_TOKEN)
         conn_success = True
         
    if not conn_success:
        logger.warning("no_credentials_found", searched_phone=tenant_phone, note="Check both DB 'tenants' table and Global Env Vars")
    
    # Default Prompt if DB is empty or tenant not found
    sys_template = ""
    knowledge = ""
    description = ""
    
    store_name = "Pointe Coach"
    store_url = "https://www.pointecoach.shop"
    
    # Resolve Name/URL
    if tenant:
        store_name = tenant.get('store_name') or store_name
        # store_website logic here if needed
        
    # Resolve Knowledge/Description/Prompt (DB > Global Env > Default)
    
    # 1. Knowledge
    if tenant and tenant['store_catalog_knowledge']:
        knowledge = tenant['store_catalog_knowledge']
    elif GLOBAL_CATALOG_KNOWLEDGE:
        knowledge = GLOBAL_CATALOG_KNOWLEDGE
        
    # 2. Description
    if tenant and tenant['store_description']:
        description = tenant['store_description']
    elif GLOBAL_STORE_DESCRIPTION:
        description = GLOBAL_STORE_DESCRIPTION
    
    # 3. System Template
    if tenant and tenant['system_prompt_template']:
        sys_template = tenant['system_prompt_template']
    elif GLOBAL_SYSTEM_PROMPT:
        sys_template = GLOBAL_SYSTEM_PROMPT
    else:
        # Dynamic Fallback Prompt
        sys_template = f"""Eres el asistente virtual de {store_name}.
CONTEXTO DE LA TIENDA:
{{description}}

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
   - Burbuja 8: CTA Final con la URL general ({store_url}) en una línea nueva.
6. NO inventes enlaces. Usa los devueltos por las tools. NUNCA inventes descripción, usa la provista.
7. USO DE CATALOGO: Tu variable {{STORE_CATALOG_KNOWLEDGE}} contiene las categorías y marcas reales.
   - Antes de llamar a `search_specific_products`, REVISA el catálogo.
   - Si el usuario pide "bolsos", mira que marcas de bolsos hay y busca por marca o categoría exacta (ej: `search_specific_products("Bolsos")`).
   - Evita `browse_general_storefront` si hay un término de búsqueda claro.
   - Evita búsquedas genéricas que traigan "Zapatillas" cuando piden "Bolsos" (por coincidencias en descripción).
CONOCIMIENTO DE TIENDA:
{{STORE_CATALOG_KNOWLEDGE}}
"""

    # 4. POLÍTICA DE DERIVACIÓN A HUMANO (HI-PRIORITY)
    if tenant and tenant.get('handoff_enabled'):
        policy = tenant.get('handoff_policy') or {}
        if isinstance(policy, str):
            try:
                policy = json.loads(policy)
            except:
                policy = {}
        handoff_rules = tenant.get('handoff_instructions') or ""
        
        # Build rules string from checkboxes
        granular_rules = []
        if policy.get('rule_fitting'): granular_rules.append("- Fitting para ZAPATILLAS DE PUNTA: Si el usuario busca o pregunta por zapatillas de punta, OFRECER primero una asesoría personalizada de fitting. SOLO si el usuario acepta o pregunta específicamente por un turno/especialista, derivar inmediatamente.")
        if policy.get('rule_reclamo'): granular_rules.append("- Reclamos o tono negativo/enojado")
        if policy.get('rule_dolor'): granular_rules.append("- Mensajes sobre dolor, lesión o incomodidad fuerte")
        if policy.get('rule_talle'): granular_rules.append("- Ambigüedad de talle o modelo no resuelta en 1-2 preguntas")
        if policy.get('rule_especial'): granular_rules.append("- Coordinación especial, retiros o pedidos complejos")
        
        rules_text = "\n".join(granular_rules) if granular_rules else "Actuar según criterio profesional de derivación."
        
        sys_template += f"""
=== POLÍTICA DE DERIVACIÓN A HUMANO (PRIORIDAD MÁXIMA) ===
El siguiente conjunto de REGLAS es OBLIGATORIO y tiene prioridad sobre ventas o catálogo:

CASOS DE DERIVACIÓN:
{rules_text}

INSTRUCCIONES ADICIONALES:
"{handoff_rules}"

ACCIONES OBLIGATORIAS:
1. Para reclamos, errores o casos críticos: DETENER toda otra acción y ejecutar `derivhumano` inmediatamente.
2. Para casos de FITTING o Dudas de Talle: El procedimiento es OFRECER o sugerir la derivación primero. Si el usuario acepta o lo pide, ejecutar `derivhumano`.
3. Informar al usuario de forma amigable que será contactado por el equipo humano.
4. No mostrar productos ni enlaces comerciales en este caso.
"""


    # Inject variables if they exist in the template string (simple replacement)
    if "{STORE_CATALOG_KNOWLEDGE}" in sys_template:
        sys_template = sys_template.replace("{STORE_CATALOG_KNOWLEDGE}", knowledge if knowledge else "No catalog data available")
    if "{STORE_DESCRIPTION}" in sys_template:
        sys_template = sys_template.replace("{STORE_DESCRIPTION}", description if description else "No shop description available")
    if "{STORE_NAME}" in sys_template:
        sys_template = sys_template.replace("{STORE_NAME}", store_name)
    if "{STORE_URL}" in sys_template:
        sys_template = sys_template.replace("{STORE_URL}", store_url)

    # Ensure format instructions are present if not already in template
    if "messages" not in sys_template.lower() or "json" not in sys_template.lower():
        sys_template += "\n\nCRITICAL: You must answer in JSON format following this schema: " + parser.get_format_instructions()

    # 2. Construct Prompt Object
    # Use SystemMessage literal to avoid LangChain parsing curly braces in JSON/Names as variables
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=sys_template),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ]).partial(format_instructions=parser.get_format_instructions())

    # 3. Create Agent
    # DYNAMIC CREDENTIALS: Prefer DB over Env for OpenAI Key
    effective_api_key = OPENAI_API_KEY
    try:
        cred_row = await db.pool.fetchrow("SELECT value FROM credentials WHERE name = 'OPENAI_API_KEY' AND scope = 'global'")
        if cred_row and cred_row['value']:
            effective_api_key = cred_row['value']
            # logger.info("using_openai_key_from_db")
    except Exception as e:
        logger.warning("failed_to_fetch_openai_key_from_db", error=str(e))

    if not effective_api_key:
        raise ValueError("OPENAI_API_KEY missing")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=effective_api_key, 
        temperature=0, 
        max_tokens=2000
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
        # Check Lockout
        if conv['human_override_until'] and conv['human_override_until'] > datetime.now().astimezone():
            is_locked = True
    else:
        # Create new conversation
        # Resolve Tenant ID robustly
        tenant_row = await db.pool.fetchrow("SELECT id FROM tenants WHERE bot_phone_number = $1", event.to_number)
        
        if not tenant_row:
            # Fallback 1: Try prefix removal/addition
            clean_to = event.to_number.strip().replace("+", "") if event.to_number else ""
            tenant_row = await db.pool.fetchrow("SELECT id FROM tenants WHERE bot_phone_number LIKE $1", f"%{clean_to[-8:]}")
            
        if not tenant_row:
            # Fallback 2: Grab the first available tenant (common for single-tenant users)
            tenant_row = await db.pool.fetchrow("SELECT id FROM tenants ORDER BY id ASC LIMIT 1")
            
        if not tenant_row:
             logger.error("no_tenant_found_and_db_empty", to_number=event.to_number)
             # At this point we are stuck. This usually means sync_environment failed or env vars are missing.
             raise HTTPException(status_code=500, detail="Tenant not configured in database. Verify BOT_PHONE_NUMBER env var.")
        
        tenant_id = tenant_row['id']
        logger.info("resolved_tenant", tenant_id=tenant_id, to_number=event.to_number)
        
        new_conv_id = str(uuid.uuid4())
        conv_id = await db.pool.fetchval("""
            INSERT INTO chat_conversations (
                id, tenant_id, channel, external_user_id, display_name, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, 'open', NOW(), NOW()
            ) RETURNING id
        """, new_conv_id, tenant_id, channel, event.from_number, event.customer_name or event.from_number)

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
                     status = 'human_handling'
                 WHERE id = $1
             """, conv_id)
             
             # 2. Log message to history (marked as assistant/human_echo to show in UI but not trigger AI)
             # We use 'assistant' role so it appears on the right side (or 'system'?)
             # User wants to know "human handled". 
             # Let's use 'assistant' but maybe add metadata? For now standard 'assistant'.
             if event.text:
                 await db.pool.execute("""
                     INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
                     VALUES ($1, $2, 'assistant', $3, NOW())
                 """, str(uuid.uuid4()), conv_id, event.text)

         return OrchestratorResult(status="ok", send=False, text="Echo processed, AI paused.")
    # We will assume if event_type is 'echo' or similar custom logic.
    if event.event_type == "whatsapp.message.echo": 
        is_echo = True
        
    if is_echo:
        # 2.1 Update Lockout
        lockout_time = datetime.now() + timedelta(hours=24)
        await db.pool.execute("""
            UPDATE chat_conversations 
            SET human_override_until = $1, status = 'human_override', updated_at = NOW(), last_message_at = NOW(), last_message_preview = $2
            WHERE id = $3
        """, lockout_time, event.text[:50], conv_id)
        
        # 2.2 Insert Message
        await db.pool.execute("""
            INSERT INTO chat_messages (
                id, tenant_id, conversation_id, role, content, 
                human_override, sent_from, sent_context, created_at
            ) VALUES (
                $1, (SELECT tenant_id FROM chat_conversations WHERE id=$2), $2, 'human_supervisor', $3,
                TRUE, 'webhook', 'whatsapp_echo', NOW()
            )
        """, str(uuid.uuid4()), conv_id, event.text)
        
        return OrchestratorResult(status="ignored", send=False, text="Echo handled")
        
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

    # CHECK LOCKOUT: If locked, Abort AI
    if is_locked:
        logger.info("ai_locked_by_human_override", conversation_id=str(conv_id))
        return OrchestratorResult(status="ignored", send=False, text="Conversation locked by human override")



    # --- 4. Invoke Agent (Unified PostgreSQL Memory) ---
    
    # Load History from PostgreSQL
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
    executor = await get_agent_executable(tenant_phone=tenant_lookup)
    
    # Set Conversation Context for Tools
    current_conversation_id.set(conv_id)
    current_customer_phone.set(event.from_number)
    
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
            try:
                # Try to parse string as JSON first
                # Multi-pass decoding to handle double-encoded JSON strings
                parsed = output
                for _ in range(3):
                    if isinstance(parsed, str):
                        cleaned = parsed.strip()
                        # Clean Markdown if present
                        if cleaned.startswith("```json"): cleaned = cleaned[7:].split("```")[0]
                        if cleaned.startswith("```"): cleaned = cleaned[3:].split("```")[0]
                        
                        try:
                            parsed = json.loads(cleaned)
                        except json.JSONDecodeError:
                            # Handle common LLM hallucinations like trailing backslashes/quotes
                            # e.g. }\" or }\ 
                            cleaned_harden = re.sub(r'\\"?\s*$', '', cleaned.strip())
                            try:
                                parsed = json.loads(cleaned_harden)
                            except:
                                # If direct parse fails, try regex extraction for embedded JSON
                                match = re.search(r'\{.*\}', cleaned, re.DOTALL)
                                if match:
                                    try: parsed = json.loads(match.group(0))
                                    except: break
                                else:
                                    break
                    else:
                        break
                
                parsed_json = parsed
                
                # Recursively apply Case B logic
                if isinstance(parsed_json, dict):
                    if "messages" in parsed_json and isinstance(parsed_json["messages"], list):
                        final_messages = []
                        for m in parsed_json["messages"]:
                            # Support both imageUrl and image_url, text or content
                            txt = m.get("text") or m.get("content")
                            img = m.get("imageUrl") or m.get("image_url")
                            final_messages.append(OrchestratorMessage(text=txt, imageUrl=img))
                    elif "message" in parsed_json:
                        final_messages = [OrchestratorMessage(text=str(parsed_json["message"]))]
                    elif "text" in parsed_json:
                        final_messages = [OrchestratorMessage(text=str(parsed_json["text"]))]
                    else:
                        # If keys are unknown, try to use it as list or fallback
                        final_messages = [OrchestratorMessage(text=json.dumps(parsed_json, ensure_ascii=False))]
                elif isinstance(parsed_json, list):
                     # If the LLM returned a direct list of messages
                     final_messages = []
                     for m in parsed_json:
                        if isinstance(m, dict):
                            txt = m.get("text") or m.get("content")
                            img = m.get("imageUrl") or m.get("image_url")
                            final_messages.append(OrchestratorMessage(text=txt, imageUrl=img))
                else:
                    final_messages = [OrchestratorMessage(text=output)]
            except Exception as parse_err:
                logger.debug("output_not_json", error=str(parse_err))
                # Fallback: if it looked like JSON but failed to parse deeply, send as text
                # But if it starts with { "messages": ... } and failed, we should try a cleaner regex extraction maybe?
                # For now, let's just return the raw text to be safe
                final_messages = [OrchestratorMessage(text=output)]
                
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
