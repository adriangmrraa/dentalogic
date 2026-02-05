# 🧠 Dentalogic Brain: Knowledge & Skills Map

Este archivo actúa como el índice maestro de capacidades para los Agentes Autónomos. Define qué Skill utilizar para cada tipo de tarea.

## 🌟 Core Skills (Infraestructura)
| Skill | Trigger Keywords | Uso Principal |
|-------|------------------|---------------|
| **[Backend_Sovereign](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Backend_Sovereign/SKILL.md)** | `backend`, `fastapi`, `db`, `auth` | Arquitectura, endpoints, seguridad y base de datos. |
| **[Frontend_Nexus](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Frontend_Nexus/SKILL.md)** | `frontend`, `react`, `ui`, `hooks` | Componentes React, llamadas API, estado y estilos. |
| **[DB_Evolution](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/DB_Evolution/SKILL.md)** | `schema`, `migration`, `sql`, `rag` | Cambios en DB, gestión de vectores y migraciones. |

## 💬 Communication & Integrations
| Skill | Trigger Keywords | Uso Principal |
|-------|------------------|---------------|
| **[Omnichannel_Chat_Operator](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Omnichannel_Chat_Operator/SKILL.md)** | `chats`, `whatsapp`, `meta`, `msg` | Lógica de mensajería, polling y human handoff. |
| **[Meta_Integration_Diplomat](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Meta_Integration_Diplomat/SKILL.md)** | `oauth`, `facebook`, `instagram` | Vinculación de cuentas Meta y gestión de tokens. |
| **[TiendaNube_Commerce_Bridge](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/TiendaNube_Commerce_Bridge/SKILL.md)** | `tiendanube`, `products`, `orders` | Sincronización de catálogo y OAuth de e-commerce. |

## 🤖 AI & Onboarding
| Skill | Trigger Keywords | Uso Principal |
|-------|------------------|---------------|
| **[Agent_Configuration_Architect](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Agent_Configuration_Architect/SKILL.md)** | `agents`, `prompts`, `tools` | Creación y configuración de agentes IA. |
| **[Magic_Onboarding_Orchestrator](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Magic_Onboarding_Orchestrator/SKILL.md)** | `magic`, `wizard`, `onboarding` | Proceso de "Hacer Magia" y generación de assets. |
| **[Business_Forge_Engineer](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Business_Forge_Engineer/SKILL.md)** | `forge`, `canvas`, `visuals` | Gestión de assets generados y Fusion Engine. |
| **[Skill_Forge_Master](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Skill_Forge_Master/SKILL.md)** | `crear skill`, `skill architect` | Generador y arquitecto de nuevas capacidades. |


## 🔒 Security
| Skill | Trigger Keywords | Uso Principal |
|-------|------------------|---------------|
| **[Credential_Vault_Specialist](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Credential_Vault_Specialist/SKILL.md)** | `credentials`, `vault`, `keys` | Gestión segura de secretos y encriptación. |

---

# 🏗 Sovereign Architecture Context

## 1. Project Identity
**Dentalogic** es un sistema SaaS de Orquestación de IA para Clínicas Odontológicas (Citas, Triaje y Gestión de Pacientes).

Cada clínica posee sus propias credenciales de IA encriptadas en la base de datos y su propia integración con Google Calendar.

**Regla de Oro:** NUNCA usar `os.getenv("OPENAI_API_KEY")` para lógica de agentes en producción. Siempre usar la credencial correspondiente de la base de datos.

## 2. Tech Stack & Standards

### Backend
- **Python 3.10+**: Lenguaje principal
- **FastAPI**: Framework web asíncrono
- **PostgreSQL 14**: Base de datos relacional
- **SQLAlchemy 2.0 / asyncpg**: Acceso asíncrono a datos
- **Google Calendar API**: Sincronización de turnos
- **Redis**: Cache y buffers de mensajes

### Frontend
- **React 18**: Framework UI
- **TypeScript**: Tipado estricto obligatorio
- **Tailwind CSS**: Sistema de estilos
- **Lucide Icons**: Iconografía

### Infrastructure
- **Docker Compose**: Orquestación local
- **EasyPanel**: Deployment cloud
- **WhatsApp Business API (via YCloud)**: Canal de comunicación oficial

## 3. Architecture Map

### Core Services

#### `/orchestrator_service` - API Principal
- **Responsabilidad**: Gestión de turnos, triaje IA, integración con Google Calendar.
- **Archivos Críticos**:
  - `main.py`: FastAPI app y herramientas de la IA (Dental Tools).
  - `admin_routes.py`: Gestión de pacientes, profesionales y configuración de despliegue.
  - `gcal_service.py`: Integración real con Google Calendar (Service Account).
  - `db.py`: Conector de base de datos asíncrono.

#### `/whatsapp_service` - Canal WhatsApp
- **Responsabilidad**: Recepción de webhooks de YCloud, validación de firmas y forwarding al orquestador.
- **Características**: Buffer/Debounce de mensajes en Redis.

#### `/frontend_react` - Dashboard SPA
- **Responsabilidad**: Interfaz para administración de la clínica (Agenda, Pacientes, Credenciales).
- **Vistas Críticas**:
  - `AgendaView.tsx`: Calendario dinámico con soporte de bloques de Google.
  - `DashboardView.tsx`: Estadísticas en tiempo real y alertas de triaje crítico.

## 4. Workflows Disponibles

| Workflow | Descripción |
|----------|-------------|
| **[bug_fix](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/workflows/bug_fix.md)** | Proceso para solucionar errores con aislamiento dental. |
| **[implement](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/workflows/implement.md)** | Ejecución autónoma del plan de implementación. |
| **[verify](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/workflows/verify.md)** | Ciclo de auto-verificación y corrección. |
| **[plan](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/workflows/plan.md)** | Transforma especificaciones en un plan técnico. |
| **[specify](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/workflows/specify.md)** | Genera especificaciones técnicas .spec.md. |

## 5. Skills Index

| Skill Name | Trigger | Descripción |
| :--- | :--- | :--- |
| **[Sovereign Backend Engineer](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Backend_Sovereign/SKILL.md)** | *backend, endpoints, appointments, database* | Experto en FastAPI, Citas y Google Calendar. |
| **[Nexus UI Developer](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Frontend_Nexus/SKILL.md)** | *frontend, react, agenda, ui* | Especialista en Agenda Médica y componentes React. |
| **[AI Behavior Architect](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/Prompt_Architect/SKILL.md)** | *prompts, triage, Mercedes, gala* | Ingeniería de prompts para triaje dental y tono argentino Mercedes. |
| **[DB Schema Surgeon](file:///c:/Users/Asus/Downloads/Clinica%20Dental/.agent/skills/DB_Evolution/SKILL.md)** | *sql, migrations, schema* | Gestión del esquema PostgreSQL y citas. |
