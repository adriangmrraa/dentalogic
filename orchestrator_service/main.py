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
    except Exception as e:
        logger.error("db_connection_failed", error=str(e))
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
    # allow_origins=["*"] with allow_credentials=True is invalid in valid CORS specs.
    # Use allow_origin_regex to allow any HTTP/HTTPS origin dynamically.
    allow_origin_regex="https?://.*",
    allow_credentials=True,
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
        return response.json()
    except Exception as e:
        return f"Request Error: {str(e)}"

@tool
def productsq(q: str):
    """Search for products by keyword in Tienda Nube."""
    cache_key = f"productsq:{q}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"q": q, "per_page": 20})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
def productsq_category(category: str, keyword: str):
    """Search for products by category and keyword in Tienda Nube."""
    q = f"{category} {keyword}"
    cache_key = f"productsq_category:{category}:{keyword}"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"q": q, "per_page": 20})
    if isinstance(result, (dict, list)): set_cached_tool(cache_key, result, ttl=600)
    return result

@tool
def productsall():
    """Get a general list of products from Tienda Nube."""
    cache_key = "productsall"
    cached = get_cached_tool(cache_key)
    if cached: return cached
    result = call_tiendanube_api("/products", {"per_page": 25})
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
prompt_text = """Eres el asistente virtual de Pointe Coach (Paraná, Entre Ríos, Argentina), tienda de artículos de danza clásica y contemporánea.

PRIORIDADES (ORDEN ABSOLUTO):
1. SALIDA: Tu respuesta final SIEMPRE debe ser EXCLUSIVAMENTE en formato JSON siguiendo el esquema.
2. VERACIDAD: Para catálogo, pedidos y cupones DEBES usar tools; prohibido inventar.
3. DIVISIÓN: Si la respuesta es larga, divídela en varios objetos en `messages`. Cada burbuja de texto entre 250 y 350 caracteres.
- PRODUCTOS: 1 burbuja por producto, formato: [Nombre] - Precio: $[Precio]. [Descripción]. Link: [URL].
- DESCRIPCION: La descripción DEBE ser un extracto corto pero TEXTUAL de lo que devuelve la tool. Está TERMINANTEMENTE prohíbido inventar, parafrasear creativamente o agregar funciones que no estén en el texto original de la tienda.

GATE ABSOLUTO DE CATÁLOGO:
Si el usuario pregunta por productos, categorías, marcas o stock, DEBES ejecutar `productsq` o `productsq_category` en ese mismo turno. Prohibido listar productos si la tool no devuelve nada.

REGLA DE PRODUCTOS Y VENTANEO (CRÍTICA):
- LIMITE: Muestra máximo de 3 a 4 productos por cada respuesta.
- LINK WEB: En la última burbuja de una lista de productos, DEBES agregar obligatorio: "Podés ver más opciones en nuestra web: https://www.pointecoach.shop/".
- PAGINACIÓN: Si el usuario pide "ver más" o "qué más tienen", revisa el historial (`chat_history`). Muestra los siguientes 3 o 4 del resultado de la tool que NO fueron mostrados en la respuesta INMEDIATAMENTE anterior. Se permite repetir productos si aparecieron hace 2 o más turnos, pero NUNCA los de la respuesta previa.

REGLA DE NORMALIZACIÓN Y BÚSQUEDA (CRÍTICA):
No uses literalmente los términos del usuario si tienen errores ortográficos o son sinónimos vagos. Traduce la intención del usuario a los nombres reales de la tienda antes de llamar a la tool.
- Ejemplo: Si el usuario dice "matatarsiana", busca `productsq(q="metatarsianas")`.
- Ejemplo: Si el usuario dice "capiezo", busca `productsq(q="capezio")`.

CONOCIMIENTO OFICIAL DE LA TIENDA (Bases para normalizar):
- Accesorios: Metatarsianas, Bolsa de red, Elásticos, Cintas de satén y elastizadas, Endurecedor para puntas, Accesorios para el pie, Punteras, Protectores de puntas.
- Medias: Medias convertibles, Socks, Medias de contemporáneo, Medias poliamida, Medias de patín.
- Zapatillas: Zapatillas de punta, Zapatillas de media punta.
- Marcas: Pointe Coach, Grishko, Capezio, Sansha.

CUÁNDO USAR CADA TOOL:
- CATALOGO: `productsq` (búsqueda general) o `productsq_category` (categoría).
- CUPONES: `cupones_list` ante cualquier pregunta de descuento/promo (vía MCP).
- PEDIDOS: `orders` ante cualquier pregunta de estado_pedido (ID de orden obligatorio). Prohibido inventar estados.
- DERIVACIÓN: `sendemail` (vía MCP) SOLO si piden hablar con un humano, fitting coordinado, o si hay un problema técnico/reclamo que no puedes resolver.

ESTRUCTURA OBLIGATORIA DE EMAIL (sendemail):
El cuerpo del mensaje (`text`) DEBE seguir este formato exacto:

Hola, te derivo un caso para atención.

Fecha/hora: [FECHA_ACTUAL] [HORA_ACTUAL]
Cliente: [NOMBRE_SI_EXISTE]
Teléfono (WhatsApp): [TELEFONO_SI_EXISTE]
Link directo al chat: https://wa.me/[TELEFONO_SOLO_NUMEROS]
Motivo de derivación: [BREVE_MOTIVO]

Resumen:
[1 O 2 LINEAS DE RESUMEN DEL CASO]

Detalle del cliente (extracto):
"[CITA_TEXTUAL_DEL_ULTIMO_MENSAJE_RELEVANTE]"

Acción requerida:
[QUE_DEBE_HACER_EL_HUMANO]

Gracias.

REGLAS DE CIERRE Y CTA (OBLIGATORIO):
SIEMPRE debes incluir una burbuja FINAL dentro de la lista `messages` con una pregunta de tipo Call to Action (CTA) que invite a seguir la conversación. Esta burbuja debe ser el último objeto del JSON y tener su correspondiente `part` y `total`.

Ejemplos sugeridos:
- "¿Querés que te muestre leotardos de otras marcas o algún otro producto de danza?"
- "¿Querés que te informe stock o talles específicos de alguna de estas zapatillas?"
- "Al ser tu primera compra, te recomiendo hacer un fitting. ¿Querés que te ayude a coordinar un turno?"
- "¿Querés que te recomiende hacer fitting para elegir la zapatilla correcta?"

REGLAS DE PEDIDOS (IMAGEN):
Si informas el estado de un pedido (`orders`), intenta extraer la URL de la imagen de uno de los productos incluidos y asígnala al campo `imageUrl` de la primera burbuja de la respuesta. El usuario debe ver qué compró.

REGLAS DE FORMATO:
- URLs: Usa solo el permalink (PROHIBIDO markdown).
- Imágenes: Si un producto tiene imagen, usa `imageUrl`.
- Burbujas: Cada objeto en `messages` debe tener `part` (ej: 1) y `total` (ej: 4). La burbuja del CTA es la última (ej: 4 de 4).
- Fitting: Si es primera vez o cambia de modelo, recomendá fitting y ofrecé derivar.

{format_instructions}

Contexto de la conversación:
{chat_history}"""

prompt = ChatPromptTemplate.from_messages([
    ("system", prompt_text),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
]).partial(format_instructions=parser.get_format_instructions())

if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set.")

llm = ChatOpenAI(
    model="gpt-4.1-mini", 
    api_key=OPENAI_API_KEY, 
    temperature=0, 
    openai_api_key=OPENAI_API_KEY,
    max_tokens=2000 # Increased to prevent truncation
)
agent = create_openai_functions_agent(llm, tools, prompt)

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
async def chat(event: InboundChatEvent, x_internal_token: Optional[str] = Header(None)):
    correlation_id = event.correlation_id or str(uuid.uuid4())
    log = logger.bind(correlation_id=correlation_id, from_number=event.from_number[-4:])
    
    if INTERNAL_API_TOKEN and x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid Internal Token")

    start_time = time.time()
    
    user_hash = hashlib.sha256(event.from_number.encode()).hexdigest()
    # Increased timeout to 80s to give more 'air' for complex tool calls
    lock = redis_client.lock(f"lock:from_number:{user_hash}", timeout=80)
    acquired = lock.acquire(blocking=True, blocking_timeout=2)
    if not acquired:
        log.warning("lock_busy")
        # No need to mark inbound failed here, as it's a concurrency issue, not a processing failure
        return OrchestratorResult(status="error", send=False, meta={"reason": "lock_busy"})

    try:
        # 1. Dedupe
        is_new = await db.try_insert_inbound(
            event.provider, event.provider_message_id, event.event_id, 
            event.from_number, event.dict(), correlation_id
        )
        if not is_new:
            log.info("duplicate_message")
            return OrchestratorResult(status="duplicate", send=False)

        await db.mark_inbound_processing(event.provider, event.provider_message_id)

        # 2. History
        history_records = await db.get_chat_history(event.from_number, limit=10)
        chat_history = []
        for h in history_records:
            if h.get('role') == 'user':
                chat_history.append(HumanMessage(content=h['content']))
            elif h.get('role') == 'assistant':
                chat_history.append(AIMessage(content=h['content']))

        # 3. Agent
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
        output_text = "Lo siento, tuve un problema al procesar tu mensaje."
        result_messages = []
        
        try:
            response = await agent_executor.ainvoke({"input": event.text, "chat_history": chat_history})
            raw_output = response.get("output", "")
            
            # Layer 1: Intelligent Post-Processor
            def clean_json(text: str):
                text = text.strip()
                if "```" in text:
                    try:
                        inner = text.split("```")[1]
                        if inner.startswith("json"): inner = inner[4:]
                        return inner.strip()
                    except: pass
                return text

            try:
                parsed = parser.parse(clean_json(raw_output))
                result_messages = parsed.messages
            except Exception as parse_err:
                log.warning("parser_failed_applying_manual_split", error=str(parse_err), raw=raw_output)
                # If not JSON, split plain text into bursts of ~300 chars by sentences
                import re
                sentences = re.split(r'(?<=[.!?]) +', raw_output)
                chunks = []
                current_chunk = ""
                for s in sentences:
                    if len(current_chunk) + len(s) < 350:
                        current_chunk += (" " + s if current_chunk else s)
                    else:
                        if current_chunk: chunks.append(current_chunk)
                        current_chunk = s
                if current_chunk: chunks.append(current_chunk)
                
                result_messages = [
                    OrchestratorMessage(part=i+1, total=len(chunks), text=c) 
                    for i, c in enumerate(chunks)
                ]
            
            output_text = " | ".join([m.text for m in result_messages])
                
        except Exception as e:
            log.error("agent_error", error=str(e))
            await db.mark_inbound_failed(event.provider, event.provider_message_id, str(e))
            return OrchestratorResult(status="error", send=False, meta={"error": str(e)})

        # 4. Save & Result
        latency = time.time() - start_time
        # Save both user and assistant messages
        await db.append_chat_message(event.from_number, "user", event.text, correlation_id)
        await db.append_chat_message(event.from_number, "assistant", output_text, correlation_id)
        await db.mark_inbound_done(event.provider, event.provider_message_id)
        
        log.info("request_completed", status="ok", latency=latency)
        return OrchestratorResult(
            status="ok",
            send=True,
            text=output_text,
            messages=result_messages
        )
    except Exception as e:
        log.error("unexpected_error", error=str(e))
        await db.mark_inbound_failed(event.provider, event.provider_message_id, str(e))
        return OrchestratorResult(status="error", send=False, meta={"error": str(e)})
    finally:
        if acquired: lock.release()
