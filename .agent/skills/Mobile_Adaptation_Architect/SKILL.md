---
name: "Mobile_Adaptation_Architect"
description: "Especialista en la transformación de interfaces Desktop a Mobile siguiendo el estándar premium de Nexus. Asegura vistas funcionales sin regresiones en escritorio."
trigger: "adaptar mobile, responsivo, vista celular, mobile layout, responsive fix, romper desktop"
scope: "FRONTEND"
auto-invoke: true
---

# 📱 Mobile Adaptation Architect - Nexus v7.6

## 1. Concepto: La Estrategia de Adaptación "Zero-Regresion"

### Filosofía
El objetivo NO es crear una aplicación móvil separada, sino hacer que la web sea camaleónica. 
- **Eje Horizontal -> Vertical**: Las grillas se convierten en pilas (stacks).
- **Acciones Flotantes**: Los botones secundarios se ocultan en menús o drawers.
- **Micro-interacciones**: El `hover` se reemplaza por estados `:active` táctiles.

### Arquitectura de Breakpoints
Utilizamos la escala estándar de Tailwind pero con enfoque en Nexus:
- **Default (< 768px)**: Mobile (Stacking total).
- **`md:` (768px - 1024px)**: Tablet (2 columns).
- **`lg:` (> 1024px)**: Desktop (Original Premium Layout).

## 2. Patrones de Diseño Nexus Mobile

### A. Grillas a Stacks
```tsx
// ❌ EVITAR: Anchos fijos o h-screen
// ✅ USAR: grid-cols-1 y lg:grid-cols-N
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  <div className="lg:col-span-8">Contenido Principal</div>
  <div className="lg:col-span-4">Lateral (ahora abajo en mobile)</div>
</div>
```

### B. Safe Areas & Viewports
Usar `dvh` (Dynamic Viewport Height) para evitar que las barras de navegación de iOS/Android tapen el contenido.
```tsx
<div className="min-h-dvh flex flex-col">...</div>
```

### C. Drawer vs Modal
- **Desktop**: Modales centrados con `max-w-*`.
- **Mobile**: Cambiar a `fixed inset-x-0 bottom-0 rounded-t-3xl` para una sensación de "Bottom Sheet".

## 3. Implementation Checklist

- [ ] **Overflow Check**: Añadir `overflow-x-hidden` al contenedor raíz.
- [ ] **Touch Targets**: Todos los botones interactivos >= 11px de padding (44px total).
- [ ] **Font Auto-Scaling**: Usar `text-sm lg:text-base` para mantener legibilidad.
- [ ] **Conditional Rendering**: Usar `hidden lg:block` para elementos que solo aportan ruido en celular (ej: decoraciones grandes).

## 4. Troubleshooting (Causa -> Solución)

- **Scroll Horizontal**: Causa: Un elemento tiene un `min-width` mayor a 375px. Solución: Usar `w-full` o `max-w-full`.
- **Botones Invisibles**: Causa: `fixed` mal posicionado sin considerar safe-areas. Solución: Añadir `pb-[env(safe-area-inset-bottom)]`.
- **Desktop Roto**: Causa: Modificar clases base sin el prefijo `lg:`. Solución: Mantener la clase original para mobile y añadir el prefijo para desktop.

## 5. Security & UI Privacy
En mobile, el teclado puede desplazar modales. Asegurar que los botones de "Guardar" siempre sean `sticky` en la parte inferior del modal visible.

---
*Nexus v7.6 - Mobile Standards Protocol*
