# Guía para Desarrolladores - Mantenimiento y Extensión

Este documento contiene tips técnicos para mantener, debugear y extender Nexus v3.

## 1. Agregar una Nueva Herramienta (Tool)

### Paso 1: Definir la Función en main.py

Ubicación: `orchestrator_service/main.py`, alrededor de línea 715+

```python
from langchain.tools import tool

@tool
async def mi_nueva_herramienta(parametro1: str, parametro2: int = 10):
    """
    Descripción clara de qué hace esta herramienta.
    
    Parámetros:
    - parametro1: Descripción
    - parametro2: Descripción (default: 10)
    
    Retorna:
    - resultado: Tipo de dato
    
    Ejemplo:
    >>> await mi_nueva_herramienta("búsqueda", 5)
    {"items": [...], "total": 42}
    """
    # Tu lógica aquí
    try:
        # Implementación
        result = await fetch_data(parametro1, parametro2)
        return result
    except Exception as e:
        logger.error("tool_mi_nueva_herramienta_failed", error=str(e))
        return {"error": str(e), "ok": False}
```

### Paso 2: Agregar a la Lista de Tools

Busca alrededor de línea 860:

```python
tools = [
    search_specific_products,
    search_by_category,
    browse_general_storefront,
    orders,
    derivhumano,
    mi_nueva_herramienta,  # ← Agregar aquí
]
```

### Paso 3: Actualizar el System Prompt (Opcional)

Si la nueva tool necesita explicación, agrégala al system prompt para que el LLM sepa cuándo usarla:

```python
sys_template = """
...
HERRAMIENTAS DISPONIBLES:
1. search_specific_products: Para búsquedas generales
2. search_by_category: Para búsquedas dentro de una categoría
3. mi_nueva_herramienta: Para [propósito específico]
...
"""
```

### Paso 4: Testear Localmente

```bash
# En desarrollo, usa verify_phases.py
python verify_phases.py

# O prueba directamente:
cd orchestrator_service
python -m pytest tests/ -v
```

### Ejemplo Completo: Herramienta de Cupones

```python
@tool
async def listar_cupones(categoria: Optional[str] = None):
    """
    Lista cupones vigentes. Opcionalmente filtra por categoría.
    
    Parámetros:
    - categoria: "puntas", "leotardos", etc. (opcional)
    
    Retorna:
    - cupones: [{"codigo": "DESCUENTO10", "descuento": 10, "valido_hasta": "2025-02-28"}, ...]
    """
    try:
        # Llamar a n8n MCP Bridge si es lógica compleja
        result = await call_mcp_tool("get_coupons", {"category": categoria})
        return result
    except Exception as e:
        logger.error("listar_cupones_failed", error=str(e))
        return {"error": "No puedo acceder a cupones en este momento"}
```

## 2. Manejo de Memoria

### 2.1 Ventana de Contexto

El sistema carga los últimos **20 mensajes** de cada conversación.

**Para cambiar el tamaño:**

Busca en `main.py`:
```python
# En la función chat_endpoint
messages = await db.pool.fetch("""
    SELECT role, content FROM chat_messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT 20  ← CAMBIAR ESTE NÚMERO
    ORDER BY created_at ASC
""", conversation_id)
```

**Impacto:**
- Más mensajes = más contexto, pero más tokens (costo ↑, latencia ↑)
- Menos mensajes = menos contexto, pero más rápido y barato

### 2.2 Redis para Estado Efímero

Redis almacena datos que expiran:

```python
# Guardar algo temporalmente
redis_client.setex(f"cache:key:{id}", 3600, json.dumps(data))  # 1 hora

# Leer
data = redis_client.get(f"cache:key:{id}")
if data:
    parsed = json.loads(data)

# Eliminar
redis_client.delete(f"cache:key:{id}")
```

**Claves comunes:**
- `dedup:whatsapp:{message_id}` - Evita duplicados (2 min)
- `cache:tool:{search_id}` - Caché de búsquedas (1 hora)
- `override:chat:{conversation_id}` - Lockout de 24h

### 2.3 PostgreSQL para Historial Persistente

Todos los mensajes se guardan en `chat_messages`:

```python
# Insertar mensaje
await db.pool.execute("""
    INSERT INTO chat_messages 
    (id, conversation_id, role, content, created_at)
    VALUES ($1, $2, $3, $4, NOW())
""", uuid.uuid4(), conversation_id, "user", user_message)

# Cargar historial
history = await db.pool.fetch("""
    SELECT role, content FROM chat_messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
""", conversation_id)
```

## 3. Deduplicación de Mensajes

**Problema:** WhatsApp a veces reintenta enviar el mismo webhook si no recibe 200 rápido.

**Solución:** Redis lock de 2 minutos

```python
# En whatsapp_service/main.py
async def forward_to_orchestrator(payload):
    message_id = payload["provider_message_id"]
    
    # Chequear si ya existe
    if redis_client.get(f"dedup:whatsapp:{message_id}"):
        return {"status": "duplicate"}
    
    # Guardar lock
    redis_client.setex(f"dedup:whatsapp:{message_id}", 120, "1")
    
    # Procesar
    result = await client.post(f"{ORCHESTRATOR_URL}/chat", json=payload)
    return result.json()
```

**Si ves el bot respondiendo doble:**
```bash
# Verificar que Redis está corriendo
redis-cli -h redis ping

# Ver claves de dedup
redis-cli KEYS "dedup:*"

# Resetear (en desarrollo)
redis-cli FLUSHDB
```

## 4. Debugging

### 4.1 Ver Logs en Tiempo Real

**Desarrollo local (docker-compose):**
```bash
docker-compose logs -f orchestrator_service
docker-compose logs -f whatsapp_service
```

**Producción (EasyPanel):**
```
Service → Logs → Live
```

### 4.2 Buscar Errores Específicos

```bash
# Buscar "error"
docker-compose logs orchestrator_service | grep -i error

# Buscar eventos específicos
docker-compose logs orchestrator_service | grep "mcp_bridge"
```

### 4.3 Probar el Agente Localmente

**Script de prueba:** `verify_phases.py`

```bash
cd /proyecto
python verify_phases.py

# Te pregunta qué escribir, simula la IA sin realmente llamar a OpenAI
# Útil para testear lógica de razonamiento
```

### 4.4 Conectarse a Postgres en Producción

```bash
# Desde EasyPanel console
psql -U postgres -h postgres -d nexus_db

# Ver todas las conversaciones
SELECT id, channel, external_user_id, status FROM chat_conversations;

# Ver últimos mensajes de una conversación
SELECT role, content, created_at FROM chat_messages
WHERE conversation_id = 'uuid-xxx'
ORDER BY created_at DESC
LIMIT 10;

# Ver if override está activo
SELECT conversation_id, human_override_until FROM chat_conversations
WHERE human_override_until > NOW();
```

## 5. Bridge MCP (n8n)

Para herramientas complejas que no quieres en el Orchestrator, usá n8n MCP:

### 5.1 Llamar a n8n desde el Agente

```python
@tool
async def get_promotions(category: Optional[str] = None):
    """Obtiene promociones vigentes del sistema de n8n"""
    result = await call_mcp_tool("get_promotions", {
        "category": category
    })
    return result
```

### 5.2 Implementar en n8n

1. Crear un webhook en n8n que acepte JSON-RPC
2. Implementar los métodos: `tools/call`, `initialize`, etc. (protocolo MCP)
3. Configurar URL en `MCP_URL` env var

**Ejemplo de flujo n8n:**
```
JSON-RPC Request
  ↓
Parse parameters
  ↓
Query cupones de base de datos
  ↓
Filter por categoría si aplica
  ↓
Return JSON-RPC Response
```

## 6. Tips de Performance

### 6.1 Prompt Size

Si el `STORE_CATALOG_KNOWLEDGE` es muy grande (> 2000 caracteres):
- **Problema:** El prompt es muy largo, consume muchos tokens
- **Solución:** Usar una tool de búsqueda en lugar de inyectar todo

```python
# MAL: Inyectar todo
STORE_CATALOG_KNOWLEDGE = "Categoría 1: ..., Categoría 2: ..., ... [muy largo]"

# BIEN: Crear una tool
@tool
async def get_catalog():
    """Retorna catálogo completo"""
    return catalog_data
```

### 6.2 Async Everywhere

**MAL:**
```python
import requests
response = requests.get(url)  # SÍNCRONO
```

**BIEN:**
```python
import httpx
async with httpx.AsyncClient() as client:
    response = await client.get(url)  # ASINCRÓNICO
```

### 6.3 Connection Pooling

SQLAlchemy y Redis automáticamente hacen pooling. No crear conexiones nuevas cada vez.

### 6.4 Caché de Búsquedas

Si una búsqueda es costosa, cacheala:

```python
# Chequear caché primero
cached = redis_client.get(f"cache:search:{q}")
if cached:
    return json.loads(cached)

# Si no existe, hacer búsqueda
results = await api.search(q)

# Guardar en caché (1 hora)
redis_client.setex(f"cache:search:{q}", 3600, json.dumps(results))

return results
```

## 7. Agregar una Nueva Ruta API

Si necesitas un nuevo endpoint:

```python
# En orchestrator_service/main.py

@app.post("/custom/my-endpoint")
async def my_endpoint(request: MyRequestModel, x_tenant_id: str = Header(None)):
    """
    Mi nueva ruta personalizada.
    """
    try:
        # Tu lógica
        tenant_id = int(x_tenant_id) if x_tenant_id else None
        result = await do_something(tenant_id)
        return {"status": "ok", "data": result}
    except Exception as e:
        logger.error("my_endpoint_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

## 8. Metricas y Observabilidad

### 8.1 Agregar una Métrica Personalizada

```python
from prometheus_client import Counter, Histogram

MY_CUSTOM_COUNTER = Counter(
    'my_custom_total', 
    'Descripción de mi métrica',
    ['status']
)

MY_CUSTOM_HISTOGRAM = Histogram(
    'my_custom_seconds',
    'Latencia de mi operación',
    ['operation']
)

# Usar
MY_CUSTOM_COUNTER.labels(status='success').inc()
MY_CUSTOM_HISTOGRAM.labels(operation='search').observe(time_taken)
```

### 8.2 Ver Métricas

```
GET http://localhost:8000/metrics
```

Retorna todas las métricas en formato Prometheus.

## 9. Testing

### 9.1 Test de Tools

```python
# tests/test_tools.py

import pytest

@pytest.mark.asyncio
async def test_search_specific_products():
    result = await search_specific_products("puntas")
    assert isinstance(result, list)
    assert len(result) > 0
    assert "name" in result[0]
```

### 9.2 Correr Tests

```bash
cd /proyecto
pytest tests/ -v
```

## 10. Versioning y Migración

### 10.1 Cambios en la BD

Si necesitas agregar una columna o tabla:

1. Editar `db/init/001_schema.sql` o crear nuevo `002_*.sql`
2. El Orchestrator ejecuta migraciones en startup (lifespan event)
3. Migraciones son idempotentes (CREATE TABLE IF NOT EXISTS)

### 10.2 Cambios en Modelos Pydantic

```python
# MAL: Cambiar un campo sin migración
class ChatMessage(BaseModel):
    id: str
    text: str  # Antes era "content"

# BIEN: Mantener compatibilidad hacia atrás
class ChatMessage(BaseModel):
    id: str
    content: Optional[str] = None  # Viejo
    text: Optional[str] = None  # Nuevo
    
    @field_validator('content', mode='before')
    def use_text_if_no_content(cls, v, values):
        return v or values.get('text')
```

## 11. Security Best Practices

### 11.1 Validar Inputs

```python
@app.post("/chat")
async def chat_endpoint(payload: InboundChatEvent):
    # Pydantic valida automáticamente
    
    # Validaciones adicionales
    if len(payload.text) > 10000:
        raise HTTPException(status_code=400, detail="Mensaje muy largo")
```

### 11.2 Encriptar Datos Sensibles

```python
# Contraseñas SMTP en la BD
from utils import encrypt_password, decrypt_password

encrypted = encrypt_password("my-password")
# Guardar en BD
# ...
decrypted = decrypt_password(encrypted)
```

### 11.3 Validar Firmas

```python
import hmac
import hashlib

def validate_signature(payload: str, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

*Guía de Desarrolladores Nexus v3 © 2025*
