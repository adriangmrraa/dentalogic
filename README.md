# 🩰 Nexus v3 - Sistema Multi-Tenant de IA para Tiendas Nube

Sistema de atención al cliente automatizado para **Tienda Nube** vía **WhatsApp**, impulsado por IA (**LangChain + OpenAI GPT-4o-mini**). El agente es multi-tenant, entiende consultas complejas, busca en el catálogo en tiempo real y gestiona derivaciones a humanos con timeout de 24 horas.

## 🚀 Guía Rápida de Inicio

### 1. Configuración Inicial
```bash
# Clonar y preparar entorno
cp .env.example .env

# Completar las variables (Ver docs/02_environment_variables.md):
# - OPENAI_API_KEY
# - YCLOUD_API_KEY / YCLOUD_WEBHOOK_SECRET  
# - POSTGRES_DSN / REDIS_URL
# - TIENDANUBE_STORE_ID / TIENDANUBE_ACCESS_TOKEN
# - STORE_NAME, BOT_PHONE_NUMBER, etc.
```

### 2. Levantar la Infraestructura
```bash
docker-compose up --build
```

### 3. Acceder a los Servicios
| Servicio | URL | Función |
| :--- | :--- | :--- |
| **Orchestrator** | `http://localhost:8000` | API central (LangChain + Tools) |
| **WhatsApp Service** | `http://localhost:8002` | Webhooks de YCloud |
| **Platform UI** | `http://localhost/` | Admin Dashboard (Vanilla JS) |
| **Métricas** | `http://localhost:8000/metrics` | Prometheus (Guardrails) |

---

## 📚 Documentación Completa

### ⚙️ [01. Arquitectura de Microservicios](docs/01_architecture.md)
- Estructura de servicios (Orchestrator, WhatsApp Service, Platform UI)
- Flujo de mensajes end-to-end
- Diagramas de integración
- **Cambios Nexus v3:** Herramientas de Tienda Nube embebidas en Orchestrator

### 🔑 [02. Variables de Entorno](docs/02_environment_variables.md)
- **Globales:** OPENAI_API_KEY, POSTGRES_DSN, REDIS_URL, INTERNAL_API_TOKEN
- **Orchestrator:** Branding (STORE_NAME, STORE_LOCATION, etc.), Tienda Nube, SMTP
- **WhatsApp:** YCloud API keys, Webhook secrets
- **Multi-Tenant:** Sincronización automática de credenciales con DB

### ☁️ [03. Despliegue (EasyPanel / Docker)](docs/03_deployment_guide.md)
- Configuración de servicios en EasyPanel
- Mapeo de puertos y networking
- Healthchecks y readiness probes
- Migraciones automáticas de BD
- Troubleshooting común

### 🧠 [04. Identidad y Lógica del Agente](docs/04_agent_logic_and_persona.md)
- Persona "Argentina Buena Onda" (tono, dialectos, muletillas)
- Reglas de oro (Gate de catálogo, Envíos, Handoff humano, CTAs)
- Herramientas disponibles (search, orders, derivhumano)
- Mecanismo de silencio de 24 horas
- Cómo modificar el system prompt

### 🛠️ [05. Guía para Desarrolladores](docs/05_developer_notes.md)
- Agregar nuevas Tools
- Gestión de memoria (Redis + Postgres)
- Deduplicación de mensajes
- Debugging (logs, verificación local)
- Bridge MCP (n8n)
- Tips de performance

### 📝 [06. Template del System Prompt](docs/06_ai_prompt_template.md)
- Formato de respuesta JSON
- Secuencia de burbujas para productos (8 pasos)
- Gate de catálogo
- Reglas de envíos y CTAs
- Cómo los variables se inyectan en el prompt

---

## 🏗️ Tecnologías Core

| Componente | Tecnología | Versión |
| :--- | :--- | :--- |
| **Backend** | FastAPI + Python | 3.11+ |
| **IA/LLM** | LangChain + OpenAI | GPT-4o-mini / Whisper |
| **BD Persistente** | PostgreSQL | 13+ |
| **Caché/Locks** | Redis | Alpine |
| **Frontend Admin** | Vanilla JS / React | (opcional) |
| **Infraestructura** | Docker + Docker Compose | (EasyPanel compatible) |
| **Mensajería** | WhatsApp (YCloud API) | v1 |
| **Integración Externa** | n8n MCP Bridge | (para herramientas complejas) |
| **Real-time** | Socket.IO | python-socketio / socket.io-client |

---

## 🎯 Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                  USUARIO (WhatsApp)                     │
└────────────────────┬────────────────────────────────────┘
                     │ Audio/Texto
                     ▼
        ┌───────────────────────────────┐
        │   WhatsApp Service (8002)     │
        │  - YCloud Webhook Receiver    │
        │  - Transcripción (Whisper)    │
        │  - Deduplicación (Redis)      │
        └────────────┬──────────────────┘
                     │ POST /chat
                     ▼
        ┌───────────────────────────────┐
        │  Orchestrator Service (8000)  │
        │  - LangChain Agent            │
        │  - Tools Embebidas (TN API)   │
        │  - Memoria (20 msg ventana)   │
        │  - Lockout (24h override)     │
        └────────────┬──────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      PostgreSQL  Redis      OpenAI
      (Historial) (Locks)    (LLM)
          
        ┌───────────────────────────────┐
        │   Platform UI (80)            │
        │   Admin Dashboard             │
        └───────────────────────────────┘
```

---

## 🔄 Flujo de un Mensaje (End-to-End)

1. **Recepción** → Usuario envía audio/texto a WhatsApp
2. **Pre-procesamiento** → WhatsApp Service transcribe audio (Whisper), agrupa mensajes (2s buffer)
3. **Orquestación** → Envía a `POST /chat` del Orchestrator
4. **Contexto** → Carga últimos 20 mensajes de DB + system prompt personalizado
5. **Razonamiento** → LangChain Agente ejecuta (piensa qué tool usar)
6. **Tool Execution** → Si pregunta por producto: `search_specific_products()` → API Tienda Nube
7. **Respuesta** → IA genera JSON con múltiples burbujas
8. **Entrega** → WhatsApp Service envía burbujas al usuario
9. **Almacenamiento** → Mensaje guardado en DB con metadata

---

## ⚡ Características Clave (Nexus v3)

✅ **Multi-Tenant:** Un despliegue, múltiples tiendas  
✅ **Lockout de 24h:** Cuando un humano interviene, el bot se silencia automáticamente por 24 horas  
✅ **Herramientas Embebidas:** Búsqueda de productos sin latencia extra (estaba en microservicio aparte)  
✅ **Memoria Inteligente:** Ventana deslizante de 20 mensajes (Redis + Postgres)  
✅ **Transcripción de Audio:** OpenAI Whisper integrada  
✅ **Persona Consistente:** "Argentina Buena Onda" inyectada en el prompt  
✅ **Observabilidad:** Logs estructurados (structlog) + Prometheus metrics  
✅ **Bridge MCP:** Extensión fácil vía n8n para herramientas complejas  
✅ **Sincronización en Tiempo Real:** Socket.IO para actualizaciones instantáneas de agenda  
✅ **Calendario Dinámico:** FullCalendar con colores por estado de turno  
✅ **Eventos WebSocket:** NEW_APPOINTMENT, APPOINTMENT_UPDATED, APPOINTMENT_DELETED  

---

## 🚨 Cambios Críticos vs v2

| Aspecto | v2 | v3 |
| :--- | :--- | :--- |
| **Herramientas TN** | Microservicio externo | Embebidas en Orchestrator |
| **Lockout** | Infinito | 24 horas (`human_override_until`) |
| **Audio** | No soportado | ✅ Whisper integrado |
| **Multi-Tenant** | Limitado | ✅ Full multi-tenant |
| **Memoria** | 10 mensajes | 20 mensajes (configurable) |

---

## 📞 Soporte

Para reportar bugs o proponer features:
- Revisa [AGENTS.md](AGENTS.md) para la "Guía Suprema" de mantenimiento
- Ve a [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md) para análisis técnico reciente
- Consulta los docs de [Workflow](WORKFLOW_GUIDE.md) para ciclo de desarrollo

---

*Sistema Nexus v3 © 2025. Optimizado para Tienda Nube + WhatsApp.*
