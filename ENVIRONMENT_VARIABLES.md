# Variables de Entorno - Dentalogic (Deploy Guide)

> **URGENTE**: Configurar TODAS estas variables en EasyPanel antes de deployear.

---

## FRONTEND (Build Args)

| Variable | Requerida | Valor actual / Ejemplo | Descripcion |
|----------|-----------|----------------------|-------------|
| `VITE_API_URL` | **SI** | `https://dentalogic-orchestrator.ugwrjq.easypanel.host` | URL del orchestrator backend |
| `VITE_BFF_URL` | No | `https://dentalogic-bff-service.ugwrjq.easypanel.host` | URL del BFF (si existe) |
| `VITE_WS_URL` | **SI** | `wss://dentalogic-orchestrator.ugwrjq.easypanel.host` | WebSocket para notificaciones real-time |
| `VITE_ADMIN_TOKEN` | **SI** | `admin-secret-token` | Debe coincidir con `ADMIN_TOKEN` del orchestrator |
| `VITE_APP_NAME` | No | `Dentalogic` | Nombre mostrado en UI |
| `VITE_DEFAULT_TENANT_ID` | No | `1` | Tenant por defecto |
| `VITE_FACEBOOK_APP_ID` | Solo si usas Meta | *(tu Facebook App ID)* | Para Meta Login/Ads |
| `VITE_META_CONFIG_ID` | Solo si usas Meta | *(tu Meta Config ID)* | Para Meta Embedded Signup |
| `NODE_ENV` | **SI** | `production` | Modo produccion |

---

## ORCHESTRATOR (Backend - Environment Variables)

### Infraestructura (OBLIGATORIAS)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `POSTGRES_DSN` | `postgresql+asyncpg://postgres:PASS@dentalogic_postgres:5432/postgres?sslmode=disable` | Conexion a PostgreSQL |
| `REDIS_URL` | `redis://default:PASS@dentalogic_redis:6379` | Conexion a Redis (cache, sessions) |
| `ADMIN_TOKEN` | `admin-secret-token` | **DEBE coincidir con VITE_ADMIN_TOKEN** |
| `INTERNAL_SECRET_KEY` | `una-clave-secreta-larga-y-segura-min-32-chars` | Firma JWT. **Si no la pones, usa fallback hardcodeado. NUNCA cambiarla despues de que haya tokens activos.** |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warning`, `error` |
| `CORS_ORIGINS` | `https://dentalogic-frontend.ugwrjq.easypanel.host` | Dominios permitidos para CORS |
| `PLATFORM_URL` | `https://dentalogic-frontend.ugwrjq.easypanel.host` | URL del frontend (para links en emails) |

### IA y Agente (OBLIGATORIAS para funcionalidad IA)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `OPENAI_API_KEY` | `sk-proj-...` | API key de OpenAI para el agente conversacional |
| `OPENAI_MODEL` | `gpt-4o` | Modelo a usar (gpt-4o, gpt-4o-mini, etc.) |

### WhatsApp - YCloud (para chat)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `YCLOUD_API_KEY` | *(tu API key)* | Key de YCloud para enviar/recibir WhatsApp |
| `YCLOUD_WEBHOOK_SECRET` | *(secret)* | Para validar webhooks entrantes |

### Google Calendar (para sync de agenda)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `GOOGLE_CALENDAR_CREDENTIALS` | `{"type":"service_account",...}` | JSON de service account de Google |

### Meta Ads (para marketing hub)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `FACEBOOK_APP_ID` | *(id)* | Meta App ID |
| `FACEBOOK_APP_SECRET` | *(secret)* | Meta App Secret |

### Google Ads (para marketing hub)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `GOOGLE_CLIENT_ID` | *(id)* | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(secret)* | Google OAuth Client Secret |
| `GOOGLE_DEVELOPER_TOKEN` | *(token)* | Google Ads API Developer Token |
| `GOOGLE_REDIRECT_URI` | `https://dentalogic-orchestrator.ugwrjq.easypanel.host/admin/auth/google/ads/callback` | Redirect URI para OAuth |

### Email / SMTP (para notificaciones)

| Variable | Valor / Ejemplo | Descripcion |
|----------|----------------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` | Servidor SMTP |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `SMTP_USER` | `tu@email.com` | Usuario SMTP |
| `SMTP_PASSWORD` | *(password)* | Contrasena SMTP |

---

## DIAGNOSTICO DEL ERROR ACTUAL

**Error:** `Signature has expired`

**Causa:** El JWT del usuario expiro. La configuracion actual permite 7 dias (`ACCESS_TOKEN_EXPIRE_MINUTES = 10080`).

**Archivo:** `orchestrator_service/auth_service.py:12-14`

```python
SECRET_KEY = os.getenv("INTERNAL_SECRET_KEY", "nexus-super-secret-key-v7.6")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 dias
```

**Soluciones:**
1. El usuario simplemente debe **volver a hacer login** - el frontend redirige a `/login` automaticamente cuando recibe 401
2. Si queres mas tiempo, cambiar `ACCESS_TOKEN_EXPIRE_MINUTES` a `60 * 24 * 30` (30 dias)
3. **IMPORTANTE:** Verificar que `INTERNAL_SECRET_KEY` en EasyPanel NO haya cambiado entre deploys. Si cambia, TODOS los tokens activos se invalidan.

---

## CHECKLIST PRE-DEPLOY

- [ ] `POSTGRES_DSN` configurado y PostgreSQL corriendo
- [ ] `REDIS_URL` configurado y Redis corriendo
- [ ] `ADMIN_TOKEN` = `VITE_ADMIN_TOKEN` (deben coincidir)
- [ ] `INTERNAL_SECRET_KEY` configurado y **nunca cambiarlo**
- [ ] `OPENAI_API_KEY` configurado (para IA)
- [ ] `CORS_ORIGINS` incluye la URL del frontend
- [ ] `VITE_API_URL` apunta al orchestrator correcto
- [ ] `VITE_WS_URL` apunta al WebSocket correcto
- [ ] Frontend build pasa sin errores
- [ ] Usuario puede hacer login exitosamente
