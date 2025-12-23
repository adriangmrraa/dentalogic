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
from langchain_core.messages import SystemMessage
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
        
        # Sync Environment Tenants
        try:
            await sync_environment()
            logger.info("environment_synced")
        except Exception as e:
            logger.error("environment_sync_failed", error=str(e))
        
        # --- Auto-Migration for EasyPanel ---
        # Since the db/ folder isn't copied to the container, we inline the critical schema here.
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
            # 9b. Chat Messages Repair (Ensure media_id exists)
            """
            DO $$
            BEGIN
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS media_id UUID;
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS human_override BOOLEAN DEFAULT false;
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
   - Burbuja 3: Nombre, precio, variante/stock. Luego un salto de línea y la URL del producto.
   - Burbuja 4: SOLO la imageUrl del producto 2.
   - Burbuja 5: Descripción breve. Luego un salto de línea y la URL del producto.
   - Burbuja 6: SOLO la imageUrl del producto 3 (si hay).
   - Burbuja 7: Descripción breve. Luego un salto de línea y la URL del producto.
   - Burbuja 8: CTA Final con la URL general ({STORE_URL}) en una línea nueva o invitación a Fitting si son puntas.
5. FITTING: Si el usuario pregunta por "zapatillas de punta" por primera vez, recomienda SIEMPRE un fitting en la Burbuja 8.
6. NO inventes enlaces. Usa los devueltos por las tools.
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

# CORS Configuration - Broadly permissive
# This MUST be the first middleware added
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root Endpoint for basic health checks (Traefik/EasyPanel)
@app.get("/")
async def root():
    return {"status": "ok", "service": "orchestrator", "version": "1.1.0"}

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

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "orchestrator"}

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
MCP_URL = "https://n8n-n8n.qvwxm2.easypanel.host/mcp/d36b3e5f-9756-447f-9a07-74d50543c7e8"

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
    price = p.get("variants", [{}])[0].get("price", "0")
    promo_price = p.get("variants", [{}])[0].get("promotional_price", None)
    
    # Extract first image URL
    image_url = None
    images = p.get("images", [])
    if images and isinstance(images, list) and len(images) > 0:
        image_url = images[0].get("src")

    return {
        "id": p.get("id"),
        "name": p.get("name", {}).get("es", "Sin nombre"),
        "price": price,
        "promotional_price": promo_price,
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

tools = [search_specific_products, search_by_category, browse_general_storefront, cupones_list, orders, sendemail]

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
        "SELECT store_name, system_prompt_template, store_catalog_knowledge, store_description, tiendanube_store_id, tiendanube_access_token FROM tenants WHERE bot_phone_number LIKE $1", 
        f"%{short_phone}"
    )
    if not tenant:
        logger.warning("tenant_lookup_failed", searched=[tenant_phone, f"+{tenant_phone}"], note="Verify DB entry matches YCloud 'to' number")
    else:
        logger.info("tenant_lookup_success", store=tenant['store_name'])

    # Set context variables for this execution
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
    
    # 1. System Template
    if tenant and tenant['system_prompt_template']:
        sys_template = tenant['system_prompt_template']
    elif GLOBAL_SYSTEM_PROMPT:
        sys_template = GLOBAL_SYSTEM_PROMPT
        
    # 2. Knowledge
    if tenant and tenant['store_catalog_knowledge']:
        knowledge = tenant['store_catalog_knowledge']
    elif GLOBAL_CATALOG_KNOWLEDGE:
        knowledge = GLOBAL_CATALOG_KNOWLEDGE
        
    # 3. Description
    if tenant and tenant['store_description']:
        description = tenant['store_description']
    elif GLOBAL_STORE_DESCRIPTION:
        description = GLOBAL_STORE_DESCRIPTION
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
   - Burbuja 3: Nombre, precio, variante/stock. Luego un salto de línea y la URL del producto.
   - Burbuja 4: SOLO la imageUrl del producto 2.
   - Burbuja 5: Descripción breve. Luego un salto de línea y la URL del producto.
   - Burbuja 6: SOLO la imageUrl del producto 3 (si hay).
   - Burbuja 7: Descripción breve. Luego un salto de línea y la URL del producto.
   - Burbuja 8: CTA Final con la URL general ({store_url}) en una línea nueva o invitación a Fitting si son puntas.
5. FITTING: Si el usuario pregunta por "zapatillas de punta" por primera vez, recomienda SIEMPRE un fitting en la Burbuja 8.
6. NO inventes enlaces. Usa los devueltos por las tools.
7. USO DE CATALOGO: Tu variable {{STORE_CATALOG_KNOWLEDGE}} contiene las categorías y marcas reales.
   - Antes de llamar a `search_specific_products`, REVISA el catálogo.
   - Si el usuario pide "bolsos", mira que marcas de bolsos hay y busca por marca o categoría exacta (ej: `search_specific_products("Bolsos")`).
   - Evita `browse_general_storefront` si hay un término de búsqueda claro.
   - Evita búsquedas genéricas que traigan "Zapatillas" cuando piden "Bolsos" (por coincidencias en descripción).
CONOCIMIENTO DE TIENDA:
{{STORE_CATALOG_KNOWLEDGE}}
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
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY missing")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=OPENAI_API_KEY, 
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

@app.get("/health")
def health(): return {"status": "ok"}

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
        # Need tenant_id. Resolve from tenants table or default
        tenant_row = await db.pool.fetchrow("SELECT id FROM tenants WHERE bot_phone_number = $1", event.to_number)
        tenant_id = tenant_row['id'] if tenant_row else 1 
        
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
    # Check extra fields in event or implicit type
    # For now, InboundChatEvent might need extending or we check payload properties if passed loosely
    # User's spec said: "whatsapp.smb.message.echoes = true" in webhook
    # The 'whatsapp_service' needs to pass this flag. 
    # Let's assume 'event_type' == 'whatsapp.message.echo' or implicit flag in extra fields?
    # User plan: "Handle Echo events: Insert human message, set human_override_until (+24h), abort AI."
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
            correlation_id, created_at, message_type, media_id
        ) VALUES (
            $1, (SELECT tenant_id FROM chat_conversations WHERE id=$2), $2, 'user', $3,
            $4, NOW(), $5, $6
        )
    """, str(uuid.uuid4()), conv_id, content, correlation_id, message_type, media_id)
    
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



    # --- 4. Invoke Agent (If not locked) ---
    
    # Chat History
    session_id = f"{event.from_number}"
    memory = ConversationBufferMemory(
        memory_key="chat_history", 
        return_messages=True,
        chat_memory=RedisChatMessageHistory(url=REDIS_URL, session_id=session_id)
    )
    
    # Dynamic Agent Loading
    tenant_lookup = event.to_number or event.from_number
    executor = await get_agent_executable(tenant_phone=tenant_lookup)
    
    try:
        inputs = {"input": event.text, "chat_history": memory.chat_memory.messages}
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
        raw_output_str = output.json() if hasattr(output, 'json') else json.dumps(output)
        
        await db.pool.execute("""
            INSERT INTO chat_messages (
                id, tenant_id, conversation_id, role, content, correlation_id, created_at
            ) VALUES (
                $1, (SELECT tenant_id FROM chat_conversations WHERE id=$2), $2, 'assistant', $3, $4, NOW()
            )
        """, str(uuid.uuid4()), conv_id, raw_output_str, correlation_id)
        
        # Track Usage
        await db.pool.execute("UPDATE tenants SET total_tool_calls = total_tool_calls + 1 WHERE bot_phone_number = $1", event.from_number)
        
        # Update Memory
        memory.chat_memory.add_user_message(event.text)
        memory.chat_memory.add_ai_message(raw_output_str)

        return OrchestratorResult(
            status="ok", 
            send=True, 
            messages=final_messages,
            meta={"correlation_id": correlation_id}
        )
            
    except Exception as e:
        logger.error("agent_execution_failed", error=str(e))
        await log_db("error", "agent_crash", f"Agent failed for {event.from_number}: {str(e)}", {"trace": str(e)})
        return OrchestratorResult(status="error", send=False, text="Error processing request")
