import os
import json
import hashlib
import time
import uuid
import requests
import redis
import structlog
import httpx
from typing import Any, Dict, List, Optional, Union, Literal
from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
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
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from db import db

# Configuration & Environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
POSTGRES_DSN = os.getenv("POSTGRES_DSN")

# Fallback Tienda Nube credentials (from Env Vars)
GLOBAL_TN_STORE_ID = os.getenv("TIENDANUBE_STORE_ID")
GLOBAL_TN_ACCESS_TOKEN = os.getenv("TIENDANUBE_ACCESS_TOKEN")

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

# --- Application Startup ---
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI(title="Orchestrator Service", version="1.0.0")

# CORS Configuration
origins = [
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:4173",
    "https://docker-frontend-react.yn8wow.easypanel.host",
    "https://docker-platform-ui.yn8wow.easypanel.host",
    "https://docker-bff-service.yn8wow.easypanel.host"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ToolResponse(BaseModel):
    ok: bool
    data: Optional[Any] = None
    error: Optional[ToolError] = None
    meta: Optional[Dict[str, Any]] = None

class InboundChatEvent(BaseModel):
    provider: str
    event_id: str
    provider_message_id: str
    from_number: str
    to_number: Optional[str] = None
    text: str
    customer_name: Optional[str] = None
    event_type: str
    correlation_id: str

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

# FastAPI App
from contextlib import asynccontextmanager

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
        migration_sql = """
        -- 002_platform_schema.sql
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

        CREATE TABLE IF NOT EXISTS credentials (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            value TEXT NOT NULL,
            category TEXT,
            scope TEXT DEFAULT 'global',
            tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- 003_advanced_features.sql
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tool_calls BIGINT DEFAULT 0;
        
        -- 003_advanced_features.sql
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS total_tool_calls BIGINT DEFAULT 0;
        
        -- Update Prompt if null (stricter version)
        UPDATE tenants 
        SET system_prompt_template = 'Eres el asistente virtual de {STORE_NAME}.
PRIORIDADES:
1. SALIDA: Tu respuesta final DEBE ser un objeto JSON con una clave "messages" (lista).
   Ejemplo: { "messages": [{ "text": "Hola", "part": 1, "total": 1 }] }
   NO uses claves como "message", "response", "answer".
2. VERACIDAD: Usa tools.
3. DIVISION: max 350 chars.
GATE: Usa productsq si preguntan productos.
CONOCIMIENTO: {STORE_CATALOG_KNOWLEDGE}'
        WHERE store_name = 'Pointe Coach' AND system_prompt_template IS NULL;
        """
        # Execute migration
        await db.pool.execute(migration_sql)
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

app = FastAPI(
    title="Orchestrator Service",
    description="Central intelligence for Kilocode microservices.",
    lifespan=lifespan
)

# --- CORS Middleware (Required for Platform UI in Browser) ---
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    # Simplified CORS for maximum compatibility
    allow_origins=["*"],
    allow_credentials=False, # We use token headers, not cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "orchestrator"}

# --- Include Admin Router ---
# --- Include Admin Router ---
from admin_routes import router as admin_router, sync_environment
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
        return f"Request Error: {str(e)}"

@tool
async def productsq(q: str):
    """Search for products by keyword in Tienda Nube. Returns top 3 results simplified."""
    cache_key = f"productsq:{q}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = await call_tiendanube_api("/products", {"q": q, "per_page": 3})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
async def productsq_category(category: str, keyword: str):
    """Search for products by category and keyword in Tienda Nube. Returns top 3 results simplified."""
    q = f"{category} {keyword}"
    cache_key = f"productsq_category:{category}:{keyword}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = await call_tiendanube_api("/products", {"q": q, "per_page": 3})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
async def productsall():
    """Get a general list of products from Tienda Nube (Top 3)."""
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

tools = [productsq, productsq_category, productsall, cupones_list, orders, sendemail]

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

    # Normalize phone number (strip + if present)
    clean_phone = tenant_phone.lstrip('+')

    tenant = await db.pool.fetchrow(
        "SELECT store_name, system_prompt_template, store_catalog_knowledge, tiendanube_store_id, tiendanube_access_token FROM tenants WHERE bot_phone_number = $1 OR bot_phone_number = $2", 
        clean_phone, f"+{clean_phone}"
    )

    # Set context variables for this execution
    # USER PRIORITY: Env Vars > DB
    if GLOBAL_TN_STORE_ID and GLOBAL_TN_ACCESS_TOKEN:
        logger.info("using_global_env_credentials", store_id=GLOBAL_TN_STORE_ID)
        tenant_store_id.set(GLOBAL_TN_STORE_ID)
        tenant_access_token.set(GLOBAL_TN_ACCESS_TOKEN)
    elif tenant:
        local_store_id = tenant['tiendanube_store_id']
        local_token = tenant['tiendanube_access_token']
        
        if local_store_id and local_token:
            logger.info("tenant_found_in_db", store_name=tenant['store_name'], store_id=local_store_id)
            tenant_store_id.set(local_store_id)
            tenant_access_token.set(local_token)
        else:
            logger.warning("tenant_record_missing_credentials", store_name=tenant['store_name'])
    else:
        logger.warning("no_credentials_found", searched_phone=clean_phone, note="Check both Env Vars and DB 'tenants' table")
    
    # Default Prompt if DB is empty or tenant not found
    sys_template = ""
    knowledge = ""
    
    store_name = "Pointe Coach"
    store_url = "https://www.pointecoach.shop"
    
    if tenant:
        store_name = tenant.get('store_name') or store_name
        store_url = tenant.get('store_website') or store_url

    if tenant and tenant['system_prompt_template']:
        sys_template = tenant['system_prompt_template']
        knowledge = tenant['store_catalog_knowledge'] or ""
    else:
        # Dynamic Fallback Prompt
        sys_template = f"""Eres el asistente virtual de {store_name}.
REGLAS CRÍTICAS DE RESPUESTA:
1. SALIDA: Responde SIEMPRE con el formato JSON de OrchestratorResponse (una lista de objetos "messages").
2. NUNCA envíes un objeto JSON crudo como respuesta final (ejemplo: {{{{ "zapatillas": [...] }}}}). Traduce todo a mensajes amigables.
3. SECUENCIA DE BURBUJAS (8 pasos para productos):
   - Burbuja 1: Introducción amigable (ej: "Te muestro opciones de bolsos disponibles...").
   - Burbuja 2: SOLO la imageUrl del producto 1.
   - Burbuja 3: Nombre, precio, variante/stock y LINK a la web del producto 1.
   - Burbuja 4: SOLO la imageUrl del producto 2.
   - Burbuja 5: Descripción y link del producto 2.
   - Burbuja 6: SOLO la imageUrl del producto 3 (si hay).
   - Burbuja 7: Descripción y link del producto 3 (si hay).
   - Burbuja 8: CTA Final con link a la web general ({store_url}) o invitación a Fitting si son puntas.
4. FITTING: Si el usuario pregunta por "zapatillas de punta" por primera vez, recomienda SIEMPRE un fitting en la Burbuja 8.
5. NO inventes enlaces. Usa los devueltos por las tools.
"""

    # Inject variables if they exist in the template string (simple replacement)
    # The user might have put {STORE_CATALOG_KNOWLEDGE} in the DB text.
    if "{STORE_CATALOG_KNOWLEDGE}" in sys_template:
        sys_template = sys_template.replace("{STORE_CATALOG_KNOWLEDGE}", knowledge)

    # 2. Construct Prompt Object
    prompt = ChatPromptTemplate.from_messages([
        ("system", sys_template),
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

# Middleware
@app.middleware("http")
async def add_metrics_and_logs(request: Request, call_next):
    start_time = time.time()
    correlation_id = request.headers.get("X-Correlation-Id") or request.headers.get("traceparent")
    response = await call_next(request)
    process_time = time.time() - start_time
    status_code = response.status_code
    REQUESTS.labels(service=SERVICE_NAME, endpoint=request.url.path, method=request.method, status=status_code).inc()
    LATENCY.labels(service=SERVICE_NAME, endpoint=request.url.path).observe(process_time)
    logger.bind(
        service=SERVICE_NAME, correlation_id=correlation_id, status_code=status_code,
        method=request.method, endpoint=request.url.path, latency_ms=round(process_time * 1000, 2)
    ).info("http_request_completed" if status_code < 400 else "http_request_failed")
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

    # Chat History
    session_id = f"{event.from_number}"
    memory = ConversationBufferMemory(
        memory_key="chat_history", 
        return_messages=True,
        chat_memory=RedisChatMessageHistory(url=REDIS_URL, session_id=session_id)
    )
    
    # --- Dynamic Agent Loading ---
    # Use to_number (business) if provided, fallback to from_number (testing)
    tenant_lookup = event.to_number or event.from_number
    executor = await get_agent_executable(tenant_phone=tenant_lookup)
    
    # Store User Message
    correlation_id = str(uuid.uuid4())
    await db.pool.execute(
        "INSERT INTO chat_messages (correlation_id, role, content, from_number) VALUES ($1, $2, $3, $4)",
        correlation_id, "user", event.text, event.from_number
    )
    
        # Invoke Agent
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
                # Try to parse string as JSON using robust regex
                cleaned = output.strip()
                match = re.search(r'\{.*\}', cleaned, re.DOTALL)
                if match:
                    cleaned = match.group(0)
                
                parsed_json = json.loads(cleaned.strip())
                
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
        await db.pool.execute(
            "INSERT INTO chat_messages (correlation_id, role, content, from_number) VALUES ($1, $2, $3, $4)",
            correlation_id, "assistant", output.json() if hasattr(output, 'json') else json.dumps(output), "Bot"
        )
        
        # Track Usage
        await db.pool.execute("UPDATE tenants SET total_tool_calls = total_tool_calls + 1 WHERE bot_phone_number = $1", event.from_number)
        
        # Fail-safe: Update default tenant if specific not found (optional)
        # await db.pool.execute("UPDATE tenants SET total_tool_calls = total_tool_calls + 1 WHERE bot_phone_number = '5491100000000'")

        # Update Memory
        memory.chat_memory.add_user_message(event.text)
        memory.chat_memory.add_ai_message(output.json() if hasattr(output, 'json') else json.dumps(output))

        return OrchestratorResult(
            status="ok", 
            send=True, 
            messages=final_messages,
            meta={"correlation_id": correlation_id}
        )
            
    except Exception as e:
        logger.error("agent_execution_failed", error=str(e))
        return OrchestratorResult(status="error", send=False, text="Error processing request")
