# Especificación: Modal Datos del Profesional – Layout y acordeón con datos reales

**Fecha:** 2026-02-08  
**Estado:** Vigente  
**Relación:** Complementa `22_professionals_ceo_control_vision.spec.md`.

## 1. Objetivo

1. **Layout:** El modal "Datos del profesional" (que se abre al hacer clic en la tarjeta del profesional en Personal Activo) debe mostrar todo el contenido sin sensación de "encimado": tamaño suficiente, scroll interno controlado y secciones bien separadas.
2. **Acordeón:** Las tres secciones que hoy muestran "(próximamente)" pasan a ser **acordeones**: al hacer clic en cada una se expande y se muestra **información real** del profesional (datos desde backend), no placeholders.

## 2. Entradas y salidas

### 2.1 Modal (origen de datos)

- **Entrada:** Usuario seleccionado (`selectedStaff`) y filas de `professionals` del usuario (`professionalRows`) ya cargadas con `GET /admin/professionals/by-user/:user_id`.
- **Contenido fijo:** Cabecera (rol, email, miembro desde), botón "Vincular a sede/otra sede", lista "Sedes asignadas".

### 2.2 Sección "Sus pacientes" (acordeón)

- **Entrada:** Al expandir, se necesita `professional_id` y `tenant_id` (de cada fila en `professionalRows`).
- **Backend:** Métricas por profesional en un rango de fechas (p. ej. mes actual). Se reutiliza la lógica de analíticas por profesional.
- **Salida mostrada:** Número de pacientes únicos atendidos, total de turnos en el período, tasa de finalización, tasa de retención (opcional). Por sede si hay varias.

### 2.3 Sección "Uso de la plataforma" (acordeón)

- **Entrada:** Mismo `professional_id` y `tenant_id`.
- **Backend:** Mismas métricas que "Sus pacientes" más tags estratégicos (High Performance, Risk: Cancellations, etc.) si existen.
- **Salida mostrada:** Turnos completados, cancelados, ingresos estimados (si aplica), tags. Por sede si hay varias.

### 2.4 Sección "Mensajes e interacciones" (acordeón)

- **Entrada:** `tenant_id` de las sedes asignadas al profesional.
- **Backend:** Conteo de conversaciones (sesiones de chat) por sede, o mensajes asociados al tenant.
- **Salida mostrada:** Número de conversaciones activas/recientes en la sede (o mensaje "En esta sede no hay datos de chat aún"). Enlace futuro a listado de chats filtrado por sede.

## 3. Criterios de aceptación

- El modal de detalle del profesional tiene **tamaño generoso** (p. ej. `max-w-6xl`, `max-h-[92vh]`) y **scroll solo en la zona de contenido**, de modo que cabecera y botones no queden encimados.
- Las tres secciones (Sus pacientes, Uso de la plataforma, Mensajes e interacciones) se muestran como **acordeón**: un solo ítem expandido a la vez (o todos expandibles según diseño), con icono que indica abierto/cerrado.
- Al **expandir** cada ítem se realiza una petición al backend (si hace falta) y se muestra **información real** (números, tasas, tags), no el texto "(próximamente)".
- Soberanía: todas las peticiones usan `tenant_id` del profesional/sede; solo se muestran datos de sedes a las que el CEO tiene acceso.

## 4. Endpoints implicados

- **Existente:** `GET /admin/professionals/by-user/:user_id` (datos del profesional y sedes).
- **Nuevo o ampliado:** Un endpoint que devuelva métricas de **un** profesional para un tenant y rango de fechas, por ejemplo:
  - `GET /admin/professionals/:id/analytics?tenant_id=1&start_date=...&end_date=...`
  - Respuesta: `{ id, name, specialty, metrics: { total_appointments, unique_patients, completion_rate, cancellation_rate, revenue, retention_rate }, tags }`.
- **Existente:** `GET /admin/chat/sessions?tenant_id=` para contar conversaciones por sede (número de sesiones = "conversaciones").

## 5. Referencias

- AGENTS.md: Regla de Soberanía.
- docs/22_professionals_ceo_control_vision.spec.md: flujo Personal Activo y modal detalle.
