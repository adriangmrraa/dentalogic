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

### 2.1 Seguridad y JWT

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `INTERNAL_SECRET_KEY` | Clave secreta para firma de JWT (min 32 chars). **CRITICAL: NUNCA cambiar después del deploy -- invalida TODOS los tokens activos.** Si no se define, usa un fallback hardcodeado inseguro. | `una-clave-secreta-larga-y-segura-min-32-chars` | ✅ |

### 2.2 Bridge API (CRM VENTAS Sync)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `BRIDGE_API_TOKEN` | Token compartido M2M para sincronización bidireccional con CRM VENTAS. Soporta múltiples tokens separados por coma para rotación segura. | `tk_abc123,tk_def456` | ✅ (si se usa Bridge) |
| `CRM_VENTAS_BRIDGE_URL` | URL base de CRM VENTAS para push de leads salientes vía `POST {url}/bridge/v1/incoming-lead`. | `https://crm-ventas.example.com` | ✅ (si se usa Bridge) |

**Rotación de tokens Bridge:** `BRIDGE_API_TOKEN` acepta valores separados por coma. Flujo: agregar nuevo token -> desplegar ambas apps -> remover token antiguo. Ambos tokens son válidos simultáneamente durante la ventana de rotación.

### 2.3 Identidad y Branding (Whitelabel)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `STORE_NAME` | Nombre de la clínica (legacy/fallback) | `Dentalogic` | ❌ |
| `BOT_PHONE_NUMBER` | Número de WhatsApp del bot (fallback cuando no viene `to_number` en la petición) | `+5493756123456` | ❌ |
| `CLINIC_NAME` | Nombre de clínica usado como fallback si la sede no tiene `clinic_name` en BD | `Clínica Dental` | ❌ |
| `CLINIC_LOCATION` | Ubicación (usado en respuestas de configuración; opcional) | `República de Francia 2899, Mercedes, Buenos Aires` | ❌ |
| `STORE_LOCATION` | Ciudad/País | `Paraná, Entre Ríos, Argentina` | ❌ |
| `STORE_WEBSITE` | URL de la clínica | `https://www.odontolea.com` | ❌ |
| `STORE_DESCRIPTION` | Especialidad clínica | `Salud Bucal e Implantología` | ❌ |
| `STORE_CATALOG_KNOWLEDGE` | Categorías/marcas principales (para inyectar en prompt) | `Puntas Grishko, Bloch, Capezio...` | ❌ |
| `SHIPPING_PARTNERS` | Empresas de envío (comma-separated) | `Andreani, Correo Argentino` | ❌ |

**Multi-tenant (Dentalogic):** En este proyecto, el **número del bot** y el **nombre de la clínica** por sede son la fuente de verdad en la base de datos: `tenants.bot_phone_number` y `tenants.clinic_name`. Se configuran en **Sedes (Clinics)** en el panel. Las variables `BOT_PHONE_NUMBER` y `CLINIC_NAME` (y `CLINIC_LOCATION`) se usan solo como **respaldo** cuando no hay valor en BD o cuando la petición no trae `to_number` (ej. pruebas manuales). No es obligatorio definirlas si todas las sedes tienen ya sus datos cargados en la plataforma. `CLINIC_PHONE` no se utiliza en el orquestador y puede omitirse.
   
### 2.4 Integración Tienda Nube

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `TIENDANUBE_STORE_ID` | ID numérico de la tienda en TN | `123456` | ✅ |
| `TIENDANUBE_ACCESS_TOKEN` | Token de API de Tienda Nube | `t_1234567890...` | ✅ |

### 2.5 Handoff / Derivación a Humanos

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `HANDOFF_EMAIL` | Mail que recibe alertas de derivación | `soporte@tienda.com` | ✅ (si handoff activo) |
| `SMTP_HOST` | Host del servidor SMTP | `smtp.gmail.com` | ✅ (si handoff activo) |
| `SMTP_PORT` | Puerto del servidor SMTP | `465` | ✅ (si handoff activo) |
| `SMTP_USER` / `SMTP_USERNAME` | Usuario SMTP | `noreply@tienda.com` | ✅ (si handoff activo) |
| `SMTP_PASS` / `SMTP_PASSWORD` | Contraseña SMTP | (password de app) | ✅ (si handoff activo) |
| `SMTP_SECURITY` | Tipo de seguridad SMTP | `SSL` o `STARTTLS` | ✅ (si handoff activo) |

### 2.6 Seguridad y RBAC (Nexus v7.6)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `ADMIN_TOKEN` | Token maestro de protección | `admin-secret-token` | ✅ |
| `JWT_SECRET_KEY` | Clave secreta para firmar tokens JWT | `mue-la-se-cre-t-a` | ✅ |
| `JWT_ALGORITHM` | Algoritmo de firma para JWT | `HS256` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Duración del token de sesión | `43200` (30 días) | `30` |
| `PLATFORM_URL` | URL del frontend (para links de activación) | `https://ui.clinic.com` | `http://localhost:3000` |
| `CORS_ALLOWED_ORIGINS` | Origins CORS permitidos (comma-separated) | `http://localhost:3000,https://domain.com` | `*` |
| `CREDENTIALS_FERNET_KEY` | Clave Fernet (base64) para cifrar tokens en `credentials` (ej. Auth0 en connect-sovereign) | Salida de `Fernet.generate_key().decode()` | ✅ (si se usa connect-sovereign) |
| `GOOGLE_CREDENTIALS` | JSON completo de credenciales de Google (Service Account o OAuth) para integración con Google Calendar | Contenido del archivo JSON descargado de Google Cloud Console | ❌ (solo si la clínica usa `calendar_provider: google` y se consulta disponibilidad vía GCal) |

**Generar clave Fernet:** En la raíz del proyecto, con Python en el PATH: `py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` (Windows). En Linux/macOS: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Guardar la salida en `CREDENTIALS_FERNET_KEY`.

## 3. WhatsApp Service (8002)

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `YCLOUD_API_KEY` | API Key de YCloud | `api_key_xxxxx` | ✅ |
| `YCLOUD_WEBHOOK_SECRET` | Secreto para validar webhooks de YCloud | `webhook_secret_xxxxx` | ✅ |
| `ORCHESTRATOR_SERVICE_URL` | URL del Orchestrator (interna) | `http://orchestrator_service:8000` | ✅ |
| `INTERNAL_API_TOKEN` | Token para comunicarse con Orchestrator | (mismo que global) | ✅ |

## 4. Platform UI (80)

Estas variables son **build args** -- se inyectan en build-time via Vite y quedan embebidas en el bundle estático. Un cambio requiere re-build del frontend.

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `ORCHESTRATOR_URL` | URL del Orchestrator (para admin panel) | (auto-detecta) | ❌ |
| `VITE_ADMIN_TOKEN` | Token de administrador (inyectado en build). **Debe coincidir con `ADMIN_TOKEN` del Orchestrator.** | `admin-secret-token` | ✅ |
| `VITE_API_URL` | URL base del orquestador backend | `https://dentalogic-orchestrator.ugwrjq.easypanel.host` | ✅ |
| `VITE_API_BASE_URL` | URL base para la API del orquestador (alias legacy) | (auto-detecta) | ❌ |
| `VITE_WS_URL` | WebSocket URL para notificaciones real-time (Socket.io) | `wss://dentalogic-orchestrator.ugwrjq.easypanel.host` | ✅ |
| `VITE_BFF_URL` | URL del BFF service (si existe) | `https://dentalogic-bff-service.ugwrjq.easypanel.host` | ❌ |
| `VITE_APP_NAME` | Nombre mostrado en la UI | `Dentalogic` | ❌ |
| `VITE_DEFAULT_TENANT_ID` | Tenant por defecto | `1` | ❌ |
| `VITE_DEMO_WHATSAPP` | Número de WhatsApp para el botón CTA de la landing de demo. Sin `+`, solo dígitos. | `5493435256815` | ❌ (fallback hardcoded) |
| `VITE_FACEBOOK_APP_ID` | Facebook App ID para Meta Login / Meta Ads integration | *(tu Facebook App ID)* | Solo si se usa Meta |
| `VITE_META_CONFIG_ID` | Meta Config ID para Embedded Signup (WhatsApp Business API via Meta) | *(tu Meta Config ID)* | Solo si se usa Meta |
| `NODE_ENV` | Modo de ejecución | `production` | ✅ |

## 5. Orchestrator - IA y Agente

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `OPENAI_API_KEY` | API key de OpenAI para agente conversacional | `sk-proj-...` | ✅ |
| `OPENAI_MODEL` | Modelo a usar | `gpt-4o` | ❌ (default: `gpt-4o-mini`) |

## 6. Orchestrator - Google Calendar

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `GOOGLE_CALENDAR_CREDENTIALS` | JSON completo de Service Account de Google para sync de agenda | `{"type":"service_account",...}` | ❌ (solo si la clínica usa Google Calendar) |

## 7. Orchestrator - Meta Ads

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `FACEBOOK_APP_ID` | Meta App ID (backend) | *(id)* | Solo si se usa Meta Ads |
| `FACEBOOK_APP_SECRET` | Meta App Secret | *(secret)* | Solo si se usa Meta Ads |

## 8. Orchestrator - Google Ads

| Variable | Descripción | Ejemplo | Requerida |
| :--- | :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | *(id)* | Solo si se usa Google Ads |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | *(secret)* | Solo si se usa Google Ads |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API Developer Token | *(token)* | Solo si se usa Google Ads |
| `GOOGLE_REDIRECT_URI` | Redirect URI para OAuth | `https://dentalogic-orchestrator.ugwrjq.easypanel.host/admin/auth/google/ads/callback` | Solo si se usa Google Ads |

## 9. Ejemplo de .env (Desarrollo Local)

```bash
# --- Globales ---
INTERNAL_API_TOKEN=super-secret-dev-token
OPENAI_API_KEY=sk-proj-xxxxx
REDIS_URL=redis://redis:6379
POSTGRES_DSN=postgres://postgres:password@localhost:5432/nexus_db

# --- Auth & Platform ---
INTERNAL_SECRET_KEY=mi-llave-secreta-de-jwt-min-32-chars-nunca-cambiar
JWT_SECRET_KEY=mi-llave-maestra-dental
PLATFORM_URL=https://dentalogic-frontend.ugwrjq.easypanel.host
ACCESS_TOKEN_EXPIRE_MINUTES=43200
ADMIN_TOKEN=admin-dev-token
CORS_ALLOWED_ORIGINS=http://localhost:3000
# Opcional: para POST /admin/calendar/connect-sovereign (token Auth0 cifrado)
# CREDENTIALS_FERNET_KEY=<generar con: py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

# --- Orchestrator ---
STORE_NAME=Dentalogic
BOT_PHONE_NUMBER=+5493756123456
LOG_LEVEL=info

# --- Bridge API (CRM VENTAS sync) ---
# BRIDGE_API_TOKEN=tk_abc123
# CRM_VENTAS_BRIDGE_URL=https://crm-ventas.example.com

# --- WhatsApp ---
YCLOUD_API_KEY=yc_api_xxxxx
YCLOUD_WEBHOOK_SECRET=yc_webhook_xxxxx
ORCHESTRATOR_SERVICE_URL=http://orchestrator_service:8000

# --- Frontend (Build Time) ---
VITE_ADMIN_TOKEN=admin-dev-token
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_APP_NAME=Dentalogic
# VITE_DEMO_WHATSAPP=5493435256815
# VITE_FACEBOOK_APP_ID=
# VITE_META_CONFIG_ID=
NODE_ENV=development
```

## 10. Referencia Completa de Variables (Match con ENVIRONMENT_VARIABLES.md)

La siguiente tabla consolida TODAS las variables del sistema en un solo lugar, alineada con `ENVIRONMENT_VARIABLES.md` en la raíz del repositorio.

### Frontend (Build Args)

| Variable | Requerida | Descripción |
| :--- | :--- | :--- |
| `VITE_API_URL` | ✅ | URL del orchestrator backend |
| `VITE_BFF_URL` | ❌ | URL del BFF (si existe) |
| `VITE_WS_URL` | ✅ | WebSocket para notificaciones real-time |
| `VITE_ADMIN_TOKEN` | ✅ | Debe coincidir con `ADMIN_TOKEN` del orchestrator |
| `VITE_APP_NAME` | ❌ | Nombre mostrado en UI |
| `VITE_DEFAULT_TENANT_ID` | ❌ | Tenant por defecto |
| `VITE_DEMO_WHATSAPP` | ❌ | WhatsApp de demo landing |
| `VITE_FACEBOOK_APP_ID` | Meta only | Facebook App ID |
| `VITE_META_CONFIG_ID` | Meta only | Meta Embedded Signup Config ID |
| `NODE_ENV` | ✅ | `production` |

### Orchestrator (Backend)

| Variable | Requerida | Descripción |
| :--- | :--- | :--- |
| `POSTGRES_DSN` | ✅ | Conexión a PostgreSQL |
| `REDIS_URL` | ✅ | Conexión a Redis |
| `ADMIN_TOKEN` | ✅ | Token maestro (debe coincidir con `VITE_ADMIN_TOKEN`) |
| `INTERNAL_SECRET_KEY` | ✅ | Firma JWT -- **NUNCA cambiar post-deploy** |
| `INTERNAL_API_TOKEN` | ✅ | Token M2M entre microservicios |
| `OPENAI_API_KEY` | ✅ | API key de OpenAI |
| `OPENAI_MODEL` | ❌ | Modelo IA (default: gpt-4o-mini) |
| `LOG_LEVEL` | ❌ | `debug`, `info`, `warning`, `error` |
| `CORS_ORIGINS` / `CORS_ALLOWED_ORIGINS` | ✅ | Dominios CORS permitidos |
| `PLATFORM_URL` | ✅ | URL del frontend (para links en emails) |
| `JWT_SECRET_KEY` | ✅ | Clave secreta JWT (legacy, ver `INTERNAL_SECRET_KEY`) |
| `JWT_ALGORITHM` | ❌ | Default: `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | Default: `10080` (7 días) |
| `BRIDGE_API_TOKEN` | Bridge only | Token M2M para CRM VENTAS |
| `CRM_VENTAS_BRIDGE_URL` | Bridge only | URL base de CRM VENTAS |
| `YCLOUD_API_KEY` | ✅ | Key de YCloud para WhatsApp |
| `YCLOUD_WEBHOOK_SECRET` | ✅ | Validación de webhooks YCloud |
| `SMTP_HOST` | Handoff only | Servidor SMTP |
| `SMTP_PORT` | Handoff only | Puerto SMTP |
| `SMTP_USER` / `SMTP_USERNAME` | Handoff only | Usuario SMTP |
| `SMTP_PASS` / `SMTP_PASSWORD` | Handoff only | Contraseña SMTP |
| `SMTP_SECURITY` | Handoff only | `SSL` o `STARTTLS` |
| `HANDOFF_EMAIL` | Handoff only | Mail de derivación |
| `GOOGLE_CALENDAR_CREDENTIALS` | GCal only | JSON Service Account |
| `CREDENTIALS_FERNET_KEY` | Connect only | Clave Fernet para cifrar tokens |
| `GOOGLE_CREDENTIALS` | GCal only | JSON credenciales Google (legacy) |
| `FACEBOOK_APP_ID` | Meta only | Meta App ID (backend) |
| `FACEBOOK_APP_SECRET` | Meta only | Meta App Secret |
| `GOOGLE_CLIENT_ID` | GAds only | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | GAds only | Google OAuth Client Secret |
| `GOOGLE_DEVELOPER_TOKEN` | GAds only | Google Ads Dev Token |
| `GOOGLE_REDIRECT_URI` | GAds only | Redirect URI OAuth |
| `STORE_NAME` | ❌ | Nombre clínica (fallback) |
| `BOT_PHONE_NUMBER` | ❌ | WhatsApp del bot (fallback) |
| `CLINIC_NAME` | ❌ | Nombre clínica (fallback) |
| `CLINIC_LOCATION` | ❌ | Ubicación (fallback) |
| `STORE_LOCATION` | ❌ | Ciudad/País |
| `STORE_WEBSITE` | ❌ | URL de la clínica |
| `STORE_DESCRIPTION` | ❌ | Especialidad |
| `STORE_CATALOG_KNOWLEDGE` | ❌ | Categorías para prompt |
| `SHIPPING_PARTNERS` | ❌ | Empresas de envío |
| `TIENDANUBE_STORE_ID` | TN only | ID tienda TiendaNube |
| `TIENDANUBE_ACCESS_TOKEN` | TN only | Token API TiendaNube |

### WhatsApp Service

| Variable | Requerida | Descripción |
| :--- | :--- | :--- |
| `YCLOUD_API_KEY` | ✅ | API Key de YCloud |
| `YCLOUD_WEBHOOK_SECRET` | ✅ | Secret para validar webhooks |
| `ORCHESTRATOR_SERVICE_URL` | ✅ | URL interna del Orchestrator |
| `INTERNAL_API_TOKEN` | ✅ | Token M2M (mismo que global) |
| `REDIS_URL` | ✅ | Redis para deduplicación |

---

*Guía de Variables © 2026*
