# Auditoría de estado del proyecto – Dentalogic / Nexus

**Fecha:** 2026-02-08  
**Workflow:** Audit (detección de drift y estado global)  
**Alcance:** Backend, Frontend, Base de datos, Lógica, Especificaciones vs código.

---

## 1. Resumen ejecutivo

| Área        | Estado global | Drift / Riesgos |
|------------|----------------|------------------|
| Backend    | ✅ Funcional   | ✅ **Corregido:** rutas `/admin/tenants` ahora usan `verify_admin_token` (antes `get_current_user` no definido). Bloque `except` suelto eliminado. |
| Frontend   | ✅ Funcional   | ⚠️ Vista Configuración es placeholder. Sedes (ClinicsView) ya puede usar `/admin/tenants` correctamente. |
| Base de datos | ✅ Esquema unificado | ✅ Aislamiento por `tenant_id` en tablas críticas. |
| Lógica     | ✅ Coherente  | Soberanía (tenant_id, JWT) aplicada en la mayoría de endpoints. |
| Specs vs código | Parcial | Algunas specs implementadas; otras (ej. Sovereign Glass) parciales. |

---

## 2. Backend (orchestrator_service)

### 2.1 Stack y archivos críticos

- **Framework:** FastAPI  
- **DB:** asyncpg (PostgreSQL)  
- **Archivos:** `main.py` (app, chat, tools LangChain, Socket.IO), `admin_routes.py` (API admin), `auth_routes.py` (login/register/me/profile), `db.py` (pool + Maintenance Robot), `gcal_service.py` (Google Calendar), `analytics_service.py` (métricas profesionales).  
- **Env opcional:** `CREDENTIALS_FERNET_KEY` (clave Fernet para cifrar tokens en `credentials`; requerida por `POST /admin/calendar/connect-sovereign`). Ver `docs/02_environment_variables.md`.

### 2.2 Auth y seguridad

- **Auth:** JWT en `/auth/login`; `auth_service.decode_token` para sesión.  
- **Admin:** Doble capa: `X-Admin-Token` (header) + JWT en `Authorization`.  
- **Dependencia principal:** `verify_admin_token` en la mayoría de rutas admin (valida token + JWT + rol `ceo`|`secretary`|`professional`).  
- **Nota:** Las rutas de tenants usan `verify_admin_token` y comprueban `user_data.role == 'ceo'`; no se usa `get_current_user`.

### 2.3 Endpoints por módulo

#### Auth (`/auth`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Registro usuario (status `pending`), Protocolo Omega. |
| POST | `/auth/login` | Login, retorna JWT + user. |
| GET | `/auth/me` | Usuario actual (JWT). |
| GET | `/auth/profile` | Perfil extendido. |
| PATCH | `/auth/profile` | Actualizar perfil. |

#### Admin – Usuarios y aprobaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/users/pending` | Usuarios pendientes de aprobación. |
| GET | `/admin/users` | Listado de usuarios. |
| POST | `/admin/users/{user_id}/status` | Actualizar status (ej. aprobar). |

#### Admin – Tenants (Sedes/Clínicas)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/tenants` | Listar tenants (solo CEO). |
| POST | `/admin/tenants` | Crear tenant (solo CEO). |
| PUT | `/admin/tenants/{tenant_id}` | Actualizar tenant (solo CEO). |
| DELETE | `/admin/tenants/{tenant_id}` | Eliminar tenant (solo CEO). |

*Nota: Estas rutas usan `verify_admin_token` y comprueban `user_data.role == 'ceo'`.*

#### Admin – Chat / conversaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/chat/tenants` | Clínicas disponibles para Chats (CEO: todas; otros: una). |
| GET | `/admin/chat/sessions` | Sesiones de chat. **Query:** `tenant_id` (obligatorio). Solo sesiones de esa clínica; override 24h por (tenant_id, phone). |
| GET | `/admin/chat/messages/{phone}` | Mensajes por teléfono. **Query:** `tenant_id` (obligatorio). |
| PUT | `/admin/chat/sessions/{phone}/read` | Marcar conversación como leída. **Query:** `tenant_id`. |
| POST | `/admin/chat/human-intervention` | Activar/desactivar intervención humana. **Body:** `phone`, `tenant_id`, `activate`, `duration`. Independiente por clínica. |
| POST | `/admin/chat/remove-silence` | Quitar silencio (human override). **Body:** `phone`, `tenant_id`. |
| POST | `/admin/chat/send` | Enviar mensaje manual a WhatsApp. **Body:** `phone`, `tenant_id`, `message`. Ventana 24h por clínica. |
| GET | `/admin/chat/urgencies` | Urgencias recientes. |

#### Admin – Pacientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/patients` | Listar pacientes (filtro por tenant del usuario). |
| GET | `/admin/patients/{id}` | Detalle paciente. |
| PUT | `/admin/patients/{id}` | Actualizar paciente. |
| DELETE | `/admin/patients/{id}` | Eliminar paciente. |
| GET | `/admin/patients/phone/{phone}/context` | Contexto clínico por teléfono. |
| GET | `/admin/patients/{patient_id}/insurance-status` | Estado obra social. |
| GET | `/admin/patients/search-semantic` | Búsqueda por síntomas. |
| GET | `/admin/patients/{id}/records` | Historias clínicas. |
| POST | `/admin/patients/{id}/records` | Añadir nota clínica. |

#### Admin – Turnos (appointments)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/appointments` | Listar por rango de fechas (y opcional professional_id). |
| GET | `/admin/appointments/check-collisions` | Verificar colisiones. |
| POST | `/admin/appointments` | Crear turno manual. |
| PUT/PATCH | `/admin/appointments/{id}/status` | Cambiar estado. |
| PUT | `/admin/appointments/{id}` | Actualizar turno. |
| DELETE | `/admin/appointments/{id}` | Eliminar turno. |
| GET | `/admin/appointments/next-slots` | Próximos slots disponibles. |

#### Admin – Profesionales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/professionals` | Listar profesionales (por tenant). |
| POST | `/admin/professionals` | Crear profesional. |
| PUT | `/admin/professionals/{id}` | Actualizar profesional. |

#### Admin – Calendario / Google Calendar

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/admin/calendar/connect-sovereign` | Guardar token Auth0 cifrado (Fernet) en `credentials` (category `google_calendar`, por `tenant_id`) y poner `tenants.config.calendar_provider` en `'google'`. **Body:** `access_token`, opcional `tenant_id`. Requiere `CREDENTIALS_FERNET_KEY` en entorno. |
| GET | `/admin/calendar/blocks` | Bloques de calendario (rangos, professional_id). |
| POST | `/admin/calendar/blocks` | Crear bloque. |
| DELETE | `/admin/calendar/blocks/{block_id}` | Eliminar bloque. |
| POST | `/admin/calendar/sync` o `/admin/sync/calendar` | Disparar sincronización con GCal. |

#### Admin – Tratamientos (treatment-types)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/treatment-types` | Listar tipos. |
| GET | `/admin/treatment-types/{code}` | Detalle por código. |
| POST | `/admin/treatment-types` | Crear tipo. |
| PUT | `/admin/treatment-types/{code}` | Actualizar. |
| DELETE | `/admin/treatment-types/{code}` | Eliminar. |
| GET | `/admin/treatment-types/{code}/duration` | Duración (por urgencia). |

#### Admin – Dashboard y analíticas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/stats/summary` | Resumen dashboard (range: weekly, etc.). |
| GET | `/admin/analytics/professionals/summary` | Métricas por profesional (CEO / Estrategia). |

#### Admin – Configuración

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/config/deployment` | Config de despliegue. |
| GET | `/admin/settings/clinic` | Configuración de clínica. |

#### Interno (header X-Internal-Token)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/internal/credentials/{name}` | Credencial interna (servicios). |

### 2.4 Main.py – Chat IA y tools

- **POST /chat:** Entrada de mensajes (WhatsApp o UI). Context vars: `current_customer_phone`, `current_tenant_id`. Mensajes y handoff filtrados por `tenant_id`; override 24h por (tenant_id, phone). Socket `NEW_MESSAGE` incluye `tenant_id`.
- **Cerebro Híbrido:** `check_availability` y `book_appointment` usan `get_tenant_calendar_provider(tenant_id)`: si `'google'` → GCal + BD; si `'local'` → solo BD (appointments). `cancel_appointment` y `reschedule_appointment` idem; Human Override y `derivhumano` por (tenant_id, phone).
- **Tools LangChain:** `check_availability`, `book_appointment`, `triage_urgency`, `derivhumano`, `cancel_appointment`, `reschedule_appointment`, `list_services`; todos con filtro por `tenant_id`.
- **Socket.IO:** Eventos de turnos y chat (NEW_MESSAGE, HUMAN_OVERRIDE_CHANGED, HUMAN_HANDOFF) con `tenant_id` cuando aplica.

### 2.5 Soberanía de datos (tenant_id)

- En `admin_routes`, las consultas a pacientes, turnos, profesionales, bloques de calendario, treatment_types, etc. filtran por `tenant_id` obtenido del usuario (JWT) o del contexto.  
- Rutas de tenants actuales no filtran por tenant (listan/crean/actualizan/eliminan todos los tenants); acceso restringido por rol CEO vía `get_current_user`, que está roto.

---

## 3. Frontend (frontend_react)

### 3.1 Stack

- React 18, TypeScript, Vite, Tailwind CSS, React Router, FullCalendar, Recharts, Socket.IO client, Axios.

### 3.2 Rutas (App.tsx) y vistas

| Ruta | Vista | Roles | Descripción breve |
|------|--------|-------|-------------------|
| `/login` | LoginView | Público | Login (email/password) → JWT + ADMIN_TOKEN en localStorage. |
| `/` | DashboardView | ceo, professional, secretary | KPIs (conversaciones IA, turnos, urgencias, ingresos), gráfico de crecimiento, lista de urgencias. |
| `/agenda` | AgendaView | ceo, professional, secretary | Calendario (FullCalendar + resource-timegrid), bloques GCal, crear/editar/cancelar turnos, Socket.IO para refresco. Vista móvil con MobileAgenda. |
| `/pacientes` | PatientsView | ceo, professional, secretary | Listado de pacientes. |
| `/pacientes/:id` | PatientDetail | ceo, professional, secretary | Detalle paciente, historial, notas. |
| `/chats` | ChatsView | ceo, professional, secretary | Sesiones de chat, mensajes por teléfono, envío manual, human intervention. |
| `/profesionales` | ProfessionalsView | ceo, secretary | CRUD profesionales. |
| `/analytics/professionals` | ProfessionalAnalyticsView | ceo | Analytics por profesional (métricas, filtros fechas, tags). |
| `/tratamientos` | TreatmentsView | ceo, secretary | CRUD tipos de tratamiento. |
| `/perfil` | ProfileView | Todos los roles | Perfil del usuario. |
| `/aprobaciones` | UserApprovalView | ceo | Aprobación de usuarios pendientes. |
| `/sedes` | ClinicsView | ceo | CRUD de tenants (sedes/clínicas). Llama a `/admin/tenants` → afectado por bug `get_current_user`. |
| `/configuracion` | (inline) | ceo | Placeholder: “Configuración – Próximamente…”. |

### 3.3 Componentes principales

- **Layout:** Sidebar colapsable, menú móvil, notificaciones Socket (handoff), área de contenido con hijos.  
- **Sidebar:** Items filtrados por rol; enlaces a todas las rutas anteriores.  
- **AgendaView:** FullCalendar, AppointmentForm, MobileAgenda, AppointmentCard; colores por origen (AI, manual, GCal).  
- **DashboardView:** KPICard, gráfico (recharts), UrgencyBadge; datos de `/admin/stats/summary` y `/admin/chat/urgencies`.  
- **ProfessionalAnalyticsView:** Filtros (fechas, profesionales), KPICard, BarChart, tabla de métricas; `/admin/analytics/professionals/summary`.  
- **ClinicsView:** Lista tenants, modal crear/editar, delete; `/admin/tenants` (GET/POST/PUT/DELETE).

### 3.4 API (axios.ts)

- Base URL: `VITE_API_URL` o `http://localhost:8000`.  
- Headers: `X-Admin-Token` (localStorage ADMIN_TOKEN), `Authorization: Bearer <JWT_TOKEN>`, `X-Tenant-ID` (localStorage/sessionStorage o default).  
- Retry con backoff en 5xx/timeout; 401 → limpieza y redirección a `/login`.

### 3.5 Estado por página (resumen)

| Página | Estado | Backend usado | Notas |
|--------|--------|----------------|-------|
| Login | ✅ | /auth/login | Guarda JWT + ADMIN_TOKEN. |
| Dashboard | ✅ | /admin/stats/summary, /admin/chat/urgencies | KPIs y urgencias. |
| Agenda | ✅ | /admin/appointments, /admin/calendar/blocks, /admin/professionals, next-slots, create/update/delete appointment, calendar/sync | Socket.IO para actualizaciones. |
| Pacientes | ✅ | /admin/patients | Listado y filtros. |
| Detalle paciente | ✅ | /admin/patients/{id}, /admin/patients/{id}/records | Notas clínicas. |
| Chats | ✅ | /admin/chat/tenants, /admin/chat/sessions?tenant_id=, messages, send, human-intervention, remove-silence, PUT sessions/read | Selector de Clínica (CEO varias); sesiones y override por tenant_id. |
| Profesionales | ✅ | /admin/professionals | CRUD. |
| Analytics profesionales | ✅ | /admin/analytics/professionals/summary | Solo CEO. |
| Tratamientos | ✅ | /admin/treatment-types | CRUD por código. |
| Perfil | ✅ | /auth/profile, PATCH /auth/profile | Edición perfil. |
| Aprobaciones | ✅ | /admin/users/pending, /admin/users/{id}/status | Solo CEO. |
| Sedes (Clinics) | ✅ | /admin/tenants | Corregido: backend usa `verify_admin_token`. |
| Configuración | ⚠️ | — | Solo placeholder. |

---

## 4. Base de datos

### 4.1 Esquema (dentalogic_schema.sql)

- **Mensajes y chat:** `inbound_messages`, `chat_messages` (desde parche 15: `chat_messages.tenant_id` para conversaciones por clínica).  
- **Tenant y config:** `tenants`, `credentials`, `system_events`.  
- **RBAC:** `users` (id UUID, email, role: ceo|professional|secretary, status: pending|active|suspended, professional_id).  
- **Profesionales:** `professionals` (tenant_id, user_id, first_name, last_name, email, is_active, google_calendar_id, etc.).  
- **Pacientes:** `patients` (tenant_id, phone_number, dni, first_name, last_name, human_handoff_requested, human_override_until, etc.).  
- **Historias clínicas:** `clinical_records` (tenant_id, patient_id, professional_id, odontogram, treatment_plan, etc.).  
- **Turnos:** `appointments` (tenant_id, patient_id, professional_id, appointment_datetime, duration_minutes, google_calendar_event_id, status, urgency_level, source, etc.).  
- **Contabilidad:** `accounting_transactions`, `daily_cash_flow`.  
- **Calendario:** `google_calendar_blocks`, `calendar_sync_log`.  
- **Tratamientos:** `treatment_types` (tenant_id, code, name, default_duration_minutes, etc.).  
- **Función:** `get_treatment_duration(p_treatment_code, p_tenant_id, p_urgency_level)`.

### 4.2 Mantenimiento (db.py)

- **Maintenance Robot:** Al arrancar, comprueba existencia del esquema; si no existe aplica `dentalogic_schema.sql`.  
- **Evolution pipeline:** Parches idempotentes (user_id en professionals, Protocolo Omega Prime, DNI/last_name nullable, **parches 12–15:** `tenant_id` + índice en `professionals`, `appointments`, `treatment_types`, `chat_messages`; en `appointments` columnas `source` y `google_calendar_event_id`). `get_chat_history` acepta `tenant_id` opcional para historial por clínica.  
- Conexión vía `POSTGRES_DSN` (asyncpg).

### 4.3 Aislamiento multi-tenant

- Tablas con `tenant_id`: tenants, credentials, professionals, patients, clinical_records, appointments, accounting_transactions, daily_cash_flow, google_calendar_blocks, calendar_sync_log, treatment_types.  
- Consultas en admin_routes (pacientes, turnos, profesionales, bloques, treatment_types) usan `tenant_id` del usuario autenticado.  
- `users` no tiene `tenant_id`; la relación con tenant se hace vía `professionals.tenant_id` o lógica de negocio (por defecto tenant 1).

---

## 5. Lógica de negocio (resumen)

- **Auth:** Registro → pending; CEO aprueba en Aprobaciones; login solo si status active.  
- **Tenant:** Usuario tiene contexto de tenant (por profesional o por defecto); backend filtra por ese tenant en datos clínicos y operativos.  
- **Agenda:** Turnos en DB + bloques en GCal; sincronización bidireccional; creación/edición desde UI con chequeo de colisiones y next-slots.  
- **IA/WhatsApp:** Mensajes entrantes → LangChain agent con tools (disponibilidad, reserva, triaje, derivhumano); human override 24h; mensajes guardados en chat_messages.  
- **Analytics CEO:** Agregación por profesional (turnos, ingresos, tasas) en rango de fechas; endpoint `/admin/analytics/professionals/summary`.  

---

## 6. Specs vs código (drift)

| Spec | Ubicación | Estado | Drift / Notas |
|------|-----------|--------|----------------|
| Sovereign Glass (Agenda 2.0) | docs/16_sovereign_glass_architecture.spec.md | Parcial | Scroll isolation y glassmorphism aplicados en parte; revisar que todo contenedor flex-1 tenga min-h-0 y que no haya scroll global. |
| CEO Professionals Analytics | docs/15_ceo_professionals_analytics.spec.md | Implementado | ProfessionalAnalyticsView + `/admin/analytics/professionals/summary`. Spec marcada como superseded por arquitectura actual. |
| Agenda Inteligente 2.0 | docs/15_agenda_inteligente_2_0.spec.md | Implementado | Agenda con recursos, bloques GCal, Socket.IO. |
| Google Calendar sync fix | docs/14_google_calendar_sync_fix.spec.md | En uso | gcal_service y sync en admin. |
| Mobile scroll fix | docs/18_mobile_scroll_fix.spec.md | Parcial | MobileAgenda y patrones de scroll; auditar todas las vistas móviles. |
| Mobile agenda range fix | docs/17_mobile_agenda_range_fix.spec.md | Parcial | Rango de fechas en agenda móvil. |
| Treatments optimization | docs/19_treatments_optimization.spec.md | Implementado | treatment_types CRUD y duración por urgencia. |
| Dashboard Analytics Sovereign | Dashboard_Analytics_Sovereign/docs/specs/ | Módulo aparte | Dashboard_Analytics_Sovereign con vistas CEO/Secretary; no integrado en frontend_react principal. |

---

## 7. Acciones correctivas recomendadas

1. ~~**Crítico – Rutas tenants:**~~ **HECHO.** Las rutas `/admin/tenants` usan ya `verify_admin_token` y comprueban rol CEO; se eliminó el bloque `except` suelto que seguía a `delete_tenant`.  
2. **Configuración:** Sustituir el placeholder de `/configuracion` por una vista real (por ejemplo enlace a ajustes de clínica, credenciales o configuración de despliegue) o documentar como “pendiente”.  
3. **Sovereign Glass / Scroll:** Revisar Layout y AgendaView (y vistas con listas largas) para cumplir 100% con Scroll Isolation (h-screen, overflow-hidden, flex-1 min-h-0 overflow-y-auto).  
4. **Dashboard Analytics Sovereign:** Decidir si el módulo en `Dashboard_Analytics_Sovereign` debe integrarse en la SPA principal (rutas y menú) o permanecer como servicio/vista separado, y documentarlo.  
5. ~~**Auditoría de sintaxis en admin_routes**~~ **HECHO.** Se eliminó el bloque `except` suelto que estaba después de `delete_tenant`.

---

## 8. Conclusión

El proyecto está **operativo** en backend (excepto tenants), frontend (excepto Sedes y Configuración), base de datos y lógica de negocio. La soberanía de datos (tenant_id y JWT) está aplicada en la gran mayoría de los endpoints.  

**Drift crítico corregido:** las rutas de tenants usan `verify_admin_token` y la vista Sedes (ClinicsView) funciona. **Actualizaciones recientes (2026-02-08):** Cerebro Híbrido (calendar_provider local/google), Chats por clínica (tenant_id en sesiones/mensajes/override), Maintenance Robot parches 12–15 (tenant_id y chat_messages), POST `/admin/calendar/connect-sovereign` (token Auth0 cifrado Fernet → credentials, calendar_provider → google). Pendiente: alineación con specs (Scroll Isolation, vista Configuración, módulo Analytics Sovereign).

---

*Documento generado por workflow Audit – Dentalogic / Antigravity. Última actualización doc: 2026-02-08.*
