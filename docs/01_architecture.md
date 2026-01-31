# Arquitectura del Sistema - Nexus v3

Este documento describe la estructura técnica, el flujo de datos y la interacción entre los componentes del proyecto.

## 1. Diagrama de Bloques (Conceptual)

```
Usuario WhatsApp
        |
        | Audio/Texto
        v
WhatsApp Service (8002)
  - YCloud Webhook
  - Deduplicación (Redis)
  - Transcripción (Whisper)
        |
        | POST /chat
        v
Orchestrator Service (8000)
  - LangChain Agent
  - Tools Embebidas (TN)
  - Memoria (20 msg)
  - Lockout (24h)
  - Socket.IO Server (Real-time)
        |
    ____|____
   /    |    \
  v     v     v
PostgreSQL Redis OpenAI
(Historial)(Locks)(LLM)
   |
   v
Platform UI (80)
Admin Dashboard
   |
   | WebSocket (Socket.IO)
   v
AgendaView (React)
   - FullCalendar
   - Real-time updates
```

## 2. Estructura de Microservicios (Nexus v3)

### A. WhatsApp Service (Puerto 8002)

**Tecnología:** FastAPI + httpx + Redis

**Función:** Puerta de enlace con YCloud

**Responsabilidades:**
- Webhook receiver: Valida firmas HMAC de YCloud
- Deduplicación: Redis lock (2 min TTL) para evitar duplicados
- Buffering: Espera 2 segundos para agrupar mensajes del usuario
- Transcripción: OpenAI Whisper para audios
- Envío de respuestas: Recibe JSON del Orchestrator, envía burbujas a YCloud
- Retry: Exponential backoff (3 intentos máximo)
- Métricas: Prometheus (http_requests_total, http_request_latency_seconds)

**Flujo de un Mensaje:**
```
1. YCloud webhook → /webhook/ycloud
2. Validar firma HMAC
3. Guardar message_id en Redis (dedup)
4. Si audio: Descargar + Whisper transcription
5. Buffer 2 segundos (agrupación)
6. POST /chat al Orchestrator
7. Recibir OrchestratorResult
8. Enviar burbujas a YCloud
```

### B. Orchestrator Service (Puerto 8000) - **El Cerebro**

**Tecnología:** FastAPI + LangChain + OpenAI + PostgreSQL + Redis

**Función:** Procesamiento de lenguaje natural, razonamiento y orquestación

**Componentes Principales:**

#### B1. LangChain Agent
- Sistema prompt: "Argentina Buena Onda" (tono informal, voseo)
- Contexto: Últimos 20 mensajes de la conversación
- Tools integradas:
  - `search_specific_products(q)` - Búsqueda por keyword
  - `search_by_category(category, keyword)` - Búsqueda filtrada
  - `browse_general_storefront()` - Catálogo completo (fallback)
  - `orders(q)` - Consulta estado de pedidos
  - `derivhumano(reason)` - Activar handoff a humano

#### B2. Gestión de Memoria
- **Redis:** Caché de tools, locks, estado efímero
- **PostgreSQL:** Historial persistente
- **Ventana:** 20 mensajes (configurable en SQL)
- **Tablas:** chat_conversations, chat_messages, chat_media

#### B3. Mecanismo de Silencio (24h Lockout)
- **Activación:** Via `derivhumano()` o echo de humano
- **Campo:** `human_override_until` (TIMESTAMPTZ)
- **Enforcement:** Chequea en inicio de `/chat`
- **Resultado:** Status `ignored`, sin procesamiento

#### B4. Multi-Tenancy
- Cada tenant: credenciales separadas (TN, SMTP, branding)
- Sync en startup: `sync_environment()` desde .env
- Soporte dinámico: Header `X-Tenant-ID`

#### B5. Herramientas Embebidas (Cambio v3)
Todas las herramientas de Tienda Nube están directamente en el Orchestrator (vs v2 que usaba microservicio externo).

```python
@tool
async def search_specific_products(q: str):
    """Busca en API Tienda Nube por keyword"""
    # Retorna: [{id, name, price, image_url, variants}, ...]

@tool
async def orders(q: str):
    """Consulta estado de pedido por ID"""
    # Retorna: {id, status, items, total, ...}
```

#### B6. Logging y Observabilidad
- **Structlog:** JSON logs (timestamp, event, service, endpoint)
- **System Events:** Tabla para auditar fallos críticos
- **Healthchecks:** `/health` (rápido), `/ready` (con DB check)

#### B7. WebSocket / Socket.IO (Real-time Updates)
- **Tecnología:** python-socketio (async mode)
- **Función:** Sincronización en tiempo real de la agenda
- **Eventos emitidos:**
  - `NEW_APPOINTMENT`: Cuando se crea un turno (WhatsApp bot o admin)
  - `APPOINTMENT_UPDATED`: Cuando se actualiza el estado de un turno
  - `APPOINTMENT_DELETED`: Cuando se cancela un turno
- **Implementación:**
  - Socket.IO server embebido en Orchestrator Service
  - Clientes React se conectan vía `socket.io-client`
  - CORS habilitado para conexiones desde el frontend
- **Uso:** AgendaView actualiza automáticamente sin recargar página

### C. Platform UI (Puerto 80)

**Tecnología:** Vanilla JavaScript + CSS (sin frameworks)

**Función:** Admin Dashboard multi-tenant

**Features:**
- Chats en tiempo real (polling 2s)
- Envío de mensajes manuales (override)
- Gestión de credenciales (TN, SMTP, YCloud)
- Logs y métricas
- Gestión de tenants
- Derivación manual a humanos
- Auto-detección de API URL

**Auto-detección de URL:**
```javascript
// Localhost: http://localhost:8000
// Producción (EasyPanel):
//   ui.domain.com → api.domain.com
//   platform-ui.domain.com → orchestrator-service.domain.com
```

### D. Servicios Auxiliares (Legacy/Opcional)

- **tiendanube_service (8001):** Funcionalidad movida a Orchestrator (deprecated)
- **bff_service (3000):** Backend-for-Frontend (opcional)
- **frontend_react (4173):** React admin (alternativa a Vanilla JS)

## 3. Flujo Completo de un Mensaje

### Recepción
```
Usuario: "Tenés puntas de danza talle 37?"
↓
YCloud webhook → WhatsApp Service
```

### Pre-procesamiento
```
Validar firma HMAC
↓
Guardar message_id en Redis (lock 2 min)
↓
No es audio, siguiente mensaje
↓
Esperar 2 seg (agrupación)
↓
POST /chat al Orchestrator
```

### Orquestación
```
Orchestrator recibe payload
↓
Buscar conversación (channel + from_number)
↓
Cargar últimos 20 mensajes de DB
↓
Inyectar system prompt + contexto
↓
LangChain agent inicia loop
```

### Razonamiento
```
LLM ve: "Tenés puntas de danza talle 37?"
↓
Agente decide: "Debo buscar productos"
↓
Ejecuta: search_specific_products("puntas de danza")
↓
Consulta API Tienda Nube
↓
Retorna: [{name: "Puntas...", price: 2500, image, variants}, ...]
```

### Respuesta
```
Agente genera JSON:
{
  "status": "ok",
  "send": true,
  "messages": [
    {"part": 1, "total": 3, "text": "Perfecto! Te muestro..."},
    {"part": 2, "total": 3, "imageUrl": "https://..."},
    {"part": 3, "total": 3, "text": "Pointe Coach...\nhttps://tienda..."}
  ]
}
```

### Entrega
```
WhatsApp Service recibe OrchestratorResult
↓
Itera cada mensaje
↓
Envía a YCloud: POST /api/send_message
↓
Guarda en DB: chat_messages (role: assistant)
```

## 4. Flujo de Actualización en Tiempo Real (WebSocket)

### Creación de Turno desde WhatsApp
```
Usuario: "Quiero agendar mañana a las 14:00"
↓
WhatsApp Service → Orchestrator
↓
book_appointment() tool ejecutado
↓
Turno insertado en PostgreSQL
↓
Emitir evento: NEW_APPOINTMENT
↓
Socket.IO broadcast a todos los clientes conectados
↓
AgendaView recibe evento
↓
setAppointments([...prevAppointments, newAppointment])
↓
FullCalendar actualiza automáticamente
```

### Actualización de Estado desde Admin
```
Admin cambia estado: "scheduled" → "confirmed"
↓
PUT /admin/appointments/{id}/status
↓
Estado actualizado en PostgreSQL
↓
Emitir evento: APPOINTMENT_UPDATED
↓
Socket.IO broadcast a todos los clientes conectados
↓
AgendaView recibe evento
↓
setAppointments(prevAppointments.map(apt => 
  apt.id === updated.id ? updated : apt
))
↓
FullCalendar actualiza color del evento
```

### Cancelación de Turno
```
Admin cancela turno
↓
PUT /admin/appointments/{id}/status con status="cancelled"
↓
Estado actualizado en PostgreSQL
↓
Emitir evento: APPOINTMENT_DELETED
↓
Socket.IO broadcast a todos los clientes conectados
↓
AgendaView recibe evento
↓
setAppointments(prevAppointments.filter(apt => apt.id !== deletedId))
↓
FullCalendar elimina evento automáticamente
```

## 5. Base de Datos (PostgreSQL)

### Tablas Principales

**tenants**
```
id (SERIAL PK)
store_name
bot_phone_number (UNIQUE)
tiendanube_store_id
tiendanube_access_token
store_website, store_description, store_catalog_knowledge
created_at, updated_at
```

**chat_conversations**
```
id (UUID PK)
tenant_id (FK)
channel (varchar: "whatsapp", etc.)
external_user_id (número de teléfono, etc.)
status (open, closed, archived)
human_override_until (TIMESTAMPTZ) ← Silencia bot si futuro
last_message_at, last_message_preview
created_at
UNIQUE(tenant_id, channel, external_user_id)
```

**chat_messages**
```
id (UUID PK)
conversation_id (FK)
role (user, assistant, system)
message_type (text, image, audio)
content (TEXT o JSON)
created_at
provider_status (sent, failed, delivered)
```

**chat_media**
```
id (UUID PK)
storage_url
media_type (image, audio, video)
provider_media_id
created_at
```

**tenant_human_handoff_config**
```
tenant_id (INTEGER PK, FK)
enabled (BOOLEAN)
destination_email
smtp_host, smtp_port, smtp_security, smtp_username
smtp_password_encrypted (pgcrypto)
handoff_message
created_at, updated_at
```

**system_events**
```
id (SERIAL PK)
level (info, warn, error)
event_type (http_request, tool_execution, smtp_failed)
message
metadata (JSONB)
created_at
```

## 6. Redis (Caché y Locks)

| Clave | TTL | Uso |
| :--- | :--- | :--- |
| `dedup:whatsapp:{message_id}` | 2 min | Evita duplicados |
| `lock:chat:{conversation_id}` | 30 seg | Race conditions |
| `cache:tool:{search_id}` | 1 hora | Caché de búsquedas |
| `override:chat:{conversation_id}` | 24 horas | Silencio de bot |
| `session:user:{user_id}` | 1 hora | Contexto temporal |

## 7. Flujo de Herramientas Embebidas

Todas las herramientas de Tienda Nube están en `orchestrator_service/main.py`:

```python
@tool
async def search_specific_products(q: str):
    """Busca productos por keyword en Tienda Nube"""
    headers = {
        "Authorization": f"Bearer {TIENDANUBE_ACCESS_TOKEN}",
        "User-Agent": "Langchain-Agent"
    }
    url = f"https://api.tiendanube.com/v1/{TIENDANUBE_STORE_ID}/products"
    params = {"q": q, "limit": 10}
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, params=params)
        products = resp.json()
    
    return [{
        "name": p["name"],
        "price": p["price"],
        "image_url": p["images"][0]["src"] if p["images"] else None,
        "description": p["description"],
        "variants": p.get("variants", [])
    } for p in products]
```

## 8. Observabilidad y Monitoreo

**Métricas (Prometheus):**
- `http_requests_total[service, endpoint, method, status]`
- `http_request_latency_seconds[service, endpoint]`
- `tool_calls_total[tool, status]`
- `llm_tokens_used[tenant_id]`

**Logs (Structlog JSON):**
```json
{
  "timestamp": "2025-01-30T10:23:45Z",
  "level": "info",
  "event": "request_completed",
  "service": "orchestrator_service",
  "endpoint": "/chat",
  "status_code": 200,
  "latency_ms": 1234,
  "correlation_id": "uuid-xxx"
}
```

**Healthchecks:**
- `GET /health` → rápido
- `GET /ready` → con DB check

## 9. Seguridad

- **HMAC Signature:** Todos los webhooks validan firma
- **Internal API Token:** Validación entre microservicios
- **Admin Token:** Protege endpoints sensibles
- **Encryption:** Contraseñas SMTP encriptadas (pgcrypto)
- **CORS:** Configurable según entorno

## 10. Performance

**Optimizaciones Nexus v3:**
- Herramientas embebidas (sin latencia de red)
- Ventana de contexto de 20 mensajes (menos tokens)
- Deduplicación en Redis (2 min TTL)
- Async everywhere (FastAPI + httpx + asyncio)
- Connection pooling (SQLAlchemy + Redis)

**Tiempos Típicos:**
```
Webhook → Respuesta enviada: 2-5 segundos
  - Pre-procesamiento: ~500ms
  - LLM + Tool call: ~2-3 seg
  - Envío a YCloud: ~200-500ms
```

---

*Documentación Nexus v3 © 2025*
