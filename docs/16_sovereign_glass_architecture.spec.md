# 📝 Specification: Sovereign Glass Architecture - Agenda 2.0

## 1. Contexto y Objetivos

### Problema
El diseño actual de AgendaView.tsx y Layout.tsx presenta carencias en la arquitectura visual:
- **Estética Genérica**: El calendario se ve como un simple cuadro blanco sin identidad premium
- **Scroll Fragmentado**: No hay aislamiento estricto entre el scroll del layout y el contenido
- **Tipografía Básica**: Se usan colores y fuentes genéricas que no transmiten profesionalismo
- **Background Monótono**: Fondo gris plano sin gradientes modernos

### Solución
Implementar el patrón **"Sovereign Glass"** que combina:
1. **Scroll Isolation**: Contenedores con `h-screen overflow-hidden` + flex hierarchy + `min-h-0`
2. **Glassmorphism**: Superficies flotantes con `backdrop-blur-2xl` y transparencias
3. **Premium Typography**: Inter/Geist Sans con `tracking-tight` y colores slate modernos
4. **Gradient Backgrounds**: Transiciones suaves de `from-slate-50 to-blue-50`

### KPIs
- ✅ **Percepción Visual**: El cliente debe decir "wow" al abrir la agenda
- ✅ **Zero Global Scroll**: El sidebar/topbar nunca deben moverse con el contenido
- ✅ **Mobile Perfecto**: Experiencia fluida en iPhone SE (375px) con scroll independiente.
- ✅ **Nested Scroll Isolation**: El uso de `min-h-0` en hijos `flex-1` es obligatorio para que el scroll se propague correctamente en navegadores móviles.

---

## 2. Esquemas de Datos

### Input (Props/State)
No hay cambios en interfaces TypeScript. Esta refactorización es 100% visual (CSS/Tailwind).

### Output (Visual Contract)
```typescript
interface VisualContract {
  rootContainer: {
    height: "h-screen";
    overflow: "overflow-hidden";
    background: "bg-gradient-to-br from-slate-50 to-blue-50";
  };
  
  contentArea: {
    flex: "flex-1";
    minHeight: "min-h-0";
    overflow: "overflow-hidden";
  };
  
  calendarGlass: {
    background: "bg-white/60";
    backdropFilter: "backdrop-blur-2xl";
    border: "border border-white/40";
    shadow: "shadow-2xl";
    borderRadius: "rounded-3xl";
    margin: "m-4";
  };
  
  typography: {
    fontFamily: "font-['Inter']" | "font-['Geist_Sans']";
    headers: "text-slate-800 font-bold tracking-tight";
  };
}
```

---

## 3. Lógica de Negocio (Invariantes)

### Regla 1: Scroll Isolation (Mandatory)
- **SI** el usuario hace scroll en la agenda **ENTONCES** solo el contenido del calendario se mueve
- **NUNCA** el sidebar, topbar o root layout deben scrollear
- **MANDATORIO**: Todo hijo directo de un contenedor `flex-1` que pretenda scrollear debe tener `min-h-0` (para Chrome/Safari behavior).

### Regla 2: Glassmorphism Hierarchy
- **SOLO** el contenedor del calendario debe tener glassmorphism
- **NO** aplicar backdrop-blur a elementos hijos (performance)

### Regla 3: Typography Cascade
- **TODAS** las fuentes deben heredar de `font-['Inter']` definido en el root
- **HEADERS** (h1, h2) deben usar `text-slate-800 font-bold tracking-tight`
- **BODY** debe usar `text-slate-600`

### Regla 4: Responsive Glass
- **Mobile (<768px)**: Reducir blur a `backdrop-blur-lg` y bordes a `rounded-2xl` para performance
- **Desktop (>=768px)**: Full glassmorphism con `backdrop-blur-2xl` y `rounded-3xl`

---

## 4. Stack y Restricciones

### Tecnología
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS v3.x (Utility-First estricto)
- **Icons**: Lucide React (ya en uso)
- **Fonts**: Google Fonts - Inter (Primary) o Geist Sans (Fallback)

### Restricciones Arquitectónicas
1. **Zero Inline Styles**: Todo debe ser Tailwind classes
2. **No New Dependencies**: No instalar librerías adicionales
3. **Backward Compatibility**: Mantener toda la lógica funcional (WebSocket, sync, CRUD)
4. **Mobile First**: Diseñar para 375px primero, escalar hacia desktop

### Soberanía
Esta refactorización es **visual-only** y NO afecta la capa de datos. El multi-tenancy ya está garantizado en la lógica de filtrado y NO requiere cambios.

---

## 5. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Sovereign Glass Visual Architecture

  Scenario: Scroll Isolation Validation
    Given estoy en la vista de Agenda (AgendaView.tsx)
    When hago scroll hacia abajo en el calendario
    Then solo el contenido del calendario debe moverse
    And el Sidebar debe permanecer fijo en su posición
    And el Topbar debe permanecer fijo en la parte superior
    And NO debe aparecer scrollbar en el body del navegador

  Scenario: Glassmorphism Rendering (Desktop)
    Given estoy en un navegador desktop (ancho >= 768px)
    When abro la vista de Agenda
    Then el contenedor del calendario debe tener:
      | Propiedad       | Valor Esperado          |
      | Background      | Semi-transparente       |
      | Backdrop Blur   | Efecto de desenfoque visible |
      | Border Radius   | Bordes muy redondeados (≥24px) |
      | Shadow          | Sombra pronunciada      |
    And debe verse como una "tarjeta flotante" sobre el gradiente

  Scenario: Typography Standards
    Given estoy en cualquier vista de Dentalogic
    When inspecciono los headers (h1, h2)
    Then deben usar la fuente "Inter" o "Geist Sans"
    And el color debe ser slate-800 (NO gray-800)
    And deben tener letter-spacing ajustado (tracking-tight)

  Scenario: Gradient Background Rendering
    Given estoy en el Layout principal
    When observo el fondo de la aplicación
    Then debe haber un degradado suave de slate-50 a blue-50
    And NO debe ser un color sólido gris

  Scenario: Mobile Glassmorphism Optimization
    Given estoy en un dispositivo móvil (ancho < 768px)
    When abro la agenda
    Then el glassmorphism debe usar backdrop-blur-lg (NO 2xl)
    And los bordes deben ser rounded-2xl (NO 3xl)
    And la UI debe ser fluida sin lag de rendering
```

---

## 6. Plan de Implementación (Fases)

### Fase A: Layout Root (Layout.tsx)
**Archivos**: `frontend_react/src/components/Layout.tsx`

**Cambios**:
1. Línea 82: Agregar `bg-gradient-to-br from-slate-50 to-blue-50` al root container
2. Línea 149: Verificar que el content wrapper mantenga `flex-1 min-h-0 overflow-hidden`

**No tocar**: Lógica de WebSocket, notificaciones, sidebar collapse

---

### Fase B: AgendaView Architecture (AgendaView.tsx)
**Archivos**: `frontend_react/src/views/AgendaView.tsx`

**Cambios**:
1. Línea 668: Cambiar root div de:
   ```tsx
   <div className="p-4 lg:p-6 h-full overflow-y-auto bg-gray-100">
   ```
   a:
   ```tsx
   <div className="flex flex-col h-full overflow-hidden bg-transparent">
   ```

2. Línea 740: Cambiar calendar container de:
   ```tsx
   <div className="bg-white rounded-xl shadow-md border border-gray-100 p-2 sm:p-4">
   ```
   a:
   ```tsx
   <div className="flex-1 min-h-0 overflow-hidden relative m-4">
     <div className="h-full bg-white/60 md:backdrop-blur-2xl backdrop-blur-lg border border-white/40 shadow-2xl rounded-2xl md:rounded-3xl p-2 sm:p-4 overflow-auto">
       <FullCalendar ... />
     </div>
   </div>
   ```

3. Línea 673: Cambiar header typography:
   ```tsx
   <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Agenda</h1>
   ```

**No tocar**: Lógica de eventos, WebSocket listeners, CRUD operations, state management

---

### Fase C: Global Typography (tailwind.config.js o CSS)
**Archivos**: `frontend_react/tailwind.config.js` ó `frontend_react/src/index.css`

**Opción 1 - Tailwind Config** (Preferida):
```js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Geist Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

**Opción 2 - Google Fonts Import** (`index.html`):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## 7. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Backdrop blur causa lag en mobile** | Medio | Usar `backdrop-blur-lg` en mobile, `backdrop-blur-2xl` solo en desktop |
| **Font Inter no carga (CORS/red)** | Bajo | Definir fallbacks: `font-family: Inter, Geist Sans, system-ui` |
| **Glassmorphism no se ve en navegadores viejos** | Bajo | Fallback automático a `bg-white` si el navegador no soporta `backdrop-filter` |
| **Scroll isolation rompe drag & drop** | Alto | ⚠️ **CRÍTICO**: Testear drag & drop de eventos post-refactor |

---

## 8. Verificación (Testing Plan)

### Manual Testing (Visual QA)
1. **Desktop Chrome (1920x1080)**:
   - Abrir `/agenda`
   - Verificar gradiente de fondo
   - Scrollear en el calendario → Sidebar/Topbar deben quedar fijos
   - Inspeccionar DevTools → Calendar container debe tener `backdrop-filter: blur(48px)`

2. **Mobile Simulator (iPhone SE - 375px)**:
   - Cambiar viewport en DevTools
   - Verificar glassmorphism con blur reducido (`backdrop-blur-lg`)
   - Scrollear → No debe haber scroll horizontal

3. **Typography Inspection**:
   - Inspeccionar h1 en DevTools
   - `font-family` debe incluir "Inter"
   - `color` debe ser `rgb(30, 41, 59)` (slate-800)

### Automated Testing (Screenshot Comparison)
Si existe Playwright/Cypress:
```typescript
test('Glassmorphism rendering', async ({ page }) => {
  await page.goto('/agenda');
  const calendarContainer = page.locator('.bg-white\\/60');
  await expect(calendarContainer).toHaveCSS('backdrop-filter', /blur/);
});
```

### Drag & Drop Regression Test
⚠️ **CRÍTICO**: Después de aplicar cambios, validar:
1. Crear un turno en el calendario
2. Arrastrarlo a otra hora
3. Confirmar que se guarda correctamente en DB

---

## 9. Rollback Plan

Si algo falla:
1. Los cambios son 100% CSS → Revertir clases de Tailwind
2. Ninguna lógica de negocio se modifica → Cero riesgo de data loss
3. Git revert del commit del merge

---

## 10. Definition of Done (DoD)

- [x] Código: Cambios aplicados en Layout.tsx y AgendaView.tsx
- [x] Visual QA: Screenshots de Desktop y Mobile aprobados
- [x] Scroll Test: Sidebar/Topbar quedan fijos al scrollear
- [x] Typography: Headers usan Inter + slate-800 + tracking-tight
- [x] Glassmorphism: Calendar tiene backdrop-blur visible
- [x] Gradient: Background con degradado slate→blue
- [x] Drag & Drop: Funcionalidad de arrastrar eventos NO afectada
- [x] Mobile Performance: No lag en iPhone SE (DevTools throttling)

---

*Dentalogic Specification v2.0 - Sovereign Glass Architecture*
