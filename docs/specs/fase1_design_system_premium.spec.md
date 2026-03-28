# SPEC: Design System Premium (UI Foundation)

**Fase:** 1 - Fundación
**Prioridad:** CRÍTICA (bloquea todas las demás fases)
**Origen:** Replicación de ClinicForge UI Premium
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

Dentalogic actualmente usa un tema claro con glassmorphism básico. ClinicForge implementa un **dark theme premium completo** con un sistema de diseño glassmórfico sofisticado. Esta fase migra todo el design system para que Dentalogic tenga la misma calidad visual.

### Problema que resuelve
- UI inconsistente y sin identidad premium
- Falta de animaciones y microinteracciones que den sensación de calidad
- Componentes visuales básicos sin el nivel de pulido de ClinicForge

---

## 2. Requerimientos Técnicos

### 2.1 GlassCard Component (`src/components/GlassCard.tsx`)

**Descripción:** Componente base reutilizable para todas las superficies de tarjeta.

**Props:**
```typescript
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  backgroundImage?: string;
  hover?: boolean;        // default true
  onClick?: () => void;
  padding?: 'sm' | 'md' | 'lg'; // default 'md'
}
```

**Estructura visual (capas):**
1. Background image (opacity 0.03, hover → 0.08)
2. Gradient overlay (`bg-gradient-to-br from-white/[0.03] to-transparent`)
3. Content layer

**Efectos hover:**
- Scale: `1.0 → 1.015` con spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)`
- Shadow elevation: `shadow-lg → shadow-xl`
- Image opacity: `0.03 → 0.08`
- Blue glow edge: `border-blue-500/20`
- Ken Burns zoom: imagen de fondo `scale(1.02) → scale(1.1)` en 8s

**Mobile:**
- Touch: `scale(0.98)` feedback instantáneo
- Hover delay: 500ms en dispositivos táctiles

### 2.2 Dark Theme Glassmorphic (`index.css` + `tailwind.config.js`)

**Paleta de fondos (jerarquía):**
| Nivel | Uso | Color |
|-------|-----|-------|
| 0 (Root) | `body`, `html` | `#06060e` |
| 1 (Pages) | Contenido de página | `#0a0e1a` |
| 2 (Modals) | Diálogos elevados | `#0d1117` |
| 3 (Glass) | Superficies glass | `rgba(255,255,255, 0.02-0.08)` |

**Escala de opacidad glass (Tailwind):**
| Opacidad | Uso |
|----------|-----|
| `bg-white/[0.02]` | Empty states apenas visibles |
| `bg-white/[0.03]` | Superficies primarias (cards) |
| `bg-white/[0.04]` | Inputs, form controls |
| `bg-white/[0.06]` | Hover states, badges |
| `bg-white/[0.08]` | Active/selected states |
| `bg-white/[0.10]+` | Emphasis fuerte |

**Escala de texto (opacidad sobre blanco):**
| Opacidad | Uso |
|----------|-----|
| `text-white` (1.0) | Headings, datos primarios |
| `text-white/85` | Nav items activos |
| `text-white/70` | Body text, botones secundarios |
| `text-white/50` | Labels, subtítulos |
| `text-white/40` | Descripciones, timestamps |
| `text-white/30` | Placeholders, dividers |
| `text-white/20` | Iconos de empty states |

**Escala de bordes:**
| Opacidad | Uso |
|----------|-----|
| `border-white/[0.04]` | Dividers internos |
| `border-white/[0.06]` | Bordes de cards |
| `border-white/[0.08]` | Inputs, modales |
| `border-white/[0.10]` | Botones |
| `border-white/[0.12]` | Active/selected |
| `border-white/[0.15-0.20]` | Emphasis fuerte |

**Colores semánticos:**
```css
Success: bg-green-500/10 + text-green-400 + border-green-500/20
Warning: bg-yellow-500/10 + text-yellow-400 + border-yellow-500/20
Danger:  bg-red-500/10 + text-red-400 + border-red-500/20
Info:    bg-blue-500/10 + text-blue-400 + border-blue-500/20
Emerald: bg-emerald-500/10 + text-emerald-400 (positivo)
Amber:   bg-amber-500/10 + text-amber-400 (tips)
Violet:  bg-violet-500/10 + text-violet-400 (Nova/AI)
```

### 2.3 Animaciones Premium (`index.css`)

**Animaciones de interacción (0.2-0.4s):**

```css
/* 1. fadeIn - reveal con opacidad */
@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }

/* 2. slideUp - vertical + fade (alertas, success) */
@keyframes slideUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }

/* 3. slideIn - horizontal desde derecha (toasts) */
@keyframes slideIn { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }

/* 4. modalIn - scale + translate con spring */
@keyframes modalIn { from { opacity:0; transform:scale(0.95) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }

/* 5. cardSlideLeft/Right - transiciones de pasos */
@keyframes cardSlideLeft { from { opacity:0; transform:translateX(-20px) } to { opacity:1; transform:translateX(0) } }
@keyframes cardSlideRight { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }

/* 6. toothPop - bounce para odontograma */
@keyframes toothPop { 0% { transform:scale(0.8) } 50% { transform:scale(1.1) } 100% { transform:scale(1) } }

/* 7. tooltipIn - popup con bounce */
@keyframes tooltipIn { 0% { opacity:0; transform:scale(0.8) translateY(5px) } 60% { transform:scale(1.05) translateY(-2px) } 100% { opacity:1; transform:scale(1) translateY(0) } }
```

**Animaciones ambient (looping):**

```css
/* guideWobble - botón de ayuda (6s infinite) */
@keyframes guideWobble { 0%{transform:scale(1) rotate(0)} 10%{transform:scale(1.15) rotate(-5deg)} 20%{transform:scale(1.1) rotate(3deg) translateY(-2px)} 30%{transform:scale(1.05) rotate(-2deg)} 40%{transform:scale(1)} 100%{transform:scale(1)} }

/* novaWobble - botón Nova más pronunciado (5s infinite) */
@keyframes novaWobble { 0%{transform:scale(1)} 10%{transform:scale(1.2) rotate(-8deg)} 20%{transform:scale(1.15) rotate(5deg) translateY(-3px)} 30%{transform:scale(1.08) rotate(-3deg)} 40%{transform:scale(1)} 100%{transform:scale(1)} }

/* guidePing/novaPing - radar pulse (3s infinite) */
@keyframes guidePing { 0%{transform:scale(1); opacity:0.5} 100%{transform:scale(2); opacity:0} }

/* pulseGlow - glow en botón save (2s infinite) */
@keyframes pulseGlow { 0%,100%{box-shadow:0 0 5px rgba(59,130,246,0.3)} 50%{box-shadow:0 0 20px rgba(59,130,246,0.6)} }

/* ken-burns - zoom de fondo (8s infinite alternate) */
@keyframes ken-burns { from{transform:scale(1.02)} to{transform:scale(1.1)} }
```

**Easing functions:**
- Standard: `ease-out`
- Spring: `cubic-bezier(0.34, 1.56, 0.64, 1)` — overshoot bounce
- Smooth spring: `cubic-bezier(0.16, 1, 0.3, 1)` — modales/tooltips
- Linear: `linear` — rotación continua

### 2.4 Botones (variantes)

```
Primary:   bg-white text-gray-900 hover:scale-110 active:scale-90
Secondary: bg-white/[0.06] border-white/[0.10] text-white/70 hover:scale-105
Ghost:     bg-transparent text-white/70 hover:bg-white/[0.04]
Danger:    bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20
```

### 2.5 Inputs (patrón glass)

```
bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30
focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20
transition-all duration-200
```

### 2.6 Scrollbar Custom

```css
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: #0a0e1a; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
```

### 2.7 Sidebar Enhancement

**Actualizar `Sidebar.tsx` existente:**
- Background images contextuales por item de menú (hover)
- Active item: left blue bar 2px + scale 1.03 + brighter bg
- Hover: scale 1.03 con blue gradient edge
- Collapsed mode: tooltips a la derecha con fade-in
- Mobile: overlay full-width desde izquierda con backdrop blur

### 2.8 tailwind.config.js Updates

```javascript
// Agregar al extend:
animation: {
  'fade-in': 'fadeIn 0.3s ease-out',
  'slide-up': 'slideUp 0.3s ease-out',
  'slide-in': 'slideIn 0.3s ease-out',
  'modal-in': 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
  'tooth-pop': 'toothPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  'tooltip-in': 'tooltipIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  'pulse-soft': 'pulseGlow 2s ease-in-out infinite',
  'guide-wobble': 'guideWobble 6s ease-in-out infinite',
  'nova-wobble': 'novaWobble 5s ease-in-out infinite',
  'guide-ping': 'guidePing 3s ease-out infinite',
  'nova-ping': 'novaPing 3s ease-out infinite',
  'ken-burns': 'ken-burns 8s ease-in-out infinite alternate',
},
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
}
```

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Design System Premium

  Scenario: GlassCard renderiza correctamente
    Given un componente GlassCard con children
    When se renderiza en el DOM
    Then muestra fondo glass bg-white/[0.03] con borde border-white/[0.06]
    And tiene border-radius rounded-2xl
    And al hacer hover escala a 1.015 con spring easing

  Scenario: Dark theme aplicado globalmente
    Given la aplicación cargada
    When el body se renderiza
    Then el background es #06060e
    And todo el texto usa escala de opacidad sobre blanco
    And no hay backgrounds blancos/claros en ninguna superficie

  Scenario: Animaciones funcionan en mobile
    Given un dispositivo táctil
    When el usuario toca un GlassCard
    Then muestra scale(0.98) como feedback táctil
    And no hay delay de 300ms en iOS

  Scenario: Sidebar premium funcional
    Given la sidebar renderizada
    When el usuario pasa hover sobre un item
    Then el item escala a 1.03
    And muestra blue gradient edge
    And el item activo tiene barra azul izquierda de 2px

  Scenario: Scrollbar estilizado
    Given contenido que excede el viewport
    When aparece el scrollbar
    Then el thumb es rgba(255,255,255,0.1) con border-radius 4px
    And el track es #0a0e1a
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/components/GlassCard.tsx` | Componente glass card premium |
| MODIFICAR | `src/index.css` | Agregar todas las animaciones + scrollbar + dark theme base |
| MODIFICAR | `tailwind.config.js` | Agregar animations, fonts, colores extendidos |
| MODIFICAR | `src/components/Sidebar.tsx` | Upgrade a versión premium con hover images |
| MODIFICAR | `src/components/Layout.tsx` | Dark theme en contenedor principal |
| MODIFICAR | `src/components/Modal.tsx` | Aplicar glass styling al modal |
| MODIFICAR | `src/components/PageHeader.tsx` | Aplicar text opacity scale |
| MODIFICAR | Todas las views | Migrar de tema claro a dark glassmorphic |

---

## 5. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Romper UI existente al cambiar theme | Alto | Migrar vista por vista, no global de golpe |
| Performance de animaciones en mobile | Medio | Usar transform/opacity (GPU), evitar layout triggers |
| Contraste insuficiente en dark theme | Medio | Validar ratios WCAG 4.5:1 mínimo para texto |
| Fonts no cargando (Inter, Outfit) | Bajo | Fallback a system-ui en font stack |

---

## 6. Checkpoint de Soberanía
- N/A para esta fase (es puramente UI, no maneja datos)

## 7. Checkpoint de UI
- Aplicar Scroll Isolation: `overflow-hidden` en contenedor padre Layout, `min-h-0` en área de contenido
- Todas las superficies deben usar GlassCard o el patrón glass manual
- Ningún `bg-white` o `bg-gray-*` claro debe sobrevivir la migración
