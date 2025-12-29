# Guía de Despliegue en EasyPanel

El proyecto está optimizado para ser desplegado en **EasyPanel** como una aplicación de múltiples servicios.

## 1. Estructura del Proyecto en EasyPanel

Crea un "New Project" y agrega los siguientes servicios:

### A. Base de Datos y Caché (Add-ons)
1. Agregá un servicio de **PostgreSQL**.
2. Agregá un servicio de **Redis**.
*Anotá las URLs de conexión para usarlas en los servicios de Python.*

### B. Microservicios (App Services)

Para cada servicio, configurá el "Source" vinculando tu repositorio de GitHub.

#### 1. WhatsApp Service (Público)
- **Puerto del Container:** `8002`.
- **Dominio:** Asignale un dominio público con HTTPS (ej: `wa.tudominio.com`). Este es el URL que debés poner en el panel de YCloud como Webhook URL.
- **Ruta:** Apuntá a la carpeta `whatsapp_service/` si el repositorio es compartido, o usá el Dockerfile de esa carpeta.

#### 2. Orchestrator Service (Interno)
- **Puerto del Container:** `8000`.
- **Acceso:** No necesita dominio público. Puede ser accesible vía la red interna de EasyPanel (ej: `orchestrator:8000`).
- **Healthcheck:** Ruta `/health` en el puerto `8000`.

#### 3. Platform UI (Público)
- **Puerto del Container:** `80`.
- **Dominio:** Asignale un dominio público para acceder al panel (ej: `admin.tudominio.com`).

## 2. Configuración de Puertos y Networking

| Servicio | Puerto Interno | Exposición Pública |
| :--- | :--- | :--- |
| `whatsapp_service` | `8002` | **SÍ** (para Webhooks) |
| `orchestrator_service` | `8000` | NO (Recomendado) |
| `platform_ui` | `80` | **SÍ** (para el Admin) |

## 3. Pasos Críticos Post-Despliegue

1. **Migraciones de Base de Datos:** El `orchestrator_service` ejecuta las migraciones automáticamente al iniciar (vía el evento `lifespan` en `main.py`). Si la base de datos es nueva, verás que se crean las tablas `tenants`, `chat_conversations`, etc.
2. **Configuración de Webhooks:**
   - En YCloud, configurá la URL: `https://wa.tudominio.com/webhook/ycloud`.
   - Aseguráte de que el `YCLOUD_WEBHOOK_SECRET` coincida en ambos lados.
3. **Internal Tokens:** Verificá que el `INTERNAL_API_TOKEN` sea el mismo en `whatsapp_service` y `orchestrator_service`, de lo contrario las llamadas serán rechazadas con 401.

## 4. Troubleshooting en EasyPanel

- **Error 500 en /chat:** Revisá los logs del Orchestrator. Suele ser una variable de entorno faltante (como `OPENAI_API_KEY`) o un error de conexión con Postgres.
- **El bot no responde:** Si los logs del `whatsapp_service` muestran que el mensaje llegó pero el bot no habla, verificá que `ORCHESTRATOR_SERVICE_URL` sea correcto. Si usás el nombre de servicio de EasyPanel, recordá incluir el puerto (ej: `http://orchestrator:8000`).
