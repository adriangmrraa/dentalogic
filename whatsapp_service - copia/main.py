import os
import hmac
import hashlib
import time
import uuid
import asyncio
import redis
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from ycloud_client import YCloudClient

# Initialize config
load_dotenv()

YCLOUD_API_KEY = os.getenv("YCLOUD_API_KEY")
YCLOUD_WEBHOOK_SECRET = os.getenv("YCLOUD_WEBHOOK_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_SERVICE_URL", "http://orchestrator_service:8000")

if not YCLOUD_WEBHOOK_SECRET:
    raise ValueError("YCLOUD_WEBHOOK_SECRET is required")

# Initialize structlog
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

# Initialize Redis
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# --- Models ---
class OrchestratorMessage(BaseModel):
    part: Optional[int] = None
    total: Optional[int] = None
    text: Optional[str] = None
    imageUrl: Optional[str] = None
    needs_handoff: bool = False
    handoff: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

class OrchestratorResult(BaseModel):
    status: str
    send: bool
    text: Optional[str] = None
    messages: List[OrchestratorMessage] = Field(default_factory=list)

class SendMessage(BaseModel):
    to: str
    text: str

# FastAPI App
app = FastAPI(
    title="WhatsApp Service",
    description="A service to handle WhatsApp interactions and forward them to the orchestrator.",
)

# Metrics
SERVICE_NAME = "whatsapp_service"
REQUESTS = Counter("http_requests_total", "Total Request Count", ["service", "endpoint", "method", "status"])
LATENCY = Histogram("http_request_latency_seconds", "Request Latency", ["service", "endpoint"])

# --- Middleware ---
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
    ).info("request_completed" if status_code < 400 else "request_failed")
    return response

# --- Helpers ---
async def verify_signature(request: Request):
    signature_header = request.headers.get("ycloud-signature")
    if not signature_header: raise HTTPException(status_code=401, detail="Missing signature header")
    try:
        parts = {k: v for k, v in [p.split("=") for p in signature_header.split(",")]}
        t, s = parts.get("t"), parts.get("s")
    except: raise HTTPException(status_code=401, detail="Invalid signature format")
    if not t or not s: raise HTTPException(status_code=401, detail="Missing timestamp or signature")
    if abs(time.time() - int(t)) > 300: raise HTTPException(status_code=401, detail="Timestamp out of tolerance")
    raw_body = await request.body()
    signed_payload = f"{t}.{raw_body.decode('utf-8')}"
    expected = hmac.new(YCLOUD_WEBHOOK_SECRET.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, s): raise HTTPException(status_code=401, detail="Invalid signature")

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10),
       retry=retry_if_exception_type(httpx.HTTPError))
async def forward_to_orchestrator(payload: dict, headers: dict):
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
        response = await client.post(f"{ORCHESTRATOR_URL}/chat", json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

async def transcribe_audio(audio_url: str, correlation_id: str) -> Optional[str]:
    """Downloads audio from YCloud and transcribes it using OpenAI Whisper."""
    if not OPENAI_API_KEY:
        logger.error("missing_openai_api_key", note="Transcription requires OpenAI API key")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            # 1. Download audio
            audio_res = await client.get(audio_url)
            audio_res.raise_for_status()
            audio_data = audio_res.content
            
            # 2. Transcribe with Whisper
            files = {"file": ("audio.ogg", audio_data, "audio/ogg")}
            headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
            data = {"model": "whisper-1"}
            
            trans_res = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data
            )
            trans_res.raise_for_status()
            return trans_res.json().get("text")
    except Exception as e:
        logger.error("transcription_failed", error=str(e), correlation_id=correlation_id)
        return None

async def send_sequence(messages: List[OrchestratorMessage], user_number: str, business_number: str, inbound_id: str, correlation_id: str):
    client = YCloudClient(YCLOUD_API_KEY, business_number)
    
    try: await client.mark_as_read(inbound_id, correlation_id)
    except: pass

    for msg in messages:
        try:
            # 1. Image Bubble
            if msg.imageUrl:
                try: await client.typing_indicator(inbound_id, correlation_id)
                except: pass
                await asyncio.sleep(4)
                await client.send_image(user_number, msg.imageUrl, correlation_id)
                try: await client.mark_as_read(inbound_id, correlation_id)
                except: pass

            # 2. Text Bubble(s) with Safety Splitter (Layer 2)
            if msg.text:
                # Emergency splitting if orchestrator sent a wall of text (>400 chars)
                import re
                if len(msg.text) > 400:
                    text_parts = re.split(r'(?<=[.!?]) +', msg.text)
                    refined_parts = []
                    current = ""
                    for p in text_parts:
                        if len(current) + len(p) < 400:
                            current += (" " + p if current else p)
                        else:
                            if current: refined_parts.append(current)
                            current = p
                    if current: refined_parts.append(current)
                else:
                    refined_parts = [msg.text]

                for part in refined_parts:
                    try: await client.typing_indicator(inbound_id, correlation_id)
                    except: pass
                    await asyncio.sleep(4)
                    await client.send_text(user_number, part, correlation_id)
                    try: await client.mark_as_read(inbound_id, correlation_id)
                    except: pass
                
        except Exception as e:
            logger.error("sequence_step_error", error=str(e), correlation_id=correlation_id)

# --- Background Task ---
async def process_user_buffer(from_number: str, business_number: str, customer_name: Optional[str], event_id: str, provider_message_id: str):
    buffer_key, timer_key, lock_key = f"buffer:{from_number}", f"timer:{from_number}", f"active_task:{from_number}"
    correlation_id = str(uuid.uuid4())
    log = logger.bind(correlation_id=correlation_id, from_number=from_number[-4:])
    try:
        while True:
            await asyncio.sleep(2)
            if redis_client.ttl(timer_key) <= 0: break
        
        messages = redis_client.lrange(buffer_key, 0, -1)
        if not messages: return
        joined_text = "\n".join(messages)
        
        inbound_event = {
            "provider": "ycloud", "event_id": event_id, "provider_message_id": provider_message_id,
            "from_number": from_number, "text": joined_text, "customer_name": customer_name,
            "event_type": "whatsapp.inbound_message.received", "correlation_id": correlation_id
        }
        headers = {"X-Correlation-Id": correlation_id}
        if INTERNAL_API_TOKEN: headers["X-Internal-Token"] = INTERNAL_API_TOKEN
             
        log.info("forwarding_to_orchestrator", text_preview=joined_text[:50])
        raw_res = await forward_to_orchestrator(inbound_event, headers)
        log.info("orchestrator_response_received", status=raw_res.get("status"), send=raw_res.get("send"))
        
        try:
            orch_res = OrchestratorResult(**raw_res)
        except Exception as e:
            log.error("orchestrator_parse_error", error=str(e), raw=raw_res)
            return

        if orch_res.status == "duplicate":
            log.info("ignoring_duplicate_response")
            return

        if orch_res.send:
            if not YCLOUD_API_KEY:
                log.error("missing_ycloud_api_key", note="Cannot send sequence without API key")
                return
            
            msgs = orch_res.messages
            if not msgs and orch_res.text:
                msgs = [OrchestratorMessage(text=orch_res.text)]
            
            if msgs:
                img_count = len([m for m in msgs if m.imageUrl])
                log.info("starting_send_sequence", count=len(msgs), images_found=img_count)
                await send_sequence(msgs, from_number, business_number, event_id, correlation_id)
            else:
                log.warning("nothing_to_send", note="Orchestrator said send=True but messages/text are empty")

    except Exception as e:
        log.error("buffer_process_error", error=str(e))
    finally:
        for k in [buffer_key, lock_key, timer_key]:
            try:
                redis_client.delete(k)
            except:
                pass

# --- Endpoints ---
@app.get("/metrics")
def metrics(): return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/ready")
def ready():
    if not YCLOUD_WEBHOOK_SECRET: raise HTTPException(status_code=503, detail="Configuration missing")
    return {"status": "ok"}

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/webhook/ycloud")
async def ycloud_webhook(request: Request):
    await verify_signature(request)
    correlation_id = request.headers.get("traceparent") or str(uuid.uuid4())
    try: body = await request.json()
    except: raise HTTPException(status_code=400, detail="Invalid JSON")
    
    event = body[0] if isinstance(body, list) and body else body
    if event.get("type") != "whatsapp.inbound_message.received": return {"status": "ignored"}

    msg = event.get("whatsappInboundMessage", {})
    from_n, to_n, name = msg.get("from"), msg.get("to"), msg.get("customerProfile", {}).get("name")
    msg_type = msg.get("type")
    text = None

    if msg_type == "text":
        text = msg.get("text", {}).get("body")
    elif msg_type == "audio":
        audio_link = msg.get("audio", {}).get("link")
        if audio_link:
            logger.info("audio_received_starting_transcription", correlation_id=correlation_id)
            text = await transcribe_audio(audio_link, correlation_id)
            if text:
                logger.info("transcription_success", text_preview=text[:50], correlation_id=correlation_id)
    
    if not text: 
        return {"status": "ignored_no_text"}

    buffer_key, timer_key, lock_key = f"buffer:{from_n}", f"timer:{from_n}", f"active_task:{from_n}"
    redis_client.rpush(buffer_key, text)
    redis_client.setex(timer_key, 16, "1")
    
    if not redis_client.get(lock_key):
        redis_client.setex(lock_key, 60, "1")
        asyncio.create_task(process_user_buffer(from_n, to_n, name, event.get("id"), msg.get("wamid") or event.get("id")))
        return {"status": "buffering_started", "correlation_id": correlation_id}
    return {"status": "buffering_updated", "correlation_id": correlation_id}

@app.post("/messages/send")
def send_message(message: SendMessage):
    raise HTTPException(status_code=501, detail="The orchestrator should handle sending messages.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

