import os
import json
import hashlib
import time
import uuid
import requests
import redis
import structlog
from typing import Any, Dict, List, Optional, Union, Literal
from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Initialize early
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
TIENDANUBE_TOKEN = "ddfd19400d3236fd4524fff6f0689c5c6748806f"
TIENDANUBE_STORE_ID = "6873259"
TIENDANUBE_API_BASE = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}"

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
class ToolError(BaseModel):
    code: str = Field(..., description="Error code")
    message: str
    retryable: bool
    details: Optional[Dict[str, Any]] = None

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
    text: str
    customer_name: Optional[str] = None
    event_type: str
    correlation_id: str

class OrchestratorMessage(BaseModel):
    part: Optional[int] = Field(None, description="The sequence number of this message.")
    total: Optional[int] = Field(None, description="The total number of messages.")
    text: str = Field(..., description="The text content of this message burst.")
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
        await db.connect()
        logger.info("db_connected")
        
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
        
        INSERT INTO tenants (
            store_name, bot_phone_number, 
            store_location, store_website, store_description, store_catalog_knowledge
        ) VALUES (
            'Pointe Coach', '5491100000000',
            'Parana, Entre Rios', 'https://www.pointecoach.shop/', 'Tienda de danza', '...'
        ) ON CONFLICT (bot_phone_number) DO NOTHING;
        
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
        logger.error("startup_error", error=str(e))
        # Don't raise here if you want to allow app to start even if DB is down temporarily,
        # but for critical DB apps, maybe better to fail.
    
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
from admin_routes import router as admin_router
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

def call_mcp_tool(tool_name: str, arguments: dict):
    """Bridge to call tools on n8n MCP server with stateful session and SSE support."""
    logger.info("mcp_handshake_start", tool=tool_name)
    try:
        session = requests.Session()
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
        init_resp = session.post(MCP_URL, json=init_payload, headers=headers, timeout=10)
        
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
            session.headers.update({"Mcp-Session-Id": session_id})

        # 2. Notifications/initialized
        notif_payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        session.post(MCP_URL, json=notif_payload, headers=headers, timeout=5)

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
        
        # MCP over SSE uses a stream. We need to catch the first relevant 'data:' line
        resp = session.post(MCP_URL, json=call_payload, headers=headers, timeout=30, stream=True)
        
        if resp.status_code != 200:
            raw_text = resp.text if not resp.encoding else "".join([chunk.decode(resp.encoding) for chunk in resp.iter_content(8192)])
            return f"MCP Tool Call Error {resp.status_code}: {raw_text}"

        all_text = ""
        # Read the stream for 'data:' lines (Standard MCP over SSE)
        for line in resp.iter_lines():
            if not line: continue
            line_str = line.decode('utf-8').strip()
            if line_str.startswith("data: "):
                data_json = line_str[6:]
                try:
                    msg = json.loads(data_json)
                    # Look for the result or error in the JSON-RPC response
                    if msg.get("id") == call_payload["id"] or "result" in msg or "error" in msg:
                        if "result" in msg: return msg["result"]
                        if "error" in msg: return f"MCP Tool Error: {msg['error']}"
                except: pass
            all_text += line_str + "\n"

        # Fallback if no SSE 'data:' was found but we have body
        if not all_text.strip():
            return "MCP Server returned an empty response. Check if the n8n workflow is correctly sending a response."
        
        try:
            # Maybe it wasn't SSE after all
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
    # For now, just taking the main price and promotional price
    price = p.get("variants", [{}])[0].get("price", "0")
    promo_price = p.get("variants", [{}])[0].get("promotional_price", None)
    
    return {
        "id": p.get("id"),
        "name": p.get("name", {}).get("es", "Sin nombre"),
        "price": price,
        "promotional_price": promo_price,
        "url": p.get("canonical_url"),
        # "description": p.get("description", {}).get("es", "")[:200] + "..." # Truncate description
    }

def call_tiendanube_api(endpoint: str, params: dict = None):
    headers = {
        "Authentication": f"bearer {TIENDANUBE_TOKEN}",
        "User-Agent": "n8n (santiago@atendo.agency)",
        "Content-Type": "application/json"
    }
    try:
        url = f"{TIENDANUBE_API_BASE}{endpoint}"
        response = requests.get(url, params=params, headers=headers, timeout=10)
        if response.status_code != 200:
            return f"Error HTTP {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Auto-simplify if it's a list of products
        if isinstance(data, list) and "/products" in endpoint:
            return [simplify_product(p) for p in data]
            
        return data
    except Exception as e:
        return f"Request Error: {str(e)}"

@tool
def productsq(q: str):
    """Search for products by keyword in Tienda Nube. Returns top 5 results simplified."""
    cache_key = f"productsq:{q}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"q": q, "per_page": 5})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
def productsq_category(category: str, keyword: str):
    """Search for products by category and keyword in Tienda Nube. Returns top 5 results simplified."""
    q = f"{category} {keyword}"
    cache_key = f"productsq_category:{category}:{keyword}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"q": q, "per_page": 5})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
def productsall():
    """Get a general list of products from Tienda Nube (Top 5)."""
    cache_key = "productsall"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"per_page": 5})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
def cupones_list():
    """List active coupons and discounts from Tienda Nube via n8n MCP."""
    return call_mcp_tool("cupones_list", {})

@tool
def orders(q: str):
    """Search for order information directly in Tienda Nube API.
    Pass the order ID (without #) to retrieve status and details."""
    clean_q = q.replace("#", "").strip()
    # Using search parameter 'q' as seen in the successful n8n config
    return call_tiendanube_api("/orders", {"q": clean_q})

@tool
def sendemail(subject: str, text: str):
    """Send an email to support or customer via n8n MCP."""
    return call_mcp_tool("sendemail", {"Subject": subject, "Text": text})

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
    tenant = await db.pool.fetchrow(
        "SELECT system_prompt_template, store_catalog_knowledge FROM tenants WHERE bot_phone_number = $1", 
        tenant_phone
    )
    
    # Default Prompt if DB is empty or tenant not found
    sys_template = ""
    knowledge = ""
    
    if tenant and tenant['system_prompt_template']:
        sys_template = tenant['system_prompt_template']
        knowledge = tenant['store_catalog_knowledge'] or ""
    else:
        # Fallback Hardcoded (Pointe Coach default)
        sys_template = """Eres el asistente virtual de Pointe Coach.
PRIORIDADES:
1. SALIDA: JSON.
2. VERACIDAD: Usa tools.
3. DIVISION: max 350 chars.
GATE ABSOLUTO: Usa productsq si preguntan por productos.
LINK WEB: https://www.pointecoach.shop/
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
        model="gpt-5-mini",  # Upgraded for rate limits and speed
        api_key=OPENAI_API_KEY, 
        temperature=0, 
        max_tokens=1500
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

@app.on_event("startup")
async def startup(): await db.connect()

@app.on_event("shutdown")
async def shutdown(): await db.disconnect()

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
    executor = await get_agent_executable(tenant_phone=event.from_number)
    
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
                cleaned = output.strip()
                if cleaned.startswith("```json"): cleaned = cleaned[7:].split("```")[0]
                if cleaned.startswith("```"): cleaned = cleaned[3:].split("```")[0]
                parsed_json = json.loads(cleaned.strip())
                
                # Recursively apply Case B logic
                if isinstance(parsed_json, dict):
                    if "messages" in parsed_json:
                        final_messages = [OrchestratorMessage(**m) for m in parsed_json["messages"]]
                    elif "message" in parsed_json:
                        final_messages = [OrchestratorMessage(text=str(parsed_json["message"]), part=1, total=1)]
                    elif "response" in parsed_json:
                        final_messages = [OrchestratorMessage(text=str(parsed_json["response"]), part=1, total=1)]
                    else:
                        final_messages = [OrchestratorMessage(text=str(cleaned), part=1, total=1)]
                else:
                    final_messages = [OrchestratorMessage(text=output, part=1, total=1)]
            except:
                # Not JSON, just text
                final_messages = [OrchestratorMessage(text=output, part=1, total=1)]
                
        else:
            final_messages = [OrchestratorMessage(text=str(output), part=1, total=1)]


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
