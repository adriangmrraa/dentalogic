# Contexto completo del proyecto para agentes IA

**Propósito:** Este documento permite que otra IA (en otra conversación) tome contexto completo del proyecto Dentalogic: qué es, cómo está construido, cómo trabajar en él y dónde está cada cosa. Úsalo como punto de entrada único antes de tocar código.

**Última actualización:** 2026-02-10

---

## 1. Qué es el proyecto

- **Nombre:** Dentalogic (Nexus v7.6 / Platinum).
- **Tipo:** Plataforma de gestión clínica dental **multi-tenant** (multi-sede), con asistente IA por WhatsApp para turnos, triaje y derivación a humano.
- **Usuarios:** Clínicas (una o varias sedes), CEOs, secretarias, profesionales. Pacientes interactúan por WhatsApp con el agente.
- **Pilares:** Backend (Orchestrator FastAPI + LangChain), Frontend (React + Vite + Tailwind), WhatsApp Service (YCloud + Whisper), PostgreSQL, Redis.

---

## 2. Stack y repositorio

| Capa | Tecnología | Ubicación |
|------|------------|-----------|
| **Backend (orquestador)** | FastAPI, LangChain, OpenAI GPT-4o-mini, asyncpg | `orchestrator_service/` |
| **WhatsApp / audio** | FastAPI, YCloud, Whisper | `whatsapp_service/` |
| **Frontend** | React 18, TypeScript, Vite, Tailwind, FullCalendar, Socket.IO client, Recharts | `frontend_react/` |
| **Base de datos** | PostgreSQL (esquema + parches en arranque) | `orchestrator_service/db.py` + `db/init/` |
| **Caché / locks** | Redis | Env `REDIS_URL` |
| **Infra** | Docker Compose, opcional EasyPanel | `docker-compose.yml` |

**Regla de oro:** Código de negocio y API admin están en `orchestrator_service/`. El frontend solo consume esa API y el chat (POST `/chat`).

---

## 3. Estructura de carpetas clave

```
orchestrator_service/
  main.py              # App FastAPI, POST /chat, LangChain agent, tools, Socket.IO
  admin_routes.py      # Todas las rutas /admin/* (pacientes, turnos, chat, tenants, settings, analytics, etc.)
  auth_routes.py       # /auth/login, /auth/register, /auth/me, /auth/clinics, /auth/profile
  db.py                # Pool PostgreSQL + Maintenance Robot (parches idempotentes en arranque)
  gcal_service.py      # Google Calendar (disponibilidad, eventos, bloques)
  analytics_service.py # Métricas por profesional (CEO)

frontend_react/src/
  App.tsx              # Rutas; LanguageProvider y AuthProvider envuelven todo
  context/
    AuthContext.tsx    # Sesión, rol, usuario
    LanguageContext.tsx # language, setLanguage, t(key); locales es/en/fr
  api/axios.ts         # Cliente HTTP; inyecta Authorization, X-Admin-Token
  views/              # Una vista por pantalla (LoginView, AgendaView, ChatsView, etc.)
  components/         # Layout, Sidebar, AppointmentForm, MobileAgenda, AnalyticsFilters, etc.
  locales/
    es.json, en.json, fr.json  # Traducciones; todas las vistas usan t('clave')
```

---

## 4. Reglas obligatorias (resumen de AGENTS.md)

- **Backend – Soberanía:** Todas las consultas (SELECT/INSERT/UPDATE/DELETE) deben filtrar por `tenant_id`. El aislamiento por sede es inviolable.
- **Backend – Auth:** Rutas admin usan `verify_admin_token` (valida JWT + X-Admin-Token + rol). No usar `get_current_user` solo en rutas que requieran rol CEO.
- **Frontend – Rutas:** Rutas con hijos deben usar `path="/*"`. `/profesionales` redirige a `/aprobaciones`; la gestión de profesionales es desde Personal Activo (UserApprovalView).
- **Frontend – Scroll:** Aislamiento de scroll: contenedor global `h-screen overflow-hidden`; vistas con `flex-1 min-h-0 overflow-y-auto` para no romper layout.
- **Frontend – i18n:** Cualquier texto visible debe usar `useTranslation()` y `t('namespace.key')`. Añadir claves en `es.json`, `en.json` y `fr.json`.
- **Base de datos:** No ejecutar SQL manual contra producción. Cambios de esquema: añadir parches idempotentes en `db.py` (bloques `DO $$ ... END $$`) y, si aplica, actualizar `db/init/dentalogic_schema.sql` para instalaciones nuevas.

---

## 5. Cómo ejecutar el proyecto

- **Todo el stack:** `docker-compose up --build` (Orchestrator en 8000, WhatsApp en 8002, frontend en 5173, Postgres, Redis).
- **Solo frontend (dev):** `cd frontend_react && npm install && npm run dev` (asume API en `VITE_API_URL` o `http://localhost:8000`).
- **Variables mínimas:** Ver `docs/02_environment_variables.md`. Imprescindibles: `POSTGRES_DSN`, `REDIS_URL`, `OPENAI_API_KEY`, `JWT_SECRET_KEY`, `ADMIN_TOKEN` (y para WhatsApp: `YCLOUD_*`). Opcional: `CREDENTIALS_FERNET_KEY` para connect-sovereign (Google Calendar).

---

## 6. Backend – Resumen de API

- **Auth:** `POST /auth/login`, `POST /auth/register` (con `tenant_id`, specialty, phone_number, registration_id para professional/secretary), `GET /auth/clinics`, `GET /auth/me`, `GET/PATCH /auth/profile`.
- **Admin – Configuración:** `GET /admin/settings/clinic` (devuelve `ui_language` es|en|fr), `PATCH /admin/settings/clinic` (body `{ "ui_language": "es"|"en"|"fr" }` → `tenants.config.ui_language`).
- **Admin – Pacientes, turnos, profesionales, chat, tenants, tratamientos, analíticas, calendario:** Ver `docs/AUDIT_ESTADO_PROYECTO.md` sección 2 (tablas de endpoints) o `docs/API_REFERENCE.md`.
- **Chat IA:** `POST /chat` (mensaje entrante; contexto `current_customer_phone`, `current_tenant_id`; tools con filtro por tenant).

**Tools del agente (nombres exactos):** `check_availability`, `book_appointment`, `triage_urgency`, `derivhumano`, `cancel_appointment`, `reschedule_appointment`, `list_services`. Todos reciben/respetan `tenant_id`.

**Flujo del agente (datos que necesita):** Saludo mencionando la clínica → definir **siempre un servicio** (máx. 3 si se listan) → usar duración del servicio para disponibilidad y agendar → **consultar disponibilidad** (local o Google según sede) y **elegir profesional** (preguntar preferencia o "cualquiera disponible") → con servicio, profesional (opcional), día/hora y datos del paciente, ejecutar `book_appointment`. Detalle en `README.md` (sección "Flujo del agente de IA") y `docs/04_agent_logic_and_persona.md` (sección 3.1).

---

## 7. Frontend – Rutas y vistas

| Ruta | Vista | Notas |
|------|--------|--------|
| `/login` | LoginView | Registro con sede, especialidad, teléfono, matrícula para pro/secretary |
| `/` | DashboardView | KPIs, urgencias, gráficos |
| `/agenda` | AgendaView | FullCalendar, Socket.IO, leyenda origen (IA/Manual/GCal) traducida |
| `/pacientes`, `/pacientes/:id` | PatientsView, PatientDetail | Listado y ficha clínica |
| `/chats` | ChatsView | Por tenant_id; human intervention, remove-silence, send manual |
| `/profesionales` | Redirect | → `/aprobaciones` |
| `/analytics/professionals` | ProfessionalAnalyticsView | Solo CEO; filtros y tabla con t() |
| `/tratamientos` | TreatmentsView | CRUD treatment-types |
| `/perfil` | ProfileView | Perfil usuario |
| `/aprobaciones` | UserApprovalView | Pendientes + Personal Activo; modal detalle, Vincular a sede, Editar Perfil |
| `/sedes` | ClinicsView | CRUD tenants (solo CEO) |
| `/configuracion` | ConfigView | Selector idioma (es/en/fr); GET/PATCH settings/clinic |

Todas las vistas anteriores usan `useTranslation()` y `t()` para respetar el selector de idioma.

---

## 8. Base de datos (PostgreSQL)

- **Esquema base:** `db/init/dentalogic_schema.sql` (tenants, users, professionals, patients, appointments, clinical_records, chat_messages, treatment_types, credentials, etc.).
- **Evolución:** `orchestrator_service/db.py` – Maintenance Robot aplica parches en cada arranque (tenant_id en tablas, columnas source, google_calendar_event_id, phone_number, specialty en professionals, etc.). Siempre idempotente (`DO $$ ... IF NOT EXISTS ... END $$`).
- **Multi-tenant:** Tablas con `tenant_id`: tenants, professionals, patients, appointments, clinical_records, treatment_types, chat_messages, google_calendar_blocks, etc. Toda consulta debe filtrar por `tenant_id` del usuario/sesión.
- **Config por sede:** `tenants.config` (JSONB): `ui_language`, `calendar_provider` ('local' | 'google'), etc.

---

## 9. i18n (idiomas en la plataforma)

- **Idiomas:** Español (es), Inglés (en), Francés (fr). Idioma por defecto: **inglés**.
- **Dónde se elige:** Configuración (`/configuracion`) – solo CEO. Se persiste en `tenants.config.ui_language` vía PATCH `/admin/settings/clinic`.
- **Frontend:** `LanguageProvider` envuelve la app. Al cargar con sesión se obtiene idioma de GET `/admin/settings/clinic`; también se usa `localStorage` (`ui_language`). Componentes usan `useTranslation()` y `t('namespace.key')`. Archivos: `frontend_react/src/locales/es.json`, `en.json`, `fr.json`.
- **Añadir un texto traducido:** 1) Añadir clave en los tres JSON (ej. `"my_section.my_key": "Texto"`). 2) En el componente: `const { t } = useTranslation();` y usar `t('my_section.my_key')`.
- **Agente WhatsApp:** Responde en el idioma del mensaje del paciente (detección es/en/fr en backend); no depende del idioma de la UI.

---

## 10. Documentación – Índice rápido

| Documento | Contenido |
|-----------|-----------|
| **AGENTS.md** (raíz) | Reglas de oro, soberanía, tools, Maintenance Robot, i18n. **Leer antes de modificar.** |
| **README.md** | Visión general, para quién es, funcionalidades, multi-sede, idiomas, guía rápida, enlaces a docs. |
| **docs/01_architecture.md** | Diagrama, microservicios, base de datos, seguridad, flujo urgencia. |
| **docs/02_environment_variables.md** | Variables de entorno por servicio. |
| **docs/03_deployment_guide.md** | Despliegue (EasyPanel, etc.). |
| **docs/04_agent_logic_and_persona.md** | Persona del agente, reglas de conversación, flujo de datos (servicio, profesional, disponibilidad, agendar). |
| **docs/26_calendario_hibrido_clinica_profesional.spec.md** | Calendario local vs Google por clínica, `google_calendar_id` por profesional. |
| **docs/audit_26_calendario_hibrido_2026-02-10.md** | Auditoría spec 26 (match código vs spec). |
| **docs/05_developer_notes.md** | Cómo añadir tools, paginación, debugging, Maintenance Robot, i18n, agenda móvil, analytics. |
| **docs/07_workflow_guide.md** | Ciclo de tareas, Git, documentación, troubleshooting, comunicación entre servicios. |
| **docs/25_idioma_plataforma_y_agente.spec.md** | Spec idioma UI + agente; sección 10 = i18n completado por vista. |
| **docs/AUDIT_ESTADO_PROYECTO.md** | Estado detallado: endpoints por módulo, rutas frontend, estado por página, specs vs código, correcciones recientes. |
| **docs/API_REFERENCE.md** | Contratos de API administrativa. |
| **docs/PROMPT_CONTEXTO_IA_COMPLETO.md** | Prompt listo para copiar/pegar en otra conversación: reglas, workflows, skills, checklist. |

---

## 11. Tareas frecuentes (cómo trabajar)

- **Añadir una tool al agente:** Definir función en `main.py` con `@tool`, añadirla a la lista `tools` del agente. Respetar siempre `tenant_id` en la lógica.
- **Añadir un endpoint admin:** En `admin_routes.py`, usar `verify_admin_token`, obtener `tenant_id` del usuario cuando aplique, filtrar consultas por `tenant_id`.
- **Añadir una vista o ruta en el frontend:** Crear vista en `frontend_react/src/views/`, añadir ruta en `App.tsx` (y en Sidebar si debe aparecer en menú). Usar `useTranslation()` y `t()` para todos los textos.
- **Añadir traducciones:** Añadir claves en `es.json`, `en.json`, `fr.json`; en el componente usar `t('namespace.key')`.
- **Cambiar el esquema de BD:** Añadir parche idempotente en `orchestrator_service/db.py`; opcionalmente actualizar `db/init/dentalogic_schema.sql` para nuevas instalaciones. No ejecutar SQL directo en producción sin flujo controlado.

---

*Documento pensado para que un agente de IA en otra conversación pueda tomar contexto completo del proyecto Dentalogic y trabajar de forma coherente con las reglas y la estructura existente.*
