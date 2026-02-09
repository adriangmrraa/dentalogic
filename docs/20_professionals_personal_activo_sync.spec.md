# 📝 Especificación: Sincronización Personal Activo ↔ Profesionales y disponibilidad WhatsApp

## 1. Contexto

- **Personal Activo** (vista Aprobaciones) lista usuarios de la tabla `users` con rol `professional` o `secretary` y estado `active`.
- **Profesionales** lista filas de la tabla `professionals`, filtradas por `tenant_id`. Esa tabla tiene `working_hours` y es la que usan las tools del agente (`check_availability`, `book_appointment`) para ofrecer turnos por WhatsApp.
- Si un usuario está aprobado como profesional pero **no existe fila en `professionals`** para ese tenant, el agente responde "no tengo disponibilidad" aunque el usuario figure en Personal Activo.
- El botón "Nuevo Profesional" en la vista Profesionales usa `bg-primary`; en el tema actual `primary` no está definido en Tailwind, por lo que el botón pierde contraste sobre fondo blanco.

## 2. Objetivos

1. Alinear datos: que los profesionales activos (users con rol professional) tengan correspondencia en `professionals` con `working_hours` para que el agente pueda buscar disponibilidad por WhatsApp.
2. Cumplir Regla de Soberanía: todo por `tenant_id`; `POST /admin/professionals` debe incluir `tenant_id` en el INSERT.
3. Mejorar UX: botón "Nuevo Profesional" y CTA en estado vacío con contraste claro (p. ej. `bg-medical-600`).

## 3. Entradas y salidas

| Entrada | Origen | Salida / Efecto |
|--------|--------|------------------|
| Aprobación de usuario como professional | UserApprovalView | Opción A: auto-crear fila en `professionals` para ese `user_id` y tenant. Opción B: permitir "Vincular usuario existente" en Profesionales. |
| Crear nuevo profesional (form) | ProfessionalsView | INSERT en `users` + INSERT en `professionals` con **tenant_id** (y last_name si aplica). |
| Listado Profesionales | GET /admin/professionals | Ya filtra por `tenant_id`. Debe devolver datos suficientes para las cards (working_hours opcional en listado). |

## 4. Opciones de diseño

- **Opción A (recomendada en primera fase):** Al aprobar un usuario con rol `professional`, crear automáticamente una fila en `professionals` para el tenant correspondiente, con `working_hours` por defecto (generados por `generate_default_working_hours()`). Requiere definir a qué tenant se asocia (p. ej. tenant por defecto del CEO o selector en aprobación).
- **Opción B:** En la vista Profesionales, añadir flujo "Vincular usuario existente": selector de usuarios con rol `professional` que aún no tengan fila en `professionals` para ese tenant; al elegir uno, crear fila en `professionals` (user_id, tenant_id, working_hours por defecto).
- **Opción C:** Ambas (A + B) para máxima flexibilidad.

Para desbloquear WhatsApp de inmediato: **corregir POST /admin/professionals** (tenant_id + last_name) y **contraste del botón**; luego implementar A y/o B según prioridad.

## 5. Criterios de aceptación (Gherkin)

```gherkin
Feature: Profesionales y disponibilidad

  Scenario: Crear profesional desde admin con soberanía
    Given que el CEO está en la sucursal "Principal" (tenant_id resuelto)
    When crea un nuevo profesional con nombre y email
    Then se debe insertar en users y en professionals con tenant_id del contexto
    And el profesional debe aparecer en la lista de Profesionales de esa sucursal

  Scenario: Agente WhatsApp ofrece turnos
    Given que existe al menos un profesional en la tabla professionals para el tenant
    And ese profesional tiene working_hours definidos
    When un paciente pide por WhatsApp "turno mañana después de las 17"
    Then check_availability debe encontrar slots
    And el agente debe responder con opciones de horario

  Scenario: Botón Nuevo Profesional visible
    Given que el usuario está en la vista Profesionales
    Then el botón "Nuevo Profesional" debe tener contraste claro sobre fondo blanco
    And en estado vacío debe haber un CTA evidente para agregar el primer profesional
```

## 6. Cambios técnicos

### 6.1 Backend (`orchestrator_service/admin_routes.py`)

- **POST /admin/professionals**: Añadir `tenant_id: int = Depends(get_resolved_tenant_id)`. En el INSERT en `professionals`, incluir `tenant_id` y `last_name` (p. ej. vacío o derivado de `professional.name` si no hay campo apellido en el payload). Ajustar columnas al esquema real (tenant_id, user_id, first_name, last_name, email, phone_number, specialty, is_active, working_hours; license_number/address/availability si existen por parches).
- **Opcional (fase 2):** Endpoint o lógica "al aprobar usuario como professional": crear fila en `professionals` para ese user_id y tenant con working_hours por defecto.
- **Opcional (fase 2):** Endpoint "vincular usuario existente" (lista users con role=professional sin fila en professionals para el tenant; POST para crear professional con user_id existente).

### 6.2 Frontend (`frontend_react/src/views/ProfessionalsView.tsx`)

- Reemplazar `bg-primary` / `hover:bg-primary-dark` por clases con contraste garantizado: `bg-medical-600 hover:bg-medical-700 text-white` en el botón del header.
- En el estado vacío (No hay profesionales), añadir un botón CTA visible: "Agregar primer profesional" con las mismas clases de contraste, que abra el mismo modal de creación.

### 6.3 Soberanía

- Todas las consultas y escrituras sobre `professionals` deben usar `tenant_id` (GET ya lo hace; POST debe incluirlo).
- No ejecutar SQL directo desde la spec; los cambios se implementan en código y, si hace falta migración, se documenta para el usuario.

## 7. Referencias

- AGENTS.md: Regla de Soberanía (tenant_id en todas las consultas).
- Tools del agente: `check_availability`, `book_appointment` (orchestrator_service, lectura de `professionals` y `working_hours`).
