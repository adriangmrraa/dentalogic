# 📝 Specification: Mobile Agenda Scroll Isolation Fix

## 1. Contexto y Problema

### El Fallo de Layout
En la `AgendaView`, el contenedor principal tiene `h-screen overflow-hidden`. 
- El header tiene un tamaño dinámico pero considerable.
- En móvil, se renderiza la `MobileAgenda`.
- La `MobileAgenda` tiene `h-full`, lo que significa que intenta tomar el 100% de la altura de la pantalla *además* de lo que ya ocupa el header.
- El resultado es que la parte inferior de la lista de turnos queda fuera de la pantalla y el `overflow-hidden` del padre impide llegar hasta allí mediante scroll.

### Requisito: Scroll Isolation
Siguiendo los estándares de "Sovereign Glass", el scroll no debe ser global del body, sino interno del contenedor de datos. El contenedor `MobileAgenda` debe ocupar exactamente el *espacio restante* de la pantalla.

---

## 2. Requerimientos Técnicos

### A. Ajuste en `AgendaView.tsx`
- Envolver el renderizado condicional de la agenda en un contenedor `flex-1 min-h-0` para asegurar que el área de contenido (ya sea móbile o desktop) use solo el espacio disponible después del header.

### B. Ajuste en `MobileAgenda.tsx`
- Cambiar `h-full` por `flex-1 min-h-0`.
- Asegurar que el contenedor interno de la lista siga teniendo `flex-1 overflow-y-auto`.

---

## 3. Criterios de Aceptación (Gherkin)

### Escenario: Lista de turnos larga en móvil
- **Given** que hay 10 turnos en un día específico.
- **When** abro la agenda en móvil.
- **Then** el `DateStrip` superior debe ser visible y fijo.
- **And** la lista de turnos debe tener su propio scroll interno.
- **And** debo poder hacer scroll hasta el último turno sin que se corte el contenido.

---

## 4. Plan de Implementación

1. **AgendaView.tsx**:
    - Unificar el padding y la estructura base para mobile y desktop.
    - Aplicar `flex-1 min-h-0` al contenedor de la `MobileAgenda`.
2. **MobileAgenda.tsx**:
    - Eliminar `h-full` y aplicar `flex-1 min-h-0`.
3. **Verificación**:
    - Simular mobile con múltiples eventos y verificar que el scroll aparezca y funcione correctamente.
