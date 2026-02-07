# 📝 Specification: Google Calendar Sync Fix

## 1. Contexto
El usuario reporta que los eventos creados directamente en Google Calendar no aparecen en el Dashboard de Dentalogic.
Actualmente, el sistema funciona con un modelo de **Sincronización Bajo Demanda**:
1. El Dashboard lee `appointments` y `google_calendar_blocks` de la base de datos local (PostgreSQL).
2. La base de datos solo se actualiza cuando se llama explícitamente a `/admin/calendar/sync`.
3. Si el usuario crea un evento en GCal y recarga la página, **no lo verá** hasta que presione "Sync Now".

## 2. Objetivos
- Lograr que los eventos de Google Calendar aparezcan en el Dashboard sin necesidad de una acción manual explícita constante "Sync Now" por parte del usuario.
- Mantener la performance de carga del Dashboard.
- Garantizar la soberanía de datos (Multi-tenant isolation).

## 3. Solución Propuesta

### 3.1. Sincronización Automática en Background
- **Frontend**: Al montar `AgendaView component`, disparar una petición **asíncrona** de sincronización (`/admin/calendar/sync`).
- **Backend**: El endpoint `/admin/calendar/sync` ya existe. Asegurarnos de que sea eficiente.
- **UX**: Mostrar un indicador de "Sincronizando..." no intrusivo (ya existe un estado `syncing`, reutilizarlo).

### 3.2. Validación de Lógica de Sincronización
- Verificar que el rango de fechas de sincronización (Actualmente `NOW` a `NOW + 30 days`) sea suficiente.
- Verificar que la lógica de mapeo `professional_id` sea robusta.

### 3.3. Manejo de Errores y Feedback
- Si la sincronización falla (ej: token vencido), el usuario debe ser notificado sutilmente pero con claridad.

## 4. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Visualización de Eventos GCal

  Scenario: Usuario abre la agenda
    Given que el profesional tiene un evento "Dentista" mañana a las 10:00 AM en su Google Calendar
    And ese evento NO está en la base de datos local de Dentalogic
    When el usuario abre la vista "Agenda"
    Then el sistema debe disparar automáticamente la sincronización en segundo plano
    And al finalizar, el evento "Dentista" debe aparecer como un bloque gris "🔒 Bloqueo GCal"
    
  Scenario: Sincronización manual
    Given que el usuario acaba de crear un evento en GCal
    When hace clic en el botón "Sync Now"
    Then el evento debe aparecer en la grilla sin recargar la página
```

## 5. Cambios Técnicos
1.  **Backend (`orchestrator_service/admin_routes.py`)**:
    -   Revisar `trigger_sync` para asegurar que maneja correctamente los Timezones.
    -   Asegurar que `gcal_service.list_events` no falle silenciosamente.
    -   Aumentar el periodo de sync si es necesario (ej: 60 días).
    -   Asegurar que el `sync` maneje la concurrencia.
    -   **Refactor `gcal_service.py`**: Eliminar la dependencia de `GOOGLE_CALENDAR_ID` (env var obsoleta) y requerir `calendar_id` como argumento obligatorio en todos los métodos.
2.  **Frontend (`AgendaView.tsx`)**:
    -   Agregar llamada a `handleSyncNow()` (silent) dentro del `useEffect` inicial.
    -   Asegurar que la UI se actualice automáticamente cuando la sincronización termine.

## 6. Seguridad y Soberanía
- La sincronización respeta el `tenant_id`.
- Solo se sincronizan profesionales activos.
- Las credenciales de Google se manejan via variables de entorno o `credentials.json` seguro.
