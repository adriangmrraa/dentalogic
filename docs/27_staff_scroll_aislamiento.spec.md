# Especificación: Aislamiento de scroll en página Staff (Aprobaciones)

## Objetivo

Garantizar que en la página Staff (`/aprobaciones`) el usuario pueda deslizar hacia abajo y ver todos los ítems (solicitudes o personal activo) tanto en desktop como en mobile. Si hay muchos ítems (p. ej. 70 profesionales), debe poder llegar hasta el último; si hay uno solo, no debe aparecer scroll innecesario.

## Situación actual

- **Vista:** `UserApprovalView.tsx` (ruta `/aprobaciones`; `/profesionales` redirige aquí).
- **Contenido:** Dos pestañas — "Requests" y "Active staff" — con listas de tarjetas (`UserCard`).
- **Problema:** El contenedor de la vista no aplica el patrón de **aislamiento de scroll** (AGENTS.md: "overflow-hidden global y overflow-y-auto interno"). El área de contenido crece sin límite y el contenedor padre en Layout tiene `overflow-hidden`, por lo que el contenido que no cabe en viewport queda recortado y no hay barra de scroll para llegar a los últimos ítems.

## Criterios de aceptación

1. **Desktop y mobile:** La lista de la pestaña activa (Requests o Active staff) tiene scroll vertical cuando el contenido supera la altura disponible; se puede llegar hasta el último ítem.
2. **Sin contenido extra:** Si hay pocos ítems (o uno solo), no aparece scroll innecesario; el área de lista solo ocupa el espacio necesario.
3. **Patrón aplicado:** La vista cumple el patrón del proyecto: contenedor raíz con altura limitada (`h-full`), `overflow-hidden` y columna flex; zona de lista con `flex-1 min-h-0 overflow-y-auto`.

## Esquema de datos / Soberanía

- Sin cambios de API ni de base de datos. Solo cambios de layout/CSS en el frontend.
- Los datos ya se obtienen por `GET /admin/users`; no se modifica el contrato.

## Implementación (resumen)

- **Archivo:** `frontend_react/src/views/UserApprovalView.tsx`.
- **Cambios:**
  1. Contenedor raíz de la vista: añadir `flex flex-col h-full min-h-0 overflow-hidden` (mantener `view active p-6` según convención del proyecto; el padding puede estar en el raíz o en un wrapper interno).
  2. Bloque superior (título + subtítulo): `shrink-0`.
  3. Tabs: `shrink-0` (y márgenes existentes).
  4. Contenedor de la lista (el `div` que envuelve el `grid gap-4` con requests/staff): `flex-1 min-h-0 overflow-y-auto` para que sea la zona que hace scroll. Opcional: un poco de padding inferior para que el último ítem no quede pegado al borde.
- Los modales (detalle de profesional, edición) ya tienen scroll aislado interno; no se modifican.

## Verificación

- Manual: entrar en `/aprobaciones`, pestaña Active staff con varios ítems; comprobar que aparece scroll y se puede llegar al último. Con un solo ítem, comprobar que no hay barra de scroll. Repetir en viewport reducido (mobile).
- No se requieren tests automatizados nuevos para este cambio de layout.
