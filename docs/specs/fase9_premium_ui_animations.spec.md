# SPEC: Premium UI Animations & Dynamic Layout
**Fase:** 9 - Premium UI Animations
**Prioridad:** ALTA
**Bloqueado por:** Fase 1 (Design System Premium)
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos
El objetivo principal de esta fase es dotar a Dentalogic de una UI verdaderamente impactante, igualando o superando la experiencia de `app.dralauradelgado.com`. 
Se busca lograr que las secciones de la Landing Page y Onboarding tengan animaciones fluidas, donde "las imágenes aparecen y desaparecen", utilizando scroll dinámico.

---

## 2. Requerimientos Técnicos

### 2.1 Intersection Observers & Scroll Animations 
- Implementar un Hook global `useSmartScroll` o utilizar `Framer Motion` (a definir) para manejar la entrada y salida de elementos.
- Las `GlassCard` y las previsualizaciones de producto deben aparecer iterativamente con `fadeInUp` o `scaleUp` según el nivel de scroll.

### 2.2 Componente "Dynamic Feature Showcase"
- Un componente donde el texto en la izquierda permanece fijo (sticky) mientras en la parte derecha las imágenes del producto hacen transiciones (aparecen y desaparecen) al hacer scroll.

### 2.3 Refactor de la Landing Pública
- Incorporar los nuevos componentes dinámicos en las vistas públicas expuestas por Dentalogic para los dueños de clínicas.

---

## 3. Archivos a Crear/Modificar
| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/hooks/useSmartScroll.ts` | Hook para observer de visibilidad |
| CREAR | `src/components/public/DynamicShowcase.tsx` | Sección sticky con imágenes que rotan |
| MODIFICAR | `src/views/LandingView.tsx` | Layout dinámico de la home |
| MODIFICAR | `tailwind.config.js` | Agregar keyframes de entrada/salida personalizados |

---

## Clarificaciones Resueltas
- **Animaciones**: Se utilizará `framer-motion` por ahora para lograr los efectos premium rápidamente y luego se optimizará.
- **Imágenes Placeholder**: Se usarán placeholders genéricos elegantes.
