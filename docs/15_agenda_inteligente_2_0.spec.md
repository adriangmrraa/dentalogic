# 📝 Specification: Agenda Inteligente 2.0 (Sovereign & Adaptive)

## 1. Contexto y Objetivos
La "Agenda Inteligente 2.0" es la evolución crítica del módulo de citas de Dentalogic. El objetivo es migrar de una gestión manual y desconectada a una experiencia en tiempo real, multi-dispositivo y soberana.

**Drivers del Cambio:**
*   **Soberanía de Datos:** Eliminación de credenciales globales compartidas (`GOOGLE_CALENDAR_ID`) para garantizar aislamiento multi-tenant.
*   **Fricción Operativa:** Eliminación del botón "Sync" manual. La agenda debe estar siempre actualizada.
*   **Movilidad:** El profesional moderno gestiona su clínica desde el móvil. La UI debe ser nativamente responsiva.

---

## 2. Requerimientos Técnicos (Sovereign Architecture)

### 2.1 Backend: Refactorización Sovereign GCal
El servicio `orchestrator_service/gcal_service.py` debe ser reescrito para eliminar cualquier dependencia de variables de entorno globales para la identidad del calendario.

*   **Nuevo Contrato:** Todos los métodos (`list_events`, `create_event`, `delete_event`) deben aceptar obligatoriamente `calendar_id: str` como argumento.
*   **Origen del Dato:** El `calendar_id` debe obtenerse dinámicamente de la tabla `users` (columna `google_calendar_id`) o `professionals`, filtrado siempre por `tenant_id`.
*   **Validación:** Si `calendar_id` es nulo, el servicio debe retornar una lista vacía o error controlado, nunca fallar o usar un default global.

### 2.2 Frontend: Sincronización Silenciosa (JIT v2)
La sincronización debe ser transparente para el usuario.

*   **Trigger:** Al montar `AgendaView.tsx` (`useEffect`), disparar `/admin/calendar/sync`.
*   **Feedback:** Mostrar indicador de carga "Sincronizando..." no bloqueante (toast o spinner en topbar).
*   **Optimistic UI:** La agenda debe mostrar los datos locales inmediatamente (`appointments`), y luego "hidratar" los bloqueos de GCal cuando la sync termine.

### 2.3 UI/UX: Mobile-First & Scroll Isolation
El layout debe adaptarse radicalmente según el dispositivo, respetando la regla "Una cosa abajo de la otra".

*   **Mobile (<768px):**
    *   Vista: **Lista Vertical** (FullCalendar `listDay` o custom view).
    *   Modales: Pantalla completa o Sheet inferiror.
    *   Acciones: Botones "Guardar/Cancelar" **Sticky Bottom** (siempre visibles).
    *   Touch Targets: Mínimo **44px** para todo elemento interactivo.
*   **Scroll Isolation:**
    *   Contenedor Principal: `h-screen overflow-hidden`.
    *   Área de Agenda: `flex-1 min-h-0 overflow-y-auto`.
    *   **Prohibido:** Scroll en el `body` o `html`.

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Agenda Multi-tenant Soberana

  Scenario: Carga de Agenda en Mobile
    Given soy el Dr. Juan (tenant_id: 101) accediendo desde un iPhone
    When entro a la sección "Agenda"
    Then la vista debe ser una Lista Vertical de turnos
    And NO debe haber scroll horizontal en la página
    And debe aparecer un indicador "Sincronizando..." discreto
    And al terminar, los eventos de mi GCal personal deben aparecer bloqueados

  Scenario: Validación de Aislamiento de Datos
    Given existen dos profesionales, Dra. Lopez (tenant A) y Dr. Perez (tenant B)
    When el sistema sincroniza la agenda de la Dra. Lopez
    Then el servicio GCal debe usar EXCLUSIVAMENTE el calendar_id de la Dra. Lopez
    And NO debe intentar acceder al calendario del Dr. Perez
    And si la Dra. Lopez no tiene calendar_id configurado, la sync debe terminar sin errores

  Scenario: Edición de Turno con Scroll Largo
    Given estoy editando un turno con mucha historia clínica (modal largo)
    When hago scroll hacia abajo en el modal
    Then los botones "Guardar" y "Cancelar" deben permanecer FIJOS en la parte inferior
    And deben ser fáciles de tocar (altura > 44px)
```

## 4. Plan de Implementación (Estrategia SDD)

1.  **Backend Core**:
    *   Modificar `gcal_service.py`: Remover `os.getenv`. Agregar `calendar_id` a firmas.
    *   Actualizar `admin_routes.py`: Inyectar `calendar_id` al llamar al servicio.
2.  **Frontend Logic**:
    *   Actualizar `AgendaView.tsx`: Implementar `useEffect` para sync silencioso.
3.  **Frontend UI**:
    *   Refactorizar CSS de `Layout.tsx` para garantizar `min-h-0`.
    *   Configurar FullCalendar para cambio dinámico de vistas (List vs TimeGrid).
    *   Implementar clases utilitarias para Sticky Footer en modales.

## 5. Riesgos y Mitigación
*   **Riesgo:** Latencia de GCal API ralentiza la carga.
    *   *Mitigación:* Carga asíncrona. La UI no espera a GCal para mostrar turnos locales.
*   **Riesgo:** Token de GCal expirado.
    *   *Mitigación:* Captura de excepciones en backend y notificación "Reconectar GCal" en frontend.

---
*Dentalogic Specification v2.0 - Powered by Antigravity*
