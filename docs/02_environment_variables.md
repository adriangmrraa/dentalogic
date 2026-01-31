# Variables de Entorno - Guía Completa

Este proyecto se configura completamente mediante variables de entorno. En despliegue de EasyPanel, carga estas variables para cada microservicio.

## 1. Variables Globales (Todos los Servicios)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `INTERNAL_API_TOKEN` | Token de seguridad entre microservicios | `compu-global-hyper-mega-net` | ✅ |
| `OPENAI_API_KEY` | Clave API de OpenAI (GPT-4o-mini + Whisper) | `sk-proj-xxxxx` | ✅ |
| `REDIS_URL` | URL de conexión a Redis | `redis://redis:6379` | ✅ |
| `POSTGRES_DSN` | URL de conexión a PostgreSQL | `postgres://user:pass@db:5432/database` | ✅ |

## 2. Orchestrator Service (8000)

### 2.1 Identidad y Branding (Whitelabel)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `STORE_NAME` | Nombre de la tienda | `Pointe Coach` | ✅ |
| `BOT_PHONE_NUMBER` | Número de WhatsApp del bot | `+5493756123456` | ✅ |
| `STORE_LOCATION` | Ciudad/País | `Paraná, Entre Ríos, Argentina` | ❌ |
| `STORE_WEBSITE` | URL de la tienda online | `https://www.pointecoach.shop` | ❌ |
| `STORE_DESCRIPTION` | Qué vende la tienda | `Artículos de danza y gimnasia` | ❌ |
| `STORE_CATALOG_KNOWLEDGE` | Categorías/marcas principales (para inyectar en prompt) | `Puntas Grishko, Bloch, Capezio...` | ❌ |
| `SHIPPING_PARTNERS` | Empresas de envío (comma-separated) | `Andreani, Correo Argentino` | ❌ |

**Nota:** El sistema inyecta estas variables en el `system_prompt` del agente LangChain.

### 2.2 Integración Tienda Nube

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `TIENDANUBE_STORE_ID` | ID numérico de la tienda en TN | `123456` | ✅ |
| `TIENDANUBE_ACCESS_TOKEN` | Token de API de Tienda Nube | `t_1234567890...` | ✅ |
| `TIENDANUBE_API_KEY` | (Legacy) Clave API de Tienda Nube | (deprecated) | ❌ |

### 2.3 Handoff / Derivación a Humanos

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `HANDOFF_EMAIL` | Mail que recibe alertas de derivación | `soporte@tienda.com` | ✅ (si handoff activo) |
| `SMTP_HOST` | Host del servidor SMTP | `smtp.gmail.com` | ✅ (si handoff activo) |
| `SMTP_PORT` | Puerto del servidor SMTP | `465` | ✅ (si handoff activo) |
| `SMTP_USER` / `SMTP_USERNAME` | Usuario SMTP | `noreply@tienda.com` | ✅ (si handoff activo) |
| `SMTP_PASS` / `SMTP_PASSWORD` | Contraseña SMTP | (password de app) | ✅ (si handoff activo) |
| `SMTP_SECURITY` | Tipo de seguridad SMTP | `SSL` o `STARTTLS` | ✅ (si handoff activo) |

**Flujo Handoff:**
```
Usuario solicita derivación
  ↓
derivhumano() crea registro en tenant_human_handoff_config
  ↓
Se envía mail a HANDOFF_EMAIL con contexto
  ↓
Se activa human_override_until = NOW + 24 horas
  ↓
Bot entra en silencio por 24 horas
```

### 2.4 Configuración Adicional

| Variable | Descripción | Ejemplo | Defecto |
| :--- | :--- | :--- | :--- |
| `ADMIN_TOKEN` | Token para proteger endpoints /admin | `admin-secret-token` | (sin valor) |
| `CORS_ALLOWED_ORIGINS` | Origins CORS permitidos (comma-separated) | `http://localhost:3000,https://domain.com` | `*` |
| `MCP_URL` | URL del servidor n8n MCP Bridge | `https://n8n.host.com/mcp/xxxxx` | (sin valor) |
| `GLOBAL_SYSTEM_PROMPT` | System prompt por defecto si no en DB | (multi-line) | (inyectado en migrations) |

## 3. WhatsApp Service (8002)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `YCLOUD_API_KEY` | API Key de YCloud | `api_key_xxxxx` | ✅ |
| `YCLOUD_WEBHOOK_SECRET` | Secreto para validar webhooks de YCloud | `webhook_secret_xxxxx` | ✅ |
| `ORCHESTRATOR_SERVICE_URL` | URL del Orchestrator (interna) | `http://orchestrator_service:8000` | ✅ |
| `INTERNAL_API_TOKEN` | Token para comunicarse con Orchestrator | (mismo que global) | ✅ |

## 4. Platform UI (80)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `ORCHESTRATOR_URL` | URL del Orchestrator (para admin panel) | (auto-detecta) | ❌ |
| `ADMIN_TOKEN` | Token de administrador | (mismo que Orchestrator) | ✅ (si se usa UI) |

**Auto-detección de URL:**
```javascript
// Si window.API_BASE no definido:
// - localhost → http://localhost:8000
// - platform-ui.domain.com → orchestrator-service.domain.com
// - ui.domain.com → api.domain.com
```

## 5. Tienda Nube Service (8001) - Legacy

| Variable | Descripción |
| :--- | :--- |
| `TIENDANUBE_API_KEY` | (Deprecated - usar TIENDANUBE_ACCESS_TOKEN) |
| `TIENDANUBE_USER_AGENT` | User agent para requests | `Langchain-Agent` |

## 6. Multi-Tenancy: Sincronización de Env Vars

El sistema sincroniza automáticamente las variables de entorno con la base de datos en startup:

**Función:** `sync_environment()` en `admin_routes.py`

```python
# Busca en .env:
STORE_NAME = os.getenv("STORE_NAME")
BOT_PHONE_NUMBER = os.getenv("BOT_PHONE_NUMBER")
TIENDANUBE_STORE_ID = os.getenv("TIENDANUBE_STORE_ID")
# ... etc

# Si encontrados, crea/actualiza un "default tenant" en la tabla 'tenants'
# Si ya existe, lo sobreescribe con valores de .env

# Luego, cada servicio puede consultar credenciales dinámicamente:
# GET /admin/internal/credentials/TIENDANUBE_STORE_ID
```

## 7. Ejemplo de .env (Desarrollo Local)

```bash
# --- Globales ---
INTERNAL_API_TOKEN=super-secret-dev-token
OPENAI_API_KEY=sk-proj-xxxxx
REDIS_URL=redis://redis:6379
POSTGRES_DSN=postgres://postgres:password@localhost:5432/nexus_db

# --- Orchestrator ---
STORE_NAME=Pointe Coach
BOT_PHONE_NUMBER=+5493756123456
STORE_LOCATION=Paraná, Argentina
STORE_WEBSITE=https://www.pointecoach.shop
STORE_DESCRIPTION=Artículos de danza profesional
STORE_CATALOG_KNOWLEDGE=Puntas Grishko, Bloch, Capezio, leotardos, mallas
SHIPPING_PARTNERS=Andreani,Correo Argentino

TIENDANUBE_STORE_ID=123456
TIENDANUBE_ACCESS_TOKEN=t_xxxxx

HANDOFF_EMAIL=soporte@pointecoach.shop
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=noreply@pointecoach.shop
SMTP_PASS=app-password-here
SMTP_SECURITY=SSL

ADMIN_TOKEN=admin-dev-token
CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:3000

# --- WhatsApp ---
YCLOUD_API_KEY=yc_api_xxxxx
YCLOUD_WEBHOOK_SECRET=yc_webhook_xxxxx
ORCHESTRATOR_SERVICE_URL=http://orchestrator_service:8000
```

## 8. Validación de Variables Críticas

El Orchestrator valida en startup:

```python
if not POSTGRES_DSN:
    raise ValueError("POSTGRES_DSN is not set")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY not found")
if not YCLOUD_API_KEY:
    logger.warning("YCLOUD_API_KEY not set")  # warning, no error
```

Si faltan variables críticas → el servicio no arranca.

## 9. Tips de Configuración

### Desarrollo Local (docker-compose)
```bash
cp .env.example .env
# Editar .env con valores locales
docker-compose up --build
```

### Producción (EasyPanel)
```
1. Crear servicio en EasyPanel
2. Variables de entorno → panel de EasyPanel
3. Conectar a repositorio GitHub
4. Deploy automático
```

### Seguridad
- **Nunca** subas el archivo `.env` a Git
- Usa siempre `.env.example` como plantilla
- En EasyPanel, las variables se guardan encriptadas
- Contraseñas SMTP: usa "contraseñas de aplicación" (ej: Gmail)

### Deduplicación (Si el bot responde doble)
Verifica que:
- `REDIS_URL` esté correctamente configurada
- Redis está accesible desde WhatsApp Service
- TTL de `dedup:whatsapp:{message_id}` es >= 2 minutos

### Performance (Si las respuestas son lentas)
- Verifica `OPENAI_API_KEY` válida
- Reduce `STORE_CATALOG_KNOWLEDGE` si es muy largo (> 2000 chars)
- Aumenta timeout de ORCHESTRATOR_SERVICE_URL si es necesario

---

*Guía de Variables © 2025*
