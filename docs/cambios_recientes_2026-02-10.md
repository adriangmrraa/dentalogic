# Cambios recientes (sesión 2026-02-10)

Este documento resume las actualizaciones de código y documentación realizadas en la sesión del 10 de febrero de 2026. Se mantiene como referencia histórica y para que cualquier desarrollador o IA entienda qué se tocó.

---

## 1. Especificación e implementación – Calendario híbrido (spec 26)

- **Backend:** GET `/admin/professionals/by-user/{user_id}` incluye `google_calendar_id`; PUT `/admin/professionals/{id}` actualiza `google_calendar_id`; POST `/auth/register` persiste `google_calendar_id` al crear profesional. Fallbacks para BD sin la columna (`UndefinedColumnError`).
- **Frontend:** Modal Editar perfil (UserApprovalView) con campo "ID Calendario (Google)" y envío en el PUT; i18n en es/en/fr.
- **System prompt:** Texto que explica que la disponibilidad se consulta en local o Google por profesional según la clínica.
- **Documentación:** Variable `GOOGLE_CREDENTIALS` documentada en `docs/02_environment_variables.md`.

---

## 2. Disponibilidad – Huecos cuando la semana está libre

- **Problema:** El agente no devolvía horarios aunque no hubiera turnos en la semana.
- **Causa:** Si un profesional tenía `working_hours` vacío o el día sin `enabled`/`slots`, todo el día se marcaba como ocupado.
- **Solución:** En `check_availability` solo se marcan como ocupados los horarios fuera de working_hours cuando el día tiene `enabled` y `slots`; si no, el profesional se considera disponible en horario clínica.
- **Además:** Mensaje claro cuando no hay profesionales activos en la sede.

---

## 3. Logging y resolución de tenant (chat)

- **Problema:** No aparecían logs en el orchestrator al recibir mensajes por WhatsApp.
- **Cambios:** Log WARNING al entrar en POST `/chat` (from, to, preview del mensaje); log INFO tras resolver `tenant_id`; en `check_availability` logs al entrar, al devolver slots y en excepciones (`logger.exception`).
- **Resolución de tenant:** Fallback por número normalizado (solo dígitos): si no hay match por `bot_phone_number` exacto, se busca con `REGEXP_REPLACE(bot_phone_number, '[^0-9]', '', 'g')` (PostgreSQL no soporta `\D`).

---

## 4. System prompt – Flujo de agendamiento

- **Servicios:** Siempre definir un servicio antes de disponibilidad/agendar; no listar todos; si se listan, máximo 3.
- **Flujo explícito:** Saludo → definir servicio → (opcional) preferencia de profesional → check_availability con treatment_name → ofrecer horarios → datos del paciente → book_appointment solo con todo completo.
- **Requisitos de book_appointment:** documentados en el prompt (date_time, treatment_reason, first_name, last_name, dni, insurance_provider; professional_name opcional).

---

## 5. Modal Nuevo Paciente + turno

- **Problema:** Al crear paciente y turno en un paso, el turno fallaba y el paciente no aparecía en la lista (la lista solo muestra pacientes con al menos un turno).
- **Causa:** El frontend enviaba `datetime` y `type`; el backend espera `appointment_datetime` y `appointment_type`.
- **Solución:** PatientsView envía `appointment_datetime` y `appointment_type` en POST `/admin/appointments`. Backend: UniqueViolationError en creación de paciente devuelve 409 con mensaje claro ("Ya existe un paciente con ese número de teléfono en esta sede"); el frontend muestra el mensaje de error del backend.

---

## 6. Bug fix – Tratamientos en blanco

- **Problema:** Página de Tratamientos en blanco por `ReferenceError: Edit2 is not defined`.
- **Solución:** Añadido import de `Edit2` desde `lucide-react` en TreatmentsView.tsx.

---

## 7. Auditoría spec 26

- Informe en `docs/audit_26_calendario_hibrido_2026-02-10.md`: comparativa código vs spec 26, criterios de aceptación cubiertos, drift corregido (regex PostgreSQL `[^0-9]`).

---

## 8. Documentación actualizada (Non-Destructive Fusion)

- **README.md:** Nueva sección "Flujo del agente de IA (datos que necesita)" con los 5 pasos (saludo/clínica, servicio máx. 3, duración, disponibilidad y profesional, agendar). Estado actual del proyecto ampliado. Tabla de documentación técnica (backend, frontend, BD, flujos, spec 26, audit).
- **docs/04_agent_logic_and_persona.md:** Tabla de tools actualizada (parámetros); nueva sección 3.1 "Flujo de conversación y datos que necesita el agente" con el mismo flujo detallado.
- **docs/01_architecture.md:** Descripción de `check_availability` y `book_appointment` ampliada (cerebro híbrido, duración por tratamiento, working hours vacío).
- **docs/CONTEXTO_AGENTE_IA.md:** Fecha de actualización 2026-02-10; párrafo "Flujo del agente"; índice con 04, spec 26 y audit.
- **docs/cambios_recientes_2026-02-10.md:** Este archivo.

---

*Documento generado según workflow Update Docs. Protocolo Non-Destructive Fusion.*
