# 🤖 AGENTS.md: La Guía Suprema para el Mantenimiento del Proyecto (Nexus v7.6)

Este documento es el manual de instrucciones definitivo para cualquier IA o desarrollador que necesite modificar o extender este sistema. Sigue estas reglas para evitar regresiones.

---

## 🏗️ Arquitectura de Microservicios (v7.6 Platinum)

### 📡 Core Intelligence (Orchestrator) - `orchestrator_service`
El cerebro central. Gestiona el agente LangChain, la memoria y la base de datos.
- **Seguridad de Triple Capa:** JWT para identidad, `X-Admin-Token` para infraestructura, y estado `pending` para nuevos registros.
- **Maintenance Robot (db.py):** Sistema de auto-curación de base de datos. Los parches PL/pgSQL se ejecutan en cada arranque para asegurar el esquema.
- **WebSocket / Socket.IO:** Sincronización en tiempo real de la agenda.

> [!IMPORTANT]
> **REGLA DE SOBERANÍA (BACKEND)**: Es obligatorio incluir el filtro `tenant_id` en todas las consultas (SELECT/INSERT/UPDATE/DELETE). El aislamiento de datos es la barrera legal y técnica inviolable del sistema.

> [!IMPORTANT]
> **REGLA DE SOBERANÍA (FRONTEND)**: Implementar siempre "Aislamiento de Scroll" (`h-screen`, `overflow-hidden` global y `overflow-y-auto` interno) para garantizar que los datos densos no rompan la experiencia de usuario ni se fuguen visualmente fuera de sus contenedores.

### 📱 Percepción y Transmisión (WhatsApp Service) - `whatsapp_service`
Maneja la integración con YCloud y la IA de audio (Whisper).

### 🎨 Control (Frontend React)
- **Routing:** Usa `path="/*"` en el router raíz de `App.tsx` para permitir rutas anidadas.
- **AuthContext:** Gestiona el estado de sesión y rol del usuario.
- **Chats por clínica:** ChatsView usa GET `/admin/chat/tenants` y GET `/admin/chat/sessions?tenant_id=`. Selector de Clínicas para CEO (varias clínicas); secretaria/profesional ven una sola. Mensajes, human-intervention y remove-silence usan `tenant_id`; override 24h independiente por clínica.

---

## 💾 Base de Datos y Lógica de Bloqueo

### 🚦 Mecanismo de Silencio (Human Override)
- **Duración:** 24 horas. Se guarda en `human_override_until`.
- **Por clínica:** Override y ventana de 24h son por `(tenant_id, phone_number)` en `patients`. Una intervención en la Clínica A no afecta a la Clínica B.

### 🧠 Cerebro Híbrido (Calendario por clínica)
- **`tenants.config.calendar_provider`:** `'local'` o `'google'`.
- **`check_availability` / `book_appointment`:** Si `calendar_provider == 'google'` → usan `gcal_service` y eventos GCal; si `'local'` → solo consultas SQL a `appointments` (y bloques locales). Siempre filtro por `tenant_id`.
- La IA usa la API Key global (env) para razonamiento; los datos de turnos están aislados por clínica.

### 🤖 Maintenance Robot (Self-Healing)
- **Protocolo Omega Prime:** Se auto-activa al primer administrador (CEO) para evitar bloqueos en despliegues nuevos.
- **Parches 12–15 (idempotentes):** Añaden `tenant_id` + índice en `professionals`, `appointments`, `treatment_types`, `chat_messages`; en `appointments` aseguran columnas `source` y `google_calendar_event_id`. Usan bloques `DO $$ BEGIN ... END $$` para no romper datos existentes.

---

## 🛠️ Herramientas (Tools) - Nombres Exactos
- `check_availability`: Consulta disponibilidad de turnos (por `calendar_provider`: google → GCal, local → solo BD).
- `book_appointment`: Registra un turno (misma lógica híbrida; siempre por `tenant_id`).
- `triage_urgency`: Analiza síntomas.
- `derivhumano`: Derivación a humano y bloqueo de 24h (por `tenant_id` + phone en `patients`).
- `cancel_appointment` / `reschedule_appointment`: Aislados por tenant; GCal solo si `calendar_provider == 'google'`.

---

## 📜 Reglas de Oro para el Código

### 1. 🐍 Python (Backend)
- **Auth Layers**: Siempre usa `Depends(get_current_user)` para rutas protegidas.
- **Exception handling**: Usa el manejador global en `main.py` para asegurar estabilidad de CORS.

### 2. 🔄 React (Frontend)
- **Wildcard Routes**: Siempre pon `/*` en rutas que contengan `Routes` hijos.
- **Axios**: Los headers `Authorization` y `X-Admin-Token` se inyectan automáticamente en `api/axios.ts`.

---

## 📈 Observabilidad
- Los links de activación se imprimen en los logs como `WARNING` (Protocolo Omega).

---

## 🔐 Integración Auth0 / Google Calendar (connect-sovereign)
- **POST `/admin/calendar/connect-sovereign`:** Recibe el token de Auth0; se guarda **cifrado con Fernet** (clave en `CREDENTIALS_FERNET_KEY`) en la tabla `credentials` con `category = 'google_calendar'`, asociado al `tenant_id` de la clínica. Tras guardar, el sistema actualiza `tenants.config.calendar_provider` a `'google'` para esa clínica.
- La clave de cifrado debe generarse una vez (en Windows: `py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) y definirse en el entorno.

---

## 🛠️ Available Skills Index

| Skill Name | Trigger | Descripción |
| :--- | :--- | :--- |
| **Sovereign Backend Engineer** | *v8.0, JIT, API* | v8.0: Senior Backend Architect. Experto en lógica de negocio, JIT v2 y multi-tenancy. |
| **Nexus UI Developer** | *React, Frontend* | Especialista en interfaces dinámicas, reordering en tiempo real y Socket.IO. |
| **Prompt Architect** | *Identity, Persona* | Mantenimiento de la identidad (Dra. Laura Delgado) y tono rioplatense. |
| **DB Schema Surgeon** | *v8.0, Idempotent* | v8.0: Database & Persistence Master. Gestión de evolución segura y JSONB clínico. |
| **Maintenance Robot Architect**| *db.py, miguel* | Arquitecto de evolución de base de datos segura y self-healing. |
| **Mobile Adaptation Architect**| *v8.0, DKG* | v8.0: Senior UI/UX Architect. Especialista en Blueprint Universal y Scroll Isolation. |

---
*Actualizado: 2026-02-08 - Protocolo Platinum Resilience v7.6 (Cerebro Híbrido, Chats por clínica, connect-sovereign)*
