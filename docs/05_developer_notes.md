# Guía para Desarrolladores (Mantenimiento)

Este documento contiene tips técnicos para mantener, debugear y extender el sistema de Pointe Coach.

## 1. Tips de Implementación

### Agregar una nueva Tool
1. Definí la función asincrónica en `orchestrator_service/main.py`.
2. Usá el decorador `@tool`.
3. Aseguráte de que el `docstring` sea muy descriptivo, ya que es lo que la IA usa para entender cuándo llamarla.
4. Agregá la función a la lista `tools = [...]` cerca de la línea 860.

### Manejo de la Memoria
El sistema usa un "Windowed Memory" (ventana de contexto). En cada solicitud al Orchestrator, se cargan los últimos 20 mensajes de la tabla `chat_messages`. 
- Si querés aumentar o disminuir este número, buscá `limit=20` en la consulta SQL dentro de `chat_endpoint`.

### Deduplicación de Mensajes
WhatsApp a veces reintenta enviar el mismo webhook si no recibe un 200 rápido.
- Usamos Redis para guardar el `provider_message_id` por 2 minutos.
- Si llega el mismo ID antes de que expire, el Orchestrator retornará un status `duplicate` y no procesará nada.

## 2. Depuración (Debugging)

### Ver logs en tiempo real
Si usas EasyPanel:
```bash
# Para el orquestador
tail -f /logs/orchestrator.log # o usa la consola de EasyPanel
```
Buscá los eventos `mcp_handshake_start` para ver si las llamadas a n8n están funcionando.

### Probar el Agente localmente
Podés usar el script `verify_phases.py` para simular entradas de usuario y ver cómo razona la cadena de LangChain sin tener que mandar mensajes reales por WhatsApp.

## 3. Base de Datos (PostgreSQL)

### Resetear esquema
Si hacés cambios estructurales en los modelos de la DB y querés que se re-generen:
1. Entrá al contenedor de Postgres.
2. Borrá la tabla `system_events` o `chat_messages`.
3. Al reiniciar el Orchestrator, el bloque `lifespan` intentará ejecutar los SQL de `001_schema.sql`.

## 4. El Bridge MCP (n8n)
Algunas herramientas complejas (como listar cupones que requieren lógica de filtrado pesada) están delegadas a n8n.
- El Orchestrator habla con n8n usando el protocolo **MCP (Model Context Protocol)**.
- La URL se define en `MCP_URL`.
- Si una herramienta de n8n falla, revisá el "Execution History" dentro de n8n.

## 5. Tips de Performance
- **Prompt Size:** El sistema inyecta el catálogo en el prompt. Si el catálogo crece mucho, considerá usar una Tool de búsqueda en lugar de inyectar todo el texto para no exceder el límite de tokens de GPT-4o-mini.
- **Async Everywhere:** Todo el I/O (llamadas a API, DB, Redis) debe ser `async`. No uses `requests`, usá `httpx`.
