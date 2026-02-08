# 📝 Specification: Mobile Agenda Visibility & Range Fetch Fix

## 1. Contexto y Problema

### Escenario
En `AgendaView.tsx`, el sistema alterna entre una vista de Desktop (FullCalendar) y una vista de Mobile (`MobileAgenda`). 

### El Error (Root Cause)
1. **Rango de Fetch Erróneo**: La función `fetchData` utiliza `calendarRef.current.getApi().view` para determinar las fechas de inicio y fin. En móvil, `FullCalendar` no se renderiza (es condicional), por lo que `calendarRef.current` es nulo. El fallback es `new Date()`, resultando en `start_date` == `end_date`, lo que devuelve 0 resultados de la API.
2. **Sincronización de Estado**: Cuando el usuario cambia la fecha en el `DateStrip` de móvil, se actualiza `selectedDate`, pero no se dispara un re-fetch de datos para ese nuevo rango.
3. **Omisión de Filtros**: `MobileAgenda` recibe `appointments` (unfiltered) en lugar de `filteredAppointments`.
4. **Falta de Bloqueos GCal**: Los bloqueos de Google Calendar no se muestran en la vista móvil.

---

## 2. Requerimientos Técnicos

### A. Lógica de Fetch Inteligente (`AgendaView.tsx`)
- Detectar si `isMobile` es activo y no hay `calendarRef`.
- Si es móvil:
    - `startDate`: `selectedDate` (o Today) - 7 días (00:00:00).
    - `endDate`: `selectedDate` (o Today) + 7 días (23:59:59).
    - Esto garantiza que al navegar por el `DateStrip`, los datos ya estén presentes o se carguen en bloques razonables.
- Añadir un `useEffect` que dispare `fetchData()` cuando `selectedDate` cambie (solo en móvil).

### B. Propagación de Datos
- Pasar `filteredAppointments` y `filteredBlocks` a `MobileAgenda`.

### C. Mejora de UI Móvil (`MobileAgenda.tsx`)
- Aceptar `googleBlocks` como prop.
- Combinar `filteredAppointments` y `filteredBlocks` en la lista diaria.
- Mostrar los bloqueos de GCal con una estética distintiva (estilo "Lock/Bloqueado").
- Asegurar que la comparación de fechas use `date-fns/startOfDay` o normalización `yyyy-MM-dd` para evitar desfases de microsegundos.

---

## 3. Criterios de Aceptación (Gherkin)

### Escenario: Carga inicial en móvil
- **Given** que estoy en un dispositivo móvil.
- **When** se monta la `AgendaView`.
- **Then** la API debe ser llamada con un rango de al menos +/- 7 días desde hoy (o el `selectedDate`).
- **And** los turnos de hoy deben ser visibles.

### Escenario: Navegación por fechas
- **Given** que estoy en el `MobileAgenda`.
- **When** selecciono el "Lunes 9" en el `DateStrip`.
- **Then** se debe disparar un fetch (si no están en cache) o los datos deben filtrarse correctamente.
- **And** la lista debe mostrar los turnos de ese día específico.

### Escenario: Visualización de bloqueos
- **Given** que hay un bloqueo de Google Calendar para un profesional.
- **When** veo ese día en el móvil.
- **Then** el bloqueo debe aparecer en la lista con el icono de candado 🔒.

---

## 4. Plan de Implementación

1. **AgendaView.tsx**:
    - Refactorizar `fetchData` para usar `selectedDate` como base de rango si el calendario no está montado o es mobile.
    - Añadir dependencia de `selectedDate` al refetch de móvil.
    - Pasar props correctas (`filteredAppointments`, `filteredBlocks`).
2. **MobileAgenda.tsx**:
    - Actualizar interfaces para aceptar bloqueos.
    - Unificar arrays para el renderizado.
    - Ajustar estilos para bloqueos.
3. **Verificación**:
    - Simular mobile en DevTools.
    - Seleccionar fecha futura con datos.
    - Verificar que `dailyAppointments` se llena y la API es llamada con el rango correcto.
