# Especificación: Página Profesionales como Panel de Control CEO

**Fecha:** 2026-02-08  
**Estado:** Vigente  
**Relación:** Complementa `20_professionals_personal_activo_sync.spec.md` y `15_ceo_professionals_analytics.spec.md`.

## 1. Contexto y objetivo

La página **Profesionales** no es solo un listado CRUD: es la vista donde el CEO **controla y mide** lo que hacen sus profesionales en la plataforma. Cada profesional (y secretarias) debe cumplir requisitos que la plataforma debe hacer **medibles**.

### Visión de producto

- **Tiempo de uso por profesional/secretaria**: cuánto y cuándo usan la plataforma.
- **Información sobre sus pacientes**: volumen, recurrentes, nuevos, historial.
- **Quejas y buenos comentarios**: feedback asociado al profesional (pacientes, interacciones).
- **Análisis con IA por profesional**: resúmenes, tendencias, riesgo, oportunidades.
- **Interacciones con pacientes**: mensajes, derivaciones, triage, re-agendamientos.
- **Enlace con mensajes**: si el paciente es habitual, poder ver y usar el historial de mensajes (WhatsApp) en contexto del profesional.

Objetivo: que el CEO pueda **evaluar y supervisar** a sus profesionales desde una sola página con información detallada y métricas accionables.

## 2. Requisitos ya cumplidos (baseline)

| Requisito | Implementación |
|-----------|----------------|
| Profesional creado (mail nuevo o existente) debe aparecer en Profesionales | POST /admin/professionals con `tenant_id`; INSERT en `users` + `professionals`. |
| CEO debe ver profesionales de **todas** sus sedes en la página Profesionales | GET /admin/professionals: si el usuario es CEO (`allowed_ids` > 1), se listan profesionales con `tenant_id IN (allowed_ids)`. |
| Personal Activo y Profesionales alineados | Ver spec 20: vincular por email + sede; profesional aparece en ambas vistas cuando tiene fila en `professionals`. |

## 3. Entradas y salidas (visión futura)

| Entrada / Dato | Origen | Uso en página Profesionales |
|----------------|--------|------------------------------|
| Lista de profesionales | GET /admin/professionals (todas las sedes para CEO) | Cards/tabla con datos básicos + enlace a detalle. |
| Tiempo de uso | Sesiones, logs de login, actividad en agenda/chats | Métrica “tiempo en plataforma” por profesional/secretaria. |
| Pacientes del profesional | appointments + patients (por professional_id) | “Pacientes atendidos”, “recurrentes vs nuevos”. |
| Quejas / comentarios | (Futuro) feedback, ratings o notas en turnos/pacientes | Badge o sección por profesional. |
| Análisis IA | (Futuro) resúmenes por profesional (interacciones, riesgo, sugerencias) | Bloque “Análisis IA” en ficha del profesional. |
| Interacciones (mensajes, triage, derivaciones) | chat_messages, human_overrides, appointments | Enlace “Ver interacciones” / “Chats relacionados”. |
| Mensajes de pacientes habituales | chat_messages + patients (por tenant) | En ficha profesional: “Pacientes con historial de chat” y acceso a conversación. |

## 4. Criterios de aceptación (actuales y deseados)

### Actuales (obligatorios)

```gherkin
Scenario: CEO ve todos los profesionales de sus sedes
  Given el usuario es CEO con acceso a varias sedes
  When entra a la página Profesionales
  Then GET /admin/professionals devuelve profesionales de todas las sedes permitidas
  And cada profesional creado (mail nuevo o vinculado) aparece en la lista

Scenario: Profesional recién creado aparece en Profesionales
  Given el CEO crea un profesional con un mail nuevo y elige una sede
  When guarda el formulario
  Then existe una fila en users y una en professionals para esa sede
  And el profesional aparece en la página Profesionales (sin recargar otra sede)
```

### Deseados (backlog)

- Tiempo de uso por profesional/secretaria visible en la página o en ficha detalle.
- Resumen de pacientes (total, nuevos, recurrentes) por profesional.
- Quejas y buenos comentarios asociados y mostrados.
- Bloque “Análisis IA” por profesional (resumen, tendencias).
- Acceso a interacciones (mensajes, derivaciones) y enlace a chats de pacientes habituales desde la ficha del profesional.

## 5. Cambios técnicos realizados (2026-02-08)

### Backend (`orchestrator_service/admin_routes.py`)

- **GET /admin/professionals**: Ahora recibe `allowed_ids` (vía `get_allowed_tenant_ids`). Si `len(allowed_ids) > 1` (CEO), se devuelven profesionales con `WHERE tenant_id = ANY($1::int[])`. Para un solo tenant (secretary/professional) se mantiene el filtro por `resolved_tenant_id`. Así, todo profesional creado en cualquier sede aparece en la lista para el CEO.

### Soberanía

- Sigue aplicando la Regla de Oro: todas las consultas usan `tenant_id`; el CEO solo ve profesionales de sus sedes (`allowed_ids`).

### 5.2 Frontend y flujo Personal Activo (2026-02-08)

- **Página Profesionales eliminada del menú:** La ruta `/profesionales` redirige a `/aprobaciones`. La gestión de profesionales se realiza desde **Personal Activo** (UserApprovalView).
- **Modal de detalle:** Al hacer clic en una tarjeta de Personal Activo se abre un modal con datos del usuario (nombre, email, sedes vinculadas). Desde ahí se puede **Vincular a sede** (formulario: sede, teléfono, especialidad dropdown, matrícula) o abrir **Editar Perfil**.
- **Botón tuerca (config):** En cada tarjeta de Personal Activo, a la izquierda de "Suspender Acceso", un botón redondo con icono de engranaje abre el **modal Editar Perfil** (o el formulario Vincular si el usuario no tiene ninguna fila en `professionals`). Se usa `GET /admin/professionals/by-user/:user_id` para cargar datos.
- **Modal Editar Perfil:** Diseño en tres columnas (Datos Principales con Sede en solo lectura, Contacto & Estado, Disponibilidad con días y slots), modal grande (`max-w-6xl`, `max-h-[92vh]`), guardado vía `PUT /admin/professionals/:id`. Especialidad siempre como selector (dropdown).
- **Backend:** Fallbacks en create/update de profesionales cuando la BD no tiene columnas `phone_number`, `specialty`, `updated_at`, `working_hours`. Parches 12d y 12e en `db.py` añaden `phone_number` y `specialty` a `professionals` si no existen. Al aprobar usuario (POST `/admin/users/:id/status` con `active`), si es professional/secretary y no tiene fila en `professionals`, se crea una para el primer tenant.

## 6. Referencias

- AGENTS.md: Regla de Soberanía, aislamiento por `tenant_id`.
- `docs/20_professionals_personal_activo_sync.spec.md`: sincronización Personal Activo ↔ Profesionales.
- `docs/15_ceo_professionals_analytics.spec.md`: analítica estratégica (KPIs, tags, dashboard).
