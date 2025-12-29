# Guía de Variables de Entorno

Este proyecto se configura íntegramente mediante variables de entorno. En el despliegue de **EasyPanel**, cada microservicio debe tener cargadas las variables que le corresponden.

## 1. Variables Globales (Comunes a todos)

| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `INTERNAL_API_TOKEN` | Token de seguridad para comunicación entre servicios. | `compu-global-hyper-mega-net` |
| `OPENAI_API_KEY` | Clave de API de OpenAI (para GPT-4 y Whisper). | `sk-proj-...` |
| `REDIS_URL` | URL de conexión a Redis (Caché/Locks). | `redis://redis:6379` |
| `POSTGRES_DSN` | URL de conexión a PostgreSQL. | `postgres://user:pass@db:5432/db` |

## 2. Orchestrator Service

Configura la identidad del bot y la conexión con Tienda Nube.

### Identidad y Branding (Whitelabel)
- `STORE_NAME`: Nombre de la tienda (ej: "Pointe Coach").
- `STORE_LOCATION`: Ciudad/País (ej: "Paraná, Argentina").
- `STORE_DESCRIPTION`: Qué vende (ej: "artículos de danza").
- `STORE_WEBSITE`: URL de la tienda online (ej: "https://shop.com").
- `SHIPPING_PARTNERS`: Empresas de envío (ej: "Andreani y Correo Argentino").
- `STORE_CATALOG_KNOWLEDGE`: Texto breve para guiar a la IA sobre qué categorías existen.

### Conexión Tienda Nube
- `TIENDANUBE_STORE_ID`: ID numérico de la tienda.
- `TIENDANUBE_ACCESS_TOKEN`: Token de la API de Tienda Nube.

### Handoff (Derivación Humana)
Configuración SMTP para el envío de mails de alerta cuando el bot pide ayuda.
- `HANDOFF_EMAIL`: Mail que recibirá las consultas.
- `SMTP_HOST`: ej: `smtp.gmail.com`.
- `SMTP_PORT`: ej: `465`.
- `SMTP_USER`: Mail desde donde se envían las alertas.
- `SMTP_PASS`: Contraseña de aplicación del mail emisor.
- `SMTP_SECURITY`: `SSL` o `STARTTLS`.

## 3. WhatsApp Service

Gestiona la conexión con YCloud.

- `YCLOUD_API_KEY`: API Key de YCloud.
- `YCLOUD_WEBHOOK_SECRET`: Secreto para validar los webhooks entrantes.
- `ORCHESTRATOR_SERVICE_URL`: URL interna del orquestador (ej: `http://orchestrator:8000`).

## 4. Tips de Configuración

> [!IMPORTANT]
> **Seguridad:** Nunca subas el archivo `.env` al repositorio Git. Usa siempre `.env.example` como plantilla.

> [!TIP]
> **Deduplicación:** Si el bot responde doble, revisa que `REDIS_URL` esté correctamente configurada, ya que la deduplicación depende de los locks en Redis.
