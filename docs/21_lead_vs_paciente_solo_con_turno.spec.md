# 📝 Especificación: Lead/Contacto vs Paciente (solo con reserva)

## 1. Contexto

Hoy cualquier contacto que escribe por WhatsApp queda registrado en la tabla `patients` (vía `ensure_patient_exists` con `status='guest'`) y aparece en la lista **Pacientes** del admin. El usuario requiere que:

- **Paciente** = solo quien **ya tiene al menos un turno/reserva** (o fue dado de alta manual con turno). El historial clínico y la ficha que se muestran en la página de Chats corresponden a ese paciente.
- **Lead/Contacto** = quien solo ha interactuado por chat pero **aún no tiene reserva**. No debe figurar en la lista "Pacientes"; solo en Conversaciones como contacto.

Ejemplo: "Hector Adrian Gamarra" (+5493704868421) aparece en Pacientes con fecha de alta 8/2/2026 pero nunca agendó; debe dejar de aparecer en Pacientes y tratarse solo como contacto/lead hasta que reserve.

## 2. Objetivos

1. **Listado Pacientes**: Mostrar únicamente contactos que tienen **al menos un turno** (appointment) en el tenant. Quienes solo chatearon (guest sin turnos) no se listan.
2. **Conversaciones**: Seguir mostrando todos los que tienen mensajes (leads y pacientes), sin depender de si tienen o no turno.
3. **Ficha en Chats**: Si el contacto no tiene turnos, mostrar estado "Contacto / Lead" y no historial clínico/turnos; cuando tiene al menos un turno, mostrar ficha de paciente con historial.

## 3. Entradas y salidas

| Entrada | Origen | Salida / Efecto |
|--------|--------|------------------|
| Mensaje WhatsApp (primera vez) | main.py chat handler | Se sigue creando/actualizando fila en `patients` con `status='guest'` para poder listar la conversación y guardar handoff; **no** se considera "paciente" para el listado. |
| book_appointment (IA) | Tool en main.py | Crea o actualiza paciente y pone `status='active'`; inserta appointment. A partir de ahí el contacto es "paciente" y debe aparecer en listado. |
| Alta manual desde Admin | POST /admin/patients (+ opcional turno) | Crea paciente; si se crea con turno inicial, cumple criterio; si no, se puede definir que solo aparezca cuando tenga al menos un turno (mismo criterio). |
| GET /admin/patients | Listado Pacientes | Devolver solo filas con **al menos un appointment** para ese tenant (y status != 'deleted'). |
| Sesiones de chat | GET /admin/.../sessions | Sin cambio: se siguen listando por `patients` que tienen mensajes (incluye guests); o por `chat_messages` si se migra a "conversaciones por teléfono". |

## 4. Definición "Paciente" para el listado

- **Criterio único para aparecer en Pacientes:**  
  `EXISTS (SELECT 1 FROM appointments WHERE patient_id = patients.id AND tenant_id = patients.tenant_id)`  
  (y `status != 'deleted'`).
- Los que solo tienen conversación (guest, sin appointments) **no** se incluyen en GET /admin/patients.
- Soberanía: todo filtrado por `tenant_id` del contexto (get_resolved_tenant_id).

## 5. Criterios de aceptación (Gherkin)

```gherkin
Feature: Lead vs Paciente

  Scenario: Contacto sin turno no aparece en Pacientes
    Given un contacto con teléfono +5493704868421 que solo ha chateado por WhatsApp
    And no tiene ningún turno en appointments
    When el usuario abre la página Pacientes
    Then ese contacto NO debe aparecer en la lista

  Scenario: Contacto con al menos un turno sí aparece en Pacientes
    Given un contacto con al menos un appointment (status scheduled/confirmed/completed) en el tenant
    When el usuario abre la página Pacientes
    Then ese contacto debe aparecer en la lista con sus datos

  Scenario: Ficha en Chats para lead
    Given un contacto que solo tiene mensajes y ningún turno
    When el usuario abre la conversación en Chats
    Then la ficha debe indicar "Contacto" o "Sin turnos" y no mostrar historial clínico como paciente

  Scenario: Ficha en Chats para paciente
    Given un contacto que tiene al menos un turno
    When el usuario abre la conversación en Chats
    Then la ficha debe mostrar historial (turnos, notas clínicas) como paciente
```

## 6. Cambios técnicos

### 6.1 Backend

- **GET /admin/patients** (`list_patients` en admin_routes.py):  
  Añadir condición: solo filas donde exista al menos un appointment para ese `patient_id` y `tenant_id`.  
  Ejemplo:  
  `AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = patients.id AND a.tenant_id = patients.tenant_id)`  
  Mantener filtro `tenant_id = $1` y `status != 'deleted'`.

- **Conversaciones/sessions**: Sin cambio en esta fase (siguen partiendo de `patients` con mensajes; los guests siguen existiendo en BD para poder listar la conversación y handoff).

- **Ficha de paciente por teléfono/patient_id**: Si existe endpoint que devuelve "patient + historial", opcionalmente incluir indicador `has_appointments` o que el frontend consulte turnos y muestre "Contacto" cuando la lista de turnos esté vacía.

### 6.2 Frontend

- **PatientsView**: No requiere cambio de contrato; solo dejará de recibir a los que no tienen turnos (Hector dejará de aparecer).
- **ChatsView / ficha del paciente**: Si la ficha se arma con datos de paciente + turnos/historial, mostrar estado "Contacto - Sin turnos" cuando no haya appointments y no mostrar bloque de historial clínico hasta que tenga al menos un turno.

### 6.3 Soberanía

- Todas las queries siguen usando `tenant_id` del contexto (get_resolved_tenant_id / tenant del JWT).  
- No ejecutar SQL directo desde la spec; los cambios se implementan en código.

## 7. Alternativa (no implementada en esta fase)

- **Solo crear paciente al reservar**: No llamar `ensure_patient_exists` en el primer mensaje; guardar conversaciones por `from_number` + `tenant_id` y listar sesiones desde `chat_messages`. Crear fila en `patients` solo en `book_appointment` (o alta manual). Requiere nueva fuente para la lista de conversaciones (por teléfono) y posible tabla o columnas para handoff por (tenant_id, phone). Se deja para una fase posterior si se desea eliminar por completo la existencia de "guest" en `patients`.

## 8. Referencias

- AGENTS.md: Regla de Soberanía (tenant_id en todas las consultas).
- `db.ensure_patient_exists`: creación/actualización guest en primer mensaje.
- `main.py` book_appointment: creación/actualización a active y primer turno.
- `admin_routes.py` list_patients: actual filtro solo por tenant y status != 'deleted'.
