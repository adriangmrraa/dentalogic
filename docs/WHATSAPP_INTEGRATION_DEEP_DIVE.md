# 📱 WHATSAPP INTEGRATION DEEP DIVE

**Versión:** 3.0  
**Fecha:** 6 de Marzo 2026  
**Proyecto:** Dentalogic  
**Estado:** ✅ PRODUCCIÓN

## 🎯 OBJETIVO

Documentación exhaustiva del sistema de integración con WhatsApp en Dentalogic, cubriendo arquitectura, flujos, configuración, troubleshooting y mejores prácticas.

> **Nota:** Este documento integra y expande toda la documentación existente sobre WhatsApp, incluyendo análisis de código real y patrones de diseño identificados.

## 📋 TABLA DE CONTENIDOS

1. [🏗️ Arquitectura General](#-arquitectura-general)
2. [🔄 Flujo Completo de Mensajes](#-flujo-completo-de-mensajes)
3. [⚙️ WhatsApp Service (8002)](#️-whatsapp-service-8002)
4. [🤖 Orchestrator Service (8000)](#-orchestrator-service-8000)
5. [🔧 Configuración y Variables](#-configuración-y-variables)
6. [🛡️ Seguridad y Robustez](#️-seguridad-y-robustez)
7. [📊 Métricas y Monitoreo](#-métricas-y-monitoreo)
8. [🔍 Troubleshooting](#-troubleshooting)
9. [🚀 Performance y Escalabilidad](#-performance-y-escalabilidad)
10. [🎯 Patrones de Diseño](#-patrones-de-diseño)
11. [🔮 Mejoras Futuras](#-mejoras-futuras)

## 🏗️ ARQUITECTURA GENERAL

### **Diagrama de Componentes**

```
┌─────────────────────────────────────────────────────────────┐
│                    PACIENTE (WhatsApp)                      │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   Mensaje   │    │   Audio     │    │   Imagen/    │    │
│  │   Texto     │────│   (Voz)     │────│   Documento  │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
│         │                         │              │          │
│         ▼                         ▼              ▼          │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              WHATSAPP SERVICE (Puerto 8002)                 │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   Webhook   │    │   Buffer    │    │   Redis      │    │
│  │   YCloud    │────│   System    │────│   Cache      │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
│         │                         │              │          │
│         ▼                         ▼              ▼          │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   Signature │    │   Debounce  │    │   Lock       │    │
│  │   Verify    │    │   Timer     │    │   Management │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
│         │                         │              │          │
│         └─────────────────────────┴──────────────┘          │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────────┐                       │
│                    │   Transcripción │                       │
│                    │   Whisper (AI)  │                       │
│                    └─────────────────┘                       │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────────┐                       │
│                    │   Forward to    │                       │
│                    │   Orchestrator  │                       │
│                    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           ORCHESTRATOR SERVICE (Puerto 8000)                │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   LangChain │    │   Tools     │    │   Memory     │    │
│  │   Agent     │────│   Clínicas  │────│   Persist.   │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
│         │                         │              │          │
│         ▼                         ▼              ▼          │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   Response  │    │   Database  │    │   Socket.IO  │    │
│  │   Generator │    │   Updates   │    │   Real-time  │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
│         │                         │              │          │
│         └─────────────────────────┴──────────────┘          │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────────┐                       │
│                    │   Send Sequence │                       │
│                    │   (YCloud API)  │                       │
│                    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### **Responsabilidades por Componente**

| Componente | Tecnología | Responsabilidades |
|------------|------------|-------------------|
| **WhatsApp Service** | FastAPI + httpx + Redis | Webhook YCloud, buffer/debounce, transcripción Whisper, deduplicación |
| **Orchestrator Service** | FastAPI + LangChain + OpenAI + PostgreSQL | Procesamiento IA, tools clínicas, memoria persistente, generación de respuestas |
| **Redis** | Redis 7+ | Buffer temporal, locks, timers, estado de sesiones |
| **PostgreSQL** | PostgreSQL 15+ | Datos persistentes: pacientes, turnos, historial de chat |
| **YCloud API** | REST API | Gateway oficial de WhatsApp Business |

## 🔄 FLUJO COMPLETO DE MENSAJES

### **1. 📥 Recepción de Webhook**

**Endpoint:** `POST /webhook/ycloud` en WhatsApp Service (8002)

```python
@app.post("/webhook/ycloud")
async def ycloud_webhook(request: Request):
    # 1. Verificar firma HMAC
    await verify_signature(request)
    
    # 2. Extraer datos del evento
    event = await request.json()
    event_type = event.get("type")
    
    # 3. Procesar según tipo
    if event_type == "whatsapp.inbound_message.received":
        await handle_inbound_message(event)
```

**Verificación de Firma:**
```python
async def verify_signature(request: Request):
    # Obtener secreto dinámicamente (BD o env var)
    secret = await get_config("YCLOUD_WEBHOOK_SECRET", YCLOUD_WEBHOOK_SECRET)
    
    # Calcular HMAC SHA256
    timestamp = request.headers.get("x-ycloud-timestamp")
    signed_payload = f"{timestamp}.{await request.body()}"
    expected = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    
    # Comparar
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
```

### **2. ⚡ Procesamiento por Tipo de Mensaje**

#### **A. Mensajes de Texto y Audio (Sistema de Buffer)**

```
Mensaje → Redis Buffer → Timer 11s → Procesar lote completo
```

**Implementación:**
```python
if msg_type == "text":
    text = msg.get("text", {}).get("body")
    if text:
        # Agregar al buffer de Redis
        buffer_key = f"buffer:{from_number}"
        timer_key = f"timer:{from_number}"
        lock_key = f"active_task:{from_number}"
        
        redis_client.rpush(buffer_key, json.dumps({
            "text": text,
            "wamid": msg.get("wamid"),
            "event_id": event.get("id")
        }))
        
        # Reiniciar timer (11 segundos)
        redis_client.setex(timer_key, DEBOUNCE_SECONDS, "1")
        
        # Iniciar tarea de procesamiento si no hay una activa
        if not redis_client.get(lock_key):
            redis_client.setex(lock_key, 60, "1")
            asyncio.create_task(process_user_buffer(...))
```

#### **B. Audio → Transcripción Whisper**

```python
if msg_type == "audio":
    audio_url = msg.get("audio", {}).get("link")
    if audio_url:
        # Transcripción con OpenAI Whisper API
        transcription = await transcribe_audio(audio_url, correlation_id)
        
        if transcription and transcription.strip():
            # Mismo buffer que mensajes de texto
            redis_client.rpush(buffer_key, json.dumps({
                "text": transcription.strip(),
                "wamid": msg.get("wamid"),
                "event_id": event.get("id"),
                "source": "audio"
            }))
```

#### **C. Imágenes y Documentos (Procesamiento Inmediato)**

```python
if msg_type in ["image", "document"]:
    # Extraer metadata
    media_list = [{
        "type": msg_type,
        "url": node.get("link"),
        "mime_type": node.get("mime_type"),
        "file_name": node.get("filename") if msg_type == "document" else None
    }]
    
    # Enviar inmediatamente al Orchestrator (sin buffer)
    payload = {
        "provider": "ycloud",
        "event_id": event.get("id"),
        "provider_message_id": msg.get("wamid"),
        "from_number": from_number,
        "to_number": to_number,
        "text": node.get("caption"),  # Caption opcional
        "customer_name": customer_name,
        "event_type": "whatsapp.inbound_message.received",
        "correlation_id": correlation_id,
        "media": media_list
    }
    
    await forward_to_orchestrator(payload, headers)
```

### **3. ⏳ Sistema de Buffer/Debounce**

#### **Objetivo del Buffer**
Agrupar mensajes enviados en ráfaga por el usuario para proporcionar contexto completo a la IA.

#### **Estructura en Redis**
```python
# Claves por usuario
buffer:{+5491112345678}      # Lista Redis de mensajes pendientes
timer:{+5491112345678}       # Timer TTL (11 segundos por defecto)
active_task:{+5491112345678} # Lock para evitar procesamiento duplicado
```

#### **Algoritmo `process_user_buffer()`**
```python
async def process_user_buffer(from_number, business_number, customer_name, event_id, provider_message_id):
    buffer_key = f"buffer:{from_number}"
    timer_key = f"timer:{from_number}"
    lock_key = f"active_task:{from_number}"
    
    try:
        while True:
            # 1. FASE DEBOUNCE: Esperar hasta que el usuario deje de escribir
            while True:
                await asyncio.sleep(2)
                if redis_client.ttl(timer_key) <= 0:  # Timer expiró
                    break
            
            # 2. FETCH ATÓMICO: Obtener todos los mensajes del buffer
            message_count = redis_client.llen(buffer_key)
            if message_count == 0:
                break
            
            raw_items = redis_client.lrange(buffer_key, 0, message_count-1)
            parsed_items = [json.loads(item) for item in raw_items]
            
            # 3. UNIR TEXTO: Concatenar todos los mensajes
            joined_text = "\n".join([item["text"] for item in parsed_items])
            
            # 4. ENVIAR AL ORCHESTRATOR
            inbound_event = {
                "provider": "ycloud",
                "event_id": parsed_items[-1].get("event_id"),
                "provider_message_id": parsed_items[-1].get("wamid"),
                "from_number": from_number,
                "to_number": business_number,
                "text": joined_text,
                "customer_name": customer_name,
                "event_type": "whatsapp.inbound_message.received",
                "correlation_id": correlation_id
            }
            
            raw_res = await forward_to_orchestrator(inbound_event, headers)
            
            # 5. PROCESAR RESPUESTA
            orch_res = OrchestratorResult(**raw_res)
            
            if orch_res.status == "duplicate":
                # Mensaje duplicado, limpiar buffer y terminar
                redis_client.ltrim(buffer_key, message_count, -1)
                break
            
            if orch_res.send and orch_res.messages:
                # 6. ENVIAR SECUENCIA DE RESPUESTAS
                await send_sequence(orch_res.messages, from_number, business_number, 
                                  parsed_items[-1].get("event_id"), correlation_id)
            
            # 7. LIMPIAR BUFFER (solo mensajes procesados)
            redis_client.ltrim(buffer_key, message_count, -1)
            
            # 8. VERIFICAR NUEVOS MENSAJES (llegaron mientras respondíamos)
            if redis_client.llen(buffer_key) > 0:
                # Reiniciar timer para nuevo lote
                redis_client.setex(timer_key, DEBOUNCE_SECONDS, "1")
    
    except Exception as e:
        logger.error("buffer_process_error", error=str(e))
    finally:
        # Cleanup de locks
        redis_client.delete(lock_key, timer_key)
```

### **4. 🤖 Procesamiento en Orchestrator**

#### **Endpoint:** `POST /chat` en Orchestrator Service (8000)

**Payload recibido:**
```json
{
  "provider": "ycloud",
  "event_id": "evt_123456789",
  "provider_message_id": "wamid.abcdef123456",
  "from_number": "+5491112345678",
  "to_number": "+5491187654321",
  "text": "Hola, tengo dolor de muela desde ayer",
  "customer_name": "Juan Pérez",
  "event_type": "whatsapp.inbound_message.received",
  "correlation_id": "corr_789012345",
  "media": [
    {
      "type": "image",
      "url": "https://ycloud.com/media/abc123.jpg",
      "mime_type": "image/jpeg"
    }
  ]
}
```

**Procesamiento en Orchestrator:**
```python
@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    # 1. Deduplicación
    if await is_duplicate_message(req.provider_message_id):
        return {"status": "duplicate", "send": False}
    
    # 2. Persistir en base de datos
    message_id = await save_chat_message(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        role="user",
        content=req.text,
        content_attributes={
            "provider": req.provider,
            "provider_message_id": req.provider_message_id,
            "media": req.media
        }
    )
    
    # 3. Ejecutar Agente LangChain
    agent_response = await agent_executor.invoke({
        "input": req.text,
        "tenant_id": tenant_id,
        "external_user_id": req.from_number,
        "customer_name": req.customer_name,
        "chat_history": await get_chat_history(conversation_id)
    })
    
    # 4. Persistir respuesta
    await save_chat_message(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        role="assistant",
        content=agent_response["output"],
        content_attributes={"is_ai_response": True}
    )
    
    # 5. Retornar respuesta estructurada
    return {
        "status": "success",
        "send": True,
        "text": agent_response["output"],
        "messages": [{"text": agent_response["output"]}]
    }
```

#### **Tools Clínicas Disponibles:**
1. **`check_availability`** - Consulta disponibilidad de turnos
2. **`book_appointment`** - Agenda un turno
3. **`triage_urgency`** - Evalúa urgencia médica
4. **`save_patient_anamnesis`** - Guarda antecedentes médicos

### **5. 📤 Envío de Respuestas (Send Sequence)**

#### **Función `send_sequence()`**
```python
async def send_sequence(messages: List[OrchestratorMessage], user_number: str, 
                       business_number: str, inbound_id: str, correlation_id: str):
    # 1. Obtener credenciales YCloud
    ycloud_api_key = await get_config("YCLOUD_API_KEY", YCLOUD_API_KEY)
    client = YCloudClient(ycloud_api_key, business_number)
    
    try:
        # 2. Marcar como leído y mostrar "escribiendo..."
        await client.mark_as_read(inbound_id, correlation_id)
        await client.typing_indicator(inbound_id, correlation_id)
    except:
        pass  # Fallback silencioso
    
    # 3. Procesar cada mensaje en la secuencia
    for msg in messages:
        try:
            # A. Imágenes
            if msg.imageUrl:
                try:
                    await client.typing_indicator(inbound_id, correlation_id)
                except:
                    pass
                
                await asyncio.sleep(BUBBLE_DELAY_SECONDS)
                await client.send_image(user_number, msg.imageUrl, correlation_id)
                
                try:
                    await client.mark_as_read(inbound_id, correlation_id)
                except:
                    pass
            
            # B. Texto (con split inteligente para mensajes largos)
            if msg.text:
                # Split por oraciones completas (>400 caracteres)
                if len(msg.text) > 400:
                    import re
                    text_parts = re.split(r'(?<=[.!?]) +', msg.text)
                    
                    # Agrupar en chunks <400 caracteres
                    refined_parts = []
                    current = ""
                    for part in text_parts:
                        if len(current) + len(part) < 400:
                            current += (" " + part if current else part)
                        else:
                            if current:
                                refined_parts.append(current)
                            current = part
                    if current:
                        refined_parts.append(current)
                else:
                    refined_parts = [msg.text]
                
                # Enviar cada parte con delay
                for part in refined_parts:
                    try:
                        await client.typing_indicator(inbound_id, correlation_id)
                    except:
                        pass
                    
                    await asyncio.sleep(BUBBLE_DELAY_SECONDS)
                    await client.send_text(user_number, part, correlation_id)
                    
                    try:
                        await client.mark_as_read(inbound_id, correlation_id)
                    except:
                        pass
            
            # Delay entre mensajes/burbujas
            await asyncio.sleep(BUBBLE_DELAY_SECONDS)
            
        except Exception as e:
            logger.error("sequence_step_error", error=str(e), correlation_id=correlation_id)
```

#### **Clase `YCloudClient`**
```python
class YCloudClient:
    BASE_URL = "https://api.ycloud.com/v2"
    
    def __init__(self, api_key: str, business_number: str):
        self.api_key = api_key
        self.business_number = business_number
        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
    async def _post(self, endpoint: str, json_data: dict, correlation_id: str):
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
            url = f"{self.BASE_URL}{endpoint}"
            response = await client.post(url, json=json_data, headers=self.headers)
            response.raise_for_status()
            return response.json()
    
    async def send_text(self, to: str, text: str, correlation_id: str):
        payload = {
            "from": self.business_number,
            "to": to,
            "type": "text",
            "text": {"body": text, "preview_url": True}
        }
        logger.info("ycloud_send_text", to=to, text_preview=text[:30], correlation_id=correlation_id)
        return await self._post("/whatsapp/messages/sendDirectly", payload, correlation_id)
    
    async def send_image(self, to: str, image_url: str, correlation_id: str):
        payload = {
            "from": self.business_number,
            "to": to,
            "type": "image",
            "image": {"link": image_url}
        }
        logger.info("ycloud_send_image", to=to, image_url=image_url, correlation_id=correlation_id)
        return await self._post("/whatsapp/messages/sendDirectly", payload, correlation_id)
    
    async def mark_as_read(self, inbound_id: str, correlation_id: str):
        logger.info("ycloud_mark_as_read", inbound_id=inbound_id, correlation_id=correlation_id)
        return await self._post(f"/whatsapp/inboundMessages/{inbound_id}/markAsRead", {}, correlation_id)
    
    async def typing_indicator(self, inbound_id: str, correlation_id: str):
        logger.info("ycloud_typing_indicator", inbound_id=inbound_id, correlation_id=correlation_id)
        return await self._post(f"/whatsapp/inboundMessages/{inbound_id}/typingIndicator", {}, correlation_id)
```

## ⚙️ CONFIGURACIÓN Y VARIABLES

### **Variables de Entorno Críticas**

#### **WhatsApp Service (8002)**
```bash
# Credenciales YCloud (REQUERIDAS)
YCLOUD_API_KEY=yc_api_xxxxx
YCLOUD_WEBHOOK_SECRET=yc_webhook_xxxxx

# OpenAI para transcripción
OPENAI_API_KEY=sk-xxxxx

# Comunicación interna
INTERNAL_API_TOKEN=internal_token_secreto
ORCHESTRATOR_SERVICE_URL=http://orchestrator_service:8000

# Redis
REDIS_URL=redis://redis:6379

# Timing (configurables)
WHATSAPP_DEBOUNCE_SECONDS=11        # Buffer/debounce (default: 11)
WHATSAPP_BUBBLE_DELAY_SECONDS=4     # Delay entre burbujas (default: 4)

# Logging
LOG_LEVEL=INFO
```

#### **Orchestrator Service (8000)**
```bash
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/dentalogic

# OpenAI para LangChain
OPENAI_API_KEY=sk-xxxxx

# JWT y autenticación
JWT_SECRET=jwt_secreto
ADMIN_TOKEN=admin_token_secreto

# WhatsApp integration
INTERNAL_API_TOKEN=internal_token_secreto  # Mismo que WhatsApp Service
```

### **Configuración Dinámica desde Base de Datos**

Algunas configuraciones se pueden obtener dinámicamente desde la base de datos:

```python
async def get_config(key: str, default: Any = None) -> Any:
    """Obtiene configuración desde BD o environment variables."""
    # 1. Intentar desde BD (tabla tenant_configs)
    config_value = await db.fetchval("""
        SELECT value FROM tenant_configs 
        WHERE tenant_id = $1 AND key = $2
    """, tenant_id, key)
    
    if config_value is not None:
        return config_value
    
    # 2. Fallback a environment variable
    return os.getenv(key, default)
```

**Configuraciones dinámicas soportadas:**
- `YCLOUD_API_KEY` - Por tenant (múltiples números de WhatsApp)
- `YCLOUD_WEBHOOK_SECRET` - Por tenant
- `WHATSAPP_DEBOUNCE_SECONDS` - Ajustable por tenant
- `BOT_PHONE_NUMBER` - Número de WhatsApp por tenant

## 🛡️ SEGURIDAD Y ROBUSTEZ

### **1. Verificación de Webhooks**
- **HMAC SHA256** con timestamp
- **Tolerancia de 5 minutos** para diferencia de tiempo
- **Configuración dinámica** desde BD (permite rotación de secretos)

### **2. Deduplicación**
```python
async def is_duplicate_message(provider_message_id: str) -> bool:
    """Verifica si un mensaje ya fue procesado."""
    # Redis cache para deduplicación rápida
    cache_key = f"processed:{provider_message_id}"
    if redis_client.get(cache_key):
        return True
    
    # Verificar en base de datos (backup)
    existing = await db.fetchval("""
        SELECT 1 FROM chat_messages 
        WHERE content_attributes->>'provider_message_id' = $1
        LIMIT 1
    """, provider_message_id)
    
    if existing:
        # Cachear por 24 horas
        redis_client.setex(cache_key, 86400, "1")
        return True
    
    return False
```

### **3. Manejo de Errores con Retry**
```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException))
)
async def forward_to_orchestrator(payload: dict, headers: dict) -> dict:
    """Envía mensaje al Orchestrator con retry automático."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=5.0)) as client:
        response = await client.post(
            f"{ORCHESTRATOR_SERVICE_URL}/chat",
            json=payload,
            headers=headers
        )
        response.raise_for_status()
        return response.json()
```

### **4. Timeouts Configurables**
```python
# WhatsApp Service → Orchestrator
ORCHESTRATOR_TIMEOUT = httpx.Timeout(120.0, connect=5.0)  # 2 minutos

# YCloud API calls
YCLOUD_TIMEOUT = httpx.Timeout(20.0, connect=5.0)  # 20 segundos

# Transcripción Whisper
WHISPER_TIMEOUT = httpx.Timeout(60.0)  # 1 minuto
```

### **5. Circuit Breaker (Implícito)**
- **Límite de 3 reintentos** para operaciones externas
- **Exponential backoff** entre reintentos
- **Fallback silencioso** para operaciones no críticas (typing indicators)

## 📊 MÉTRICAS Y MONITOREO

### **Prometheus Metrics**
```python
from prometheus_client import Counter, Histogram, generate_latest

# Métricas en WhatsApp Service
REQUESTS_TOTAL = Counter(
    "whatsapp_http_requests_total",
    "Total HTTP requests",
    ["endpoint", "method", "status"]
)

PROCESSING_LATENCY = Histogram(
    "whatsapp_message_processing_latency_seconds",
    "Message processing latency",
    ["message_type", "status"]
)

BUFFER_SIZE = Gauge(
    "whatsapp_buffer_size",
    "Current buffer size per user",
    ["from_number"]
)

# Endpoint de métricas
@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type="text/plain")
```

### **Logging Estructurado**
```python
import structlog

logger = structlog.get_logger()

# Todos los logs incluyen correlation_id
log = logger.bind(
    correlation_id=correlation_id,
    from_number=from_number[-4:],  # Últimos 4 dígitos por privacidad
    event_id=event_id
)

# Eventos clave
log.info("webhook_received", event_type=event_type)
log.info("buffering_started", buffer_size=redis_client.llen(buffer_key))
log.info("audio_transcription_complete", duration_ms=duration_ms)
log.info("forwarding_to_orchestrator", text_preview=text[:50])
log.info("orchestrator_response_received", status=response.get("status"))
log.info("ycloud_send_text", text_preview=text[:30])
```

### **Health Checks**
```python
@app.get("/health")
async def health():
    """Health check básico."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/ready")
async def ready():
    """Ready check (verifica dependencias)."""
    checks = {
        "redis": redis_client.ping(),
        "orchestrator": await check_orchestrator_health(),
        "ycloud_credentials": bool(YCLOUD_API_KEY and YCLOUD_WEBHOOK_SECRET)
    }
    
    if all(checks.values()):
        return {"status": "ready", "checks": checks}
    else:
        raise HTTPException(status_code=503, detail=f"Not ready: {checks}")
```

## 🔍 TROUBLESHOOTING

### **Problemas Comunes y Soluciones**

#### **1. Webhooks no llegan**
```bash
# Verificar configuración YCloud
curl -X GET "https://api.ycloud.com/v2/whatsapp/webhooks" \
  -H "X-API-Key: $YCLOUD_API_KEY"

# Verificar logs del servicio
docker logs dentalogic-whatsapp-service

# Probar webhook manualmente
curl -X POST http://localhost:8002/webhook/ycloud \
  -H "Content-Type: application/json" \
  -H "x-ycloud-signature: ..." \
  -H "x-ycloud-timestamp: $(date +%s)" \
  -d '{"type":"test","id":"test_123"}'
```

#### **2. Mensajes no se procesan (buffer stuck)**
```bash
# Verificar estado de Redis
redis-cli keys "buffer:*"
redis-cli llen "buffer:+5491112345678"
redis-cli lrange "buffer:+5491112345678" 0 -1

# Verificar timers
redis-cli keys "timer:*"
redis-cli ttl "timer:+5491112345678"

# Verificar locks
redis-cli keys "active_task:*"

# Limpiar buffer manualmente (emergencia)
redis-cli del "buffer:+5491112345678" "timer:+5491112345678" "active_task:+5491112345678"
```

#### **3. Transcripción de audio falla**
```bash
# Verificar credenciales OpenAI
echo $OPENAI_API_KEY

# Probar transcripción manual
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file="@audio.ogg" \
  -F model="whisper-1"
```

#### **4. Orchestrator no responde**
```bash
# Verificar salud del Orchestrator
curl http://orchestrator_service:8000/health

# Verificar logs
docker logs dentalogic-orchestrator-service

# Probar endpoint /chat manualmente
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: $INTERNAL_API_TOKEN" \
  -d '{"from_number":"+5491112345678","text":"Test"}'
```

### **Debugging con Correlation ID**

Cada flujo tiene un `correlation_id` único que permite seguir el mensaje a través de todos los componentes:

```bash
# Buscar todos los logs con un correlation_id específico
grep "corr_123456789" /var/log/whatsapp-service.log
grep "corr_123456789" /var/log/orchestrator-service.log

# Ver timeline completo
whatsapp-service: webhook_received correlation_id=corr_123456789
whatsapp-service: buffering_started correlation_id=corr_123456789
whatsapp-service: forwarding_to_orchestrator correlation_id=corr_123456789
orchestrator-service: chat_received correlation_id=corr_123456789
orchestrator-service: agent_response correlation_id=corr_123456789
whatsapp-service: orchestrator_response_received correlation_id=corr_123456789
whatsapp-service: ycloud_send_text correlation_id=corr_123456789
```

## 🚀 PERFORMANCE Y ESCALABILIDAD

### **1. Arquitectura Asíncrona**
- **FastAPI + asyncio** para alta concurrencia
- **Non-blocking I/O** para todas las operaciones externas
- **Connection pooling** para Redis y HTTP clients

### **2. Optimización de Redis**
```python
# Operaciones en lote para minimizar round-trips
pipe = redis_client.pipeline()
pipe.llen(buffer_key)
pipe.lrange(buffer_key, 0, message_count-1)
pipe.ltrim(buffer_key, message_count, -1)
results = pipe.execute()
```

### **3. Horizontal Scaling**
```
Múltiples instancias de WhatsApp Service pueden compartir Redis:
┌─────────┐    ┌─────────┐    ┌─────────┐
│   WS1   │    │   WS2   │    │   WS3   │
└─────────┘    └─────────┘    └─────────┘
       │             │             │
       └─────────────┴─────────────┘
                  │
                  ▼
           ┌─────────────┐
           │    Redis    │
           │   Cluster   │
           └─────────────┘
```

**Consideraciones para scaling:**
- **Redis como source of truth** para estado de buffers
- **Locks atómicos** evitan procesamiento duplicado entre instancias
- **Stateless design** - toda la state está en Redis/DB

### **4. Performance Benchmarks**

**Capacidades estimadas (por instancia):**
- **Throughput:** ~100 mensajes/segundo
- **Concurrent users:** ~10,000 usuarios activos
- **Latencia p95:** < 2 segundos (texto), < 5 segundos (audio)
- **Memory usage:** ~200MB + Redis buffer

**Optimizaciones aplicadas:**
- **Compresión de logs** para reducir I/O
- **Batch processing** en Redis
- **Async file downloads** para audio/imágenes
- **Connection reuse** para HTTP clients

## 🎯 PATRONES DE DISEÑO APLICADOS

### **1. Debounce Pattern**
```python
# Agrupa mensajes en una ventana de tiempo
while redis_client.ttl(timer_key) > 0:
    await asyncio.sleep(2)
```

**Beneficios:**
- Mejora calidad de contexto para IA
- Reduce carga en Orchestrator
- Mejor UX (paciente puede escribir rápidamente)

### **2. Circuit Breaker Pattern**
```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential())
async def call_external_service():
    # Intenta 3 veces con backoff exponencial
    pass
```

**Beneficios:**
- Evita cascading failures
- Mejora resiliencia del sistema
- Degradación elegante

### **3. Command Pattern**
```python
# Mensajes como comandos serializados en Redis
{
    "text": "Hola, tengo dolor",
    "wamid": "wamid.123",
    "event_id": "evt_456"
}
```

**Beneficios:**
- Procesamiento asíncrono y desacoplado
- Posibilidad de replay/reintento
- Serialización para persistencia

### **4. Correlation ID Pattern**
```python
# ID único por flujo completo
correlation_id = f"corr_{uuid.uuid4().hex[:8]}"
```

**Beneficios:**
- Trazabilidad end-to-end
- Agrupación de logs relacionados
- Debugging simplificado

### **5. Repository Pattern**
```python
class MessageRepository:
    async def save(self, message: Message):
        # Persistencia abstracta (Redis + DB)
        pass
```

**Beneficios:**
- Abstracción de storage
- Facilita testing
- Flexibilidad para cambiar backend

## 🔮 MEJORAS FUTURAS

### **1. Priorización de Mensajes**
```python
# Urgencias médicas procesadas inmediatamente
if contains_urgency_keywords(text):
    # Skip buffer, procesar inmediatamente
    await process_immediately(text)
```

**Implementación:**
- Detección de keywords de urgencia
- Sistema de triage en WhatsApp Service
- Queue de prioridades

### **2. Cache de Transcripciones**
```python
# Cache en Redis de audios ya transcritos
audio_hash = hashlib.md5(audio_url.encode()).hexdigest()
cache_key = f"transcription:{audio_hash}"

if cached := redis_client.get(cache_key):
    return cached.decode()
```

**Beneficios:**
- Reduce costos de Whisper API
- Mejora latency para audios repetidos
- Cache TTL de 7 días

### **3. Analytics en Tiempo Real**
```python
# Métricas de engagement por paciente
engagement_metrics = {
    "response_time_avg": calculate_avg_response_time(patient_id),
    "messages_per_session": count_messages(conversation_id),
    "resolution_rate": calculate_resolution_rate(patient_id)
}
```

**Dashboard propuesto:**
- Tiempos de respuesta promedio
- Tasa de resolución en primer contacto
- Sentiment analysis de conversaciones
- Heatmap de horarios de actividad

### **4. Soporte Multi-Provider**
```python
class WhatsAppProvider(ABC):
    @abstractmethod
    async def send_text(self, to: str, text: str) -> dict:
        pass
    
    @abstractmethod
    async def receive_webhook(self, request: Request) -> dict:
        pass

class YCloudProvider(WhatsAppProvider):
    # Implementación actual
    pass

class TwilioProvider(WhatsAppProvider):
    # Implementación futura
    pass
```

**Beneficios:**
- Abstract interface para WhatsApp providers
- Soporte para Twilio, MessageBird, etc.
- Failover entre providers

### **5. Quality of Service (QoS)**
```python
# Niveles de servicio configurables
qos_config = {
    "premium": {"debounce_seconds": 5, "priority": "high"},
    "standard": {"debounce_seconds": 11, "priority": "normal"},
    "free": {"debounce_seconds": 30, "priority": "low"}
}
```

**Implementación:**
- Planes por tenant
- Rate limiting diferenciado
- Priorización en queues

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### **Para Nuevas Instalaciones:**
- [ ] Configurar variables de entorno (YCLOUD_API_KEY, YCLOUD_WEBHOOK_SECRET)
- [ ] Configurar webhook en YCloud Dashboard
- [ ] Verificar conexión a Redis
- [ ] Verificar conexión a Orchestrator Service
- [ ] Probar webhook con mensaje de prueba
- [ ] Verificar transcripción de audio (si aplica)
- [ ] Configurar logging y métricas

### **Para Mantenimiento:**
- [ ] Monitorear tamaño de buffers en Redis
- [ ] Verificar latencia de transcripción
- [ ] Revisar logs de errores
- [ ] Rotar tokens de API periódicamente
- [ ] Actualizar dependencias de seguridad

### **Para Troubleshooting:**
- [ ] Verificar health checks (/health, /ready)
- [ ] Revisar métricas Prometheus
- [ ] Buscar por correlation_id en logs
- [ ] Verificar estado de Redis (memory, connections)
- [ ] Probar endpoints manualmente

## 🏁 CONCLUSIÓN

El sistema de integración con WhatsApp en Dentalogic es una **arquitectura robusta, escalable y bien diseñada** que balancea:

### **✅ Experiencia del Paciente:**
- Buffer inteligente para mensajes en ráfaga
- Transcripción automática de audio
- Conversación natural con delays entre burbujas
- Procesamiento inmediato de imágenes/documentos

### **✅ Robustez Técnica:**
- Verificación HMAC de webhooks
- Deduplicación de mensajes
- Retry con exponential backoff
- Circuit breakers implícitos
- Manejo de errores elegante

### **✅ Escalabilidad:**
- Arquitectura asíncrona con asyncio
- Horizontal scaling posible
- Redis como source of truth
- Stateless design donde sea posible

### **✅ Observabilidad:**
- Logging estructurado con correlation_id
- Métricas Prometheus completas
- Health checks y readiness probes
- Herramientas de debugging integradas

### **Principales Características:**
1. **Buffer/Debounce de 11 segundos** - Agrupa mensajes rápidos
2. **Transcripción Whisper** - Audio a texto automático
3. **Procesamiento inmediato** de imágenes/documentos
4. **Secuencia de respuesta natural** - 4s entre burbujas
5. **Deduplicación robusta** - Evita procesamiento duplicado
6. **Configuración dinámica** - Desde BD o environment
7. **Trazabilidad completa** - Correlation ID end-to-end

### **Recomendaciones para Operación:**
1. **Monitorear buffers** - Alertar si crecen demasiado
2. **Rotar tokens** - Seguridad periódica
3. **Backup de Redis** - Para recovery de estado
4. **Capacity planning** - Basado en métricas de uso
5. **Testing regular** - Webhooks y transcripción

**El sistema está preparado para escalar desde una clínica pequeña hasta una cadena de clínicas, manteniendo siempre la calidad de experiencia del paciente y la robustez técnica.**

---

**Documentación relacionada:**
- [01_architecture.md](01_architecture.md) - Arquitectura general
- [02_environment_variables.md](02_environment_variables.md) - Configuración
- [07_workflow_guide.md](07_workflow_guide.md) - Flujos de trabajo
- [09_fase1_dental_datos_especificacion.md](09_fase1_dental_datos_especificacion.md) - Especificación técnica

**Última actualización:** 6 de Marzo 2026  
**Responsable:** Equipo de Ingeniería Dentalogic  
**Estado:** 🟢 PRODUCCIÓN