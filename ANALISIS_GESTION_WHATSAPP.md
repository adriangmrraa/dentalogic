# 📱 ANÁLISIS COMPLETO: GESTIÓN DE MENSAJES WHATSAPP EN DENTALOGIC

**Fecha:** 6 de Marzo 2026  
**Proyecto:** Dentalogic  
**Objetivo:** Entender cómo funciona la gestión completa de mensajes de WhatsApp

## 🏗️ ARQUITECTURA GENERAL

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

## 🔄 FLUJO COMPLETO DE MENSAJES

### **1. 📥 MENSAJES ENTRANTES (Webhook YCloud)**

#### **Endpoint:** `POST /webhook/ycloud`
- **Verificación de firma:** HMAC SHA256 con timestamp
- **Configuración dinámica:** Credenciales desde BD o environment
- **Tipos de mensajes soportados:**
  - `text` - Mensajes de texto
  - `audio` - Mensajes de voz (transcripción automática)
  - `image` - Imágenes con caption opcional
  - `document` - Documentos con caption opcional

#### **Procesamiento por tipo:**

**A. Mensajes de Texto y Audio (Sistema de Buffer):**
```
1. Mensaje llega → Webhook YCloud
2. Si es audio → Transcripción Whisper → Texto
3. Texto va a Redis Buffer (lista) con clave: `buffer:{from_number}`
4. Se activa Timer: `timer:{from_number}` (11 segundos por defecto)
5. Se crea Lock: `active_task:{from_number}` (evita duplicados)
6. Se inicia tarea asíncrona: `process_user_buffer()`
```

**B. Mensajes de Imagen/Documento (Procesamiento Inmediato):**
```
1. Mensaje llega → Webhook YCloud
2. Se extrae URL y metadata
3. Se envía inmediatamente al Orchestrator
4. No hay buffer (procesamiento directo)
```

### **2. ⏳ SISTEMA DE BUFFER Y DEBOUNCE**

#### **Objetivo:** Agrupar mensajes enviados en ráfaga por el usuario

```python
# Configuración (variables de entorno)
DEBOUNCE_SECONDS = 11      # Ventana sin mensajes nuevos antes de procesar
BUBBLE_DELAY_SECONDS = 4   # Delay entre cada burbuja de respuesta

# Estructura en Redis
buffer:{from_number}    # Lista de mensajes pendientes
timer:{from_number}     # Timer que se resetea con cada mensaje nuevo
active_task:{from_number} # Lock para evitar tareas duplicadas
```

#### **Algoritmo `process_user_buffer()`:**
```python
async def process_user_buffer(from_number, business_number, customer_name, event_id, provider_message_id):
    while True:
        # 1. FASE DEBOUNCE: Esperar hasta que el usuario deje de escribir
        while True:
            await asyncio.sleep(2)
            if redis.ttl(timer_key) <= 0:  # Timer expiró
                break
        
        # 2. FETCH ATÓMICO: Cuántos mensajes tenemos?
        message_count = redis.llen(buffer_key)
        if message_count == 0: break
        
        # 3. PROCESAR LOTE: Unir todos los mensajes del buffer
        raw_items = redis.lrange(buffer_key, 0, message_count-1)
        joined_text = "\n".join([item["text"] for item in parsed_items])
        
        # 4. ENVIAR AL ORCHESTRATOR
        response = await forward_to_orchestrator(inbound_event)
        
        # 5. ENVIAR RESPUESTA (si aplica)
        if response.send:
            await send_sequence(response.messages, from_number, business_number, event_id, correlation_id)
        
        # 6. LIMPIAR BUFFER (solo mensajes procesados)
        redis.ltrim(buffer_key, message_count, -1)
        
        # 7. VERIFICAR NUEVOS MENSAJES (llegaron mientras respondíamos)
        if redis.llen(buffer_key) > 0:
            # Reiniciar timer para nuevo lote
            redis.setex(timer_key, DEBOUNCE_SECONDS, "1")
```

### **3. 🎙️ TRANSCRIPCIÓN DE AUDIO (Whisper API)**

#### **Flujo:**
```
1. Audio URL de YCloud → Download
2. Envío a OpenAI Whisper API
3. Transcripción → Texto
4. Texto → Mismo buffer que mensajes de texto
```

#### **Implementación:**
```python
async def transcribe_audio(audio_url: str, correlation_id: str) -> Optional[str]:
    # 1. Descargar audio desde YCloud
    audio_data = await client.get(audio_url)
    
    # 2. Enviar a Whisper API
    files = {"file": ("audio.ogg", audio_data, "audio/ogg")}
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    
    response = await client.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers=headers,
        files=files,
        data={"model": "whisper-1"}
    )
    
    # 3. Retornar texto transcrito
    return response.json().get("text")
```

### **4. 🤖 PROCESAMIENTO EN ORCHESTRATOR**

#### **Endpoint:** `POST /chat` en Orchestrator Service

**Payload recibido:**
```json
{
  "provider": "ycloud",
  "event_id": "event_123",
  "provider_message_id": "wamid_456",
  "from_number": "+5491112345678",
  "to_number": "+5491187654321",
  "text": "Hola, tengo dolor de muela",
  "customer_name": "Juan Pérez",
  "event_type": "whatsapp.inbound_message.received",
  "correlation_id": "corr_789",
  "media": [  // Solo para imágenes/documentos
    {
      "type": "image",
      "url": "https://...",
      "mime_type": "image/jpeg"
    }
  ]
}
```

**Procesamiento:**
1. **Deduplicación:** Verificar si `provider_message_id` ya fue procesado
2. **Persistencia:** Guardar en `chat_messages` con `tenant_id`
3. **Agente LangChain:** Procesar con tools clínicas
4. **Generar respuesta:** Basada en contexto y herramientas

**Respuesta del Orchestrator:**
```json
{
  "status": "success",
  "send": true,
  "text": "Hola Juan, entiendo que tienes dolor de muela...",
  "messages": [
    {
      "text": "Primera parte del mensaje...",
      "imageUrl": null
    },
    {
      "text": "Segunda parte del mensaje...",
      "imageUrl": null
    }
  ]
}
```

### **5. 📤 ENVÍO DE RESPUESTAS (Send Sequence)**

#### **Función `send_sequence()`:**
```python
async def send_sequence(messages, user_number, business_number, inbound_id, correlation_id):
    # 1. Marcar como leído y typing indicator
    await client.mark_as_read(inbound_id, correlation_id)
    await client.typing_indicator(inbound_id, correlation_id)
    
    # 2. Procesar cada mensaje
    for msg in messages:
        # A. Imágenes
        if msg.imageUrl:
            await asyncio.sleep(BUBBLE_DELAY_SECONDS)
            await client.send_image(user_number, msg.imageUrl, correlation_id)
        
        # B. Texto (con split inteligente >400 caracteres)
        if msg.text:
            if len(msg.text) > 400:
                # Split por oraciones completas
                text_parts = re.split(r'(?<=[.!?]) +', msg.text)
                # Agrupar en chunks <400 caracteres
                refined_parts = group_text_parts(text_parts)
            else:
                refined_parts = [msg.text]
            
            # Enviar cada parte con delay
            for part in refined_parts:
                await asyncio.sleep(BUBBLE_DELAY_SECONDS)
                await client.typing_indicator(inbound_id, correlation_id)
                await client.send_text(user_number, part, correlation_id)
        
        # Delay entre mensajes
        await asyncio.sleep(BUBBLE_DELAY_SECONDS)
```

### **6. 🔧 YCLOUD CLIENT**

#### **Clase `YCloudClient`:**
```python
class YCloudClient:
    BASE_URL = "https://api.ycloud.com/v2"
    
    async def send_text(self, to: str, text: str, correlation_id: str):
        payload = {
            "from": self.business_number,
            "to": to,
            "type": "text",
            "text": {"body": text, "preview_url": True}
        }
        return await self._post("/whatsapp/messages/sendDirectly", payload, correlation_id)
    
    async def send_image(self, to: str, image_url: str, correlation_id: str):
        payload = {
            "from": self.business_number,
            "to": to,
            "type": "image",
            "image": {"link": image_url}
        }
        return await self._post("/whatsapp/messages/sendDirectly", payload, correlation_id)
    
    async def mark_as_read(self, inbound_id: str, correlation_id: str):
        return await self._post(f"/whatsapp/inboundMessages/{inbound_id}/markAsRead", {}, correlation_id)
    
    async def typing_indicator(self, inbound_id: str, correlation_id: str):
        return await self._post(f"/whatsapp/inboundMessages/{inbound_id}/typingIndicator", {}, correlation_id)
```

## ⚙️ CONFIGURACIÓN Y VARIABLES DE ENTORNO

### **WhatsApp Service:**
```bash
# Credenciales YCloud
YCLOUD_API_KEY=tu_api_key_ycloud
YCLOUD_WEBHOOK_SECRET=tu_webhook_secret

# OpenAI para transcripción
OPENAI_API_KEY=tu_api_key_openai

# Comunicación interna
INTERNAL_API_TOKEN=token_interno_secreto
ORCHESTRATOR_SERVICE_URL=http://orchestrator_service:8000

# Redis
REDIS_URL=redis://redis:6379

# Timing
WHATSAPP_DEBOUNCE_SECONDS=11        # Buffer/debounce
WHATSAPP_BUBBLE_DELAY_SECONDS=4     # Delay entre burbujas
```

### **Orchestrator Service:**
```bash
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/dentalogic

# OpenAI para LangChain
OPENAI_API_KEY=tu_api_key_openai

# JWT
JWT_SECRET=secreto_jwt
```

## 🛡️ SEGURIDAD Y ROBUSTEZ

### **1. Verificación de Firma (Webhook):**
- HMAC SHA256 con timestamp
- Tolerancia de 5 minutos para timestamp
- Configuración dinámica desde BD

### **2. Deduplicación:**
- Redis para tracking de mensajes procesados
- Evita procesamiento duplicado del mismo `provider_message_id`

### **3. Manejo de Errores:**
- Retry con backoff exponencial
- Logging estructurado con correlation_id
- Timeouts configurados para todas las llamadas externas

### **4. Rate Limiting (Implícito):**
- Buffer/debounce naturalmente limita el throughput
- Redis locks evitan procesamiento concurrente para el mismo usuario

## 📊 MÉTRICAS Y MONITOREO

### **Prometheus Metrics:**
```python
# En WhatsApp Service
REQUESTS = Counter("http_requests_total", "Total Request Count", 
                   ["service", "endpoint", "method", "status"])
LATENCY = Histogram("http_request_latency_seconds", "Request Latency", 
                    ["service", "endpoint"])

# Endpoint: /metrics
```

### **Logging Estructurado:**
- Todos los logs incluyen `correlation_id`
- Información de performance (latencia_ms)
- Eventos clave: `webhook_hit`, `buffering_started`, `audio_transcription_complete`

## 🔄 FLUJOS ESPECIALES

### **A. Mensajes en Ráfaga (Usuario escribe rápido):**
```
Usuario: "Hola"
(1 segundo después)
Usuario: "Tengo dolor"
(2 segundos después)  
Usuario: "En la muela izquierda"

→ Timer se resetea con cada mensaje
→ Después de 11 segundos sin mensajes: procesar lote completo
→ Orchestrator recibe: "Hola\nTengo dolor\nEn la muela izquierda"
```

### **B. Audio + Texto Combinado:**
```
Usuario: Envía audio de 30 segundos
→ Transcripción: "Me duele mucho la muela"
Usuario: (inmediatamente) "Desde ayer"

→ Ambos van al buffer
→ Procesamiento conjunto: "Me duele mucho la muela\nDesde ayer"
```

### **C. Imágenes/Documentos:**
```
Usuario: Envía radiografía (imagen)
→ Procesamiento inmediato (sin buffer)
→ URL enviada al Orchestrator
→ Posible respuesta: "Gracias por la radiografía, la Dra. la revisará"
```

## ⏰ SISTEMA DE TIMERS Y GESTIÓN DE CONCURRENCIA

### **1. Timer de Debounce (`timer:{from_number}`):**
- **Propósito:** Determinar cuándo el usuario ha terminado de escribir
- **Duración:** 11 segundos por defecto (`WHATSAPP_DEBOUNCE_SECONDS`)
- **Reset:** Cada mensaje nuevo reinicia el timer
- **Expiración:** Cuando el timer expira, se procesa el buffer

### **2. Lock de Tarea Activa (`active_task:{from_number}`):**
- **Propósito:** Evitar múltiples tareas de procesamiento para el mismo usuario
- **Duración:** 60 segundos (timeout de seguridad)
- **Mecanismo:** Check-and-set atómico en Redis
- **Cleanup:** Se elimina al finalizar el procesamiento (finally block)

### **3. Gestión de Concurrencia:**
```python
# Cuando llega un mensaje nuevo
if not redis_client.get(lock_key):  # ¿Ya hay una tarea activa?
    redis_client.setex(lock_key, 60, "1")  # Crear lock
    asyncio.create_task(process_user_buffer(...))  # Iniciar tarea
```

## 🚀 PERFORMANCE Y OPTIMIZACIONES

### **1. Procesamiento Asíncrono:**
- **`asyncio.create_task()`** para no bloquear el webhook
- **Operaciones Redis asíncronas** (aunque redis-py es síncrono, se usa en thread pool)
- **HTTP calls con timeout** configurados

### **2. Atomicidad en Redis:**
- **`ltrim` atómico** para remover solo mensajes procesados
- **Check de `llen` antes y después** para detectar nuevos mensajes
- **Operaciones en lote** para minimizar round-trips

### **3. Timeouts Configurables:**
```python
# WhatsApp Service → Orchestrator
httpx.Timeout(120.0, connect=5.0)  # 2 minutos para respuesta larga

# YCloud API calls
httpx.Timeout(20.0, connect=5.0)   # 20 segundos para enviar mensaje

# Transcripción Whisper
httpx.Timeout(60.0)                # 1 minuto para transcripción
```

## 🐛 CASOS BORDE Y MANEJO DE ERRORES

### **1. Mensajes Duplicados:**
```python
# Orchestrator responde con:
{
  "status": "duplicate",
  "send": false
}

# WhatsApp Service: limpiar buffer y terminar
redis_client.ltrim(buffer_key, message_count, -1)
break  # Salir del loop
```

### **2. Fallo en Transcripción:**
- Log de error pero continuar procesamiento
- Mensaje de audio ignorado (no va al buffer)
- Usuario puede reenviar como texto

### **3. Orchestrator No Disponible:**
- Retry con backoff exponencial (3 intentos)
- Log de error con correlation_id
- Mensaje permanece en buffer para reintento posterior

### **4. YCloud API Rate Limit:**
- Retry automático (2 intentos)
- Exponential backoff: 1s, 4s
- Log de warning

## 🔍 DEBUGGING Y TROUBLESHOOTING

### **Logs Clave para Monitorear:**
```
# Webhook recibido
"webhook_hit", headers=...

# Buffer activado  
"buffering_started", from_number=...

# Transcripción
"audio_transcription_complete", duration_ms=...

# Envío a Orchestrator
"forwarding_to_orchestrator", text_preview=...

# Respuesta del Orchestrator
"orchestrator_response_received", status=..., send=...

# Envío a YCloud
"ycloud_send_text", text_preview=...
```

### **Herramientas de Debug:**
```bash
# Ver estado de buffers en Redis
redis-cli keys "buffer:*"
redis-cli llen "buffer:+5491112345678"
redis-cli lrange "buffer:+5491112345678" 0 -1

# Ver timers activos
redis-cli keys "timer:*"
redis-cli ttl "timer:+5491112345678"

# Ver locks
redis-cli keys "active_task:*"
```

## 📈 ESCALABILIDAD

### **1. Horizontal Scaling:**
- Múltiples instancias de WhatsApp Service pueden compartir Redis
- Redis como source of truth para estado de buffers
- Locks evitan procesamiento duplicado entre instancias

### **2. Redis Optimization:**
- Claves con TTL automático (evitan memory leak)
- Operaciones atómicas (evitan race conditions)
- Connection pooling para performance

### **3. Async Architecture:**
- FastAPI + asyncio para alta concurrencia
- Non-blocking I/O para todas las operaciones externas
- Task management con asyncio.create_task()

## 🎯 PATRONES DE DISEÑO APLICADOS

### **1. Circuit Breaker (Implícito):**
- Retry con límite de intentos
- Fallback a comportamiento seguro
- Timeouts para evitar bloqueos

### **2. Debounce Pattern:**
- Agrupación de mensajes en ventana de tiempo
- Mejora calidad de contexto para IA
- Reduce carga en Orchestrator

### **3. Command Pattern:**
- Mensajes como comandos serializados en Redis
- Procesamiento asíncrono y desacoplado
- Posibilidad de replay/reintento

### **4. Correlation ID Pattern:**
- ID único por flujo completo
- Trazabilidad end-to-end
- Agrupación de logs relacionados

## 🔮 MEJORAS FUTURAS POSIBLES

### **1. Priorización de Mensajes:**
- Urgencias médicas procesadas inmediatamente (sin buffer)
- Sistema de triage en WhatsApp Service

### **2. Cache de Transcripciones:**
- Cache en Redis de audios ya transcritos
- Reduce costos de Whisper API
- Mejora latency para audios repetidos

### **3. Analytics en Tiempo Real:**
- Métricas de engagement por paciente
- Tiempos de respuesta promedio
- Tasa de resolución en primer contacto

### **4. Soporte Multi-Provider:**
- Abstract interface para WhatsApp providers
- Soporte para Twilio, MessageBird, etc.
- Failover entre providers

## 🏁 CONCLUSIÓN

El sistema de gestión de mensajes de WhatsApp en Dentalogic es **robusto, escalable y bien diseñado**, con:

### **✅ Fortalezas:**
1. **Buffer inteligente** para mensajes en ráfaga
2. **Transcripción automática** de audio con Whisper
3. **Debounce configurable** para mejor UX
4. **Gestión de concurrencia** con Redis locks
5. **Trazabilidad completa** con correlation_id
6. **Manejo de errores** con retry y fallbacks
7. **Arquitectura asíncrona** para alta performance

### **🔧 Características Clave:**
- **11 segundos de debounce** para agrupar mensajes rápidos
- **4 segundos entre burbujas** para conversación natural
- **Procesamiento inmediato** de imágenes/documentos
- **Deduplicación** para evitar procesamiento duplicado
- **Configuración dinámica** desde base de datos

### **🚀 Performance:**
- **Alta concurrencia** con asyncio
- **Baja latencia** en webhook response
- **Escalabilidad horizontal** posible
- **Monitoring completo** con métricas y logs

**El sistema está optimizado para la experiencia del paciente mientras mantiene robustez y escalabilidad para la clínica.**

##