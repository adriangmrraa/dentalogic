# SPEC: Features Especiales (Nova, Onboarding, Security)

**Fase:** 6 - Features Especiales
**Prioridad:** MEDIA
**Bloqueado por:** Fase 1 (Design System)
**Origen:** Replicación de ClinicForge
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

ClinicForge tiene features premium que elevan la experiencia: un asistente de voz AI (Nova), un sistema de onboarding interactivo, notificaciones toast glassmorphic expandidas y sanitización HTML con DOMPurify. Esta fase cierra la brecha de funcionalidades especiales.

---

## 2. Requerimientos Técnicos

### 2.1 NovaWidget (`src/components/NovaWidget.tsx`)

**Descripción:** Botón flotante de asistente AI que ofrece ayuda contextual. Posición fija bottom-right.

**Props:**
```typescript
interface NovaWidgetProps {
  currentPage: string;    // ruta actual para contexto
  userRole: string;
}
```

**Funcionalidad:**
- **Estado cerrado**: Botón circular con icono de AI (sparkles/brain)
  - Animación `novaWobble` (5s infinite) para atraer atención
  - Anillo de radar `novaPing` (3s infinite)
  - Al hacer hover: wobble se pausa, scale 1.1

- **Estado abierto**: Panel expandido con chat/ayuda
  - Sugerencias contextuales basadas en la página actual:
    - Dashboard: "¿Cómo interpretar estos KPIs?"
    - Agenda: "¿Cómo agendar una cita?"
    - Pacientes: "¿Cómo buscar un paciente?"
  - Input para preguntas libres
  - Respuestas renderizadas con markdown
  - Historial de conversación en la sesión

- **Posicionamiento:**
  - Desktop: `fixed bottom-6 right-6`
  - Mobile: `fixed bottom-4 right-4`
  - Z-index: 50 (sobre todo excepto modales)
  - No interferir con scroll del contenido

**UI:**
- Botón: `bg-violet-500/20 border-violet-500/30 text-violet-400`
- Panel: GlassCard con `bg-[#0d1117]` elevated, max-height 60vh
- Animación de apertura: `modalIn`
- Animación de cierre: fadeOut reverse

**API Endpoint:**
```
POST /admin/nova/ask → { answer: string, suggestions: string[] }
Body: { question: string, context: { page: string, role: string } }
```

### 2.2 OnboardingGuide (`src/components/OnboardingGuide.tsx`)

**Descripción:** Tutorial interactivo que guía al usuario nuevo paso a paso por las funcionalidades principales.

**Props:**
```typescript
interface OnboardingGuideProps {
  isVisible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}
```

**Steps del onboarding:**
1. **Bienvenida**: "¡Bienvenido a Dentalogic!" con logo y breve intro
2. **Dashboard**: Highlight del área de KPIs, explicar métricas
3. **Agenda**: Highlight de la agenda, cómo crear citas
4. **Pacientes**: Highlight de la lista, cómo buscar y crear
5. **Chats**: Highlight del módulo de chats, IA y handoff
6. **Perfil**: Highlight de configuración personal
7. **Finalización**: "¡Estás listo! Siempre puedes acceder a la ayuda con el botón de guía"

**Mecanismo de highlight:**
- Overlay oscuro sobre toda la app (`bg-black/60`)
- "Ventana" recortada sobre el elemento target (CSS clip-path o mask)
- Tooltip/card con explicación apuntando al elemento
- Botones: "Siguiente", "Anterior", "Saltar"
- Progreso: dots o barra de steps

**Persistencia:**
- `localStorage.setItem('onboarding_completed', 'true')`
- Se muestra automáticamente si `onboarding_completed` no existe
- Botón de guía en el header puede re-activarlo

**UI:**
- Overlay: `fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm`
- Tooltip: GlassCard con flecha apuntando al target
- Animación de transición entre steps: `fadeIn` + `slideUp`
- Botón de guía: icono `HelpCircle` con animación `guideWobble`
- Ring de ping: `guidePing` (3s infinite)

### 2.3 Notificaciones Toast Expandidas (mejora en `Layout.tsx`)

**Descripción:** Expandir el sistema de notificaciones toast para manejar más eventos de Socket.io.

**Tipos de toast (glassmorphic):**

| Tipo | Color | Eventos |
|------|-------|---------|
| `handoff` | `bg-blue-500/10 border-blue-500/20 text-blue-400` | HUMAN_HANDOFF |
| `new_patient` | `bg-green-500/10 border-green-500/20 text-green-400` | NEW_PATIENT |
| `urgency` | `bg-red-500/10 border-red-500/20 text-red-400` | PATIENT_UPDATED (urgency) |
| `appointment` | `bg-emerald-500/10 border-emerald-500/20 text-emerald-400` | NEW_APPOINTMENT |
| `payment` | `bg-violet-500/10 border-violet-500/20 text-violet-400` | PAYMENT_CONFIRMED |
| `lead` | `bg-amber-500/10 border-amber-500/20 text-amber-400` | NEW_LEAD |

**Comportamiento:**
- Entrada: animación `slideIn` desde la derecha
- Auto-dismiss: 10 segundos
- Clickeable: navega a la página relevante
- Stack: máximo 3 toasts visibles, los más viejos se desplazan
- Sonido opcional (toggle en perfil)
- Mobile: full-width en la parte superior

**Socket.io Events a escuchar (ampliar):**
```typescript
socket.on('NEW_APPOINTMENT', handleAppointmentToast);
socket.on('PATIENT_UPDATED', handleUrgencyToast);
socket.on('HUMAN_HANDOFF', handleHandoffToast);
socket.on('NEW_PATIENT', handleNewPatientToast);
socket.on('PAYMENT_CONFIRMED', handlePaymentToast);
socket.on('NEW_LEAD', handleNewLeadToast);
socket.on('NEW_MESSAGE', handleNewMessageToast);
```

### 2.4 DOMPurify Integration

**Descripción:** Agregar sanitización HTML para prevenir XSS en contenido renderizado dinámicamente (mensajes de chat, notas de pacientes, templates).

**Instalación:**
```bash
npm install dompurify
npm install -D @types/dompurify
```

**Uso:**
```typescript
import DOMPurify from 'dompurify';

// En componentes que renderizan HTML dinámico:
const sanitized = DOMPurify.sanitize(htmlContent);
<div dangerouslySetInnerHTML={{ __html: sanitized }} />
```

**Puntos de aplicación:**
- `ChatsView.tsx` - Mensajes de chat con formato
- `AnamnesisPanel.tsx` - Notas médicas
- `MetaTemplatesView.tsx` - Preview de templates
- `NovaWidget.tsx` - Respuestas markdown del AI
- `LeadDetailView.tsx` - Notas y timeline

### 2.5 Connection Status Indicator (mejora en `Layout.tsx`)

**Descripción:** Indicador visual del estado de conexión WebSocket y online/offline.

**Estados:**
```typescript
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'offline';
```

**Visual:**
- `connected`: Dot verde pulsante (hidden después de 3s)
- `reconnecting`: Dot amber con animación pulse + texto "Reconectando..."
- `disconnected`: Dot rojo + texto "Sin conexión al servidor"
- `offline`: Banner completo "Sin conexión a internet"

**Ubicación:** Header, junto al nombre de la clínica

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: NovaWidget AI Assistant

  Scenario: Abrir widget de Nova
    Given la app cargada en cualquier página
    When hago click en el botón de Nova (bottom-right)
    Then se expande panel con sugerencias contextuales
    And la animación wobble se pausa

  Scenario: Hacer pregunta a Nova
    Given el panel de Nova abierto
    When escribo "¿Cómo agendo una cita?" y envío
    Then aparece respuesta del AI en formato markdown
    And se sanitiza con DOMPurify antes de renderizar

Feature: Onboarding Guide

  Scenario: Usuario nuevo ve onboarding
    Given un usuario que nunca ha completado el onboarding
    When la app carga por primera vez
    Then aparece el overlay de onboarding en step 1
    And el dashboard se resalta con ventana recortada

  Scenario: Completar onboarding
    Given el onboarding en step 7 (final)
    When hago click en "¡Estoy listo!"
    Then el overlay desaparece
    And localStorage.onboarding_completed = 'true'
    And no se muestra de nuevo en siguiente login

  Scenario: Re-activar onboarding
    Given onboarding completado previamente
    When hago click en el botón de guía del header
    Then el onboarding se reinicia desde step 1

Feature: Toast Notifications

  Scenario: Recibir notificación de nuevo lead
    Given la app conectada por Socket.io
    When llega evento NEW_LEAD
    Then aparece toast amber "Nuevo lead: {nombre}"
    And el toast tiene animación slideIn
    And se auto-dismiss en 10 segundos

  Scenario: Click en toast navega a página
    Given un toast de HUMAN_HANDOFF visible
    When hago click en el toast
    Then navego a /chats con la conversación seleccionada
    And el toast desaparece

Feature: DOMPurify Security

  Scenario: Sanitizar contenido de chat
    Given un mensaje de chat con HTML malicioso "<script>alert('xss')</script>"
    When el mensaje se renderiza
    Then el script tag es eliminado por DOMPurify
    And solo se muestra texto plano seguro
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/components/NovaWidget.tsx` | Asistente AI flotante |
| CREAR | `src/components/OnboardingGuide.tsx` | Tutorial interactivo |
| MODIFICAR | `src/components/Layout.tsx` | Integrar Nova, Onboarding, toasts expandidos, connection status |
| MODIFICAR | `src/views/ChatsView.tsx` | DOMPurify en mensajes |
| MODIFICAR | `package.json` | Agregar dompurify + @types/dompurify |

---

## 5. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Nova API no disponible | Medio | Fallback a sugerencias estáticas |
| Onboarding interfiere con UI | Bajo | Z-index controlado, skip disponible siempre |
| DOMPurify bundle size | Bajo | ~7KB gzipped, justificado por seguridad |
| Demasiados toasts simultáneos | Bajo | Límite de 3, queue para los siguientes |

---

## 6. Checkpoint de Soberanía
- Nova: las preguntas se envían con `tenant_id` de JWT
- Toasts: los eventos de Socket.io ya están filtrados por tenant en el backend
- Onboarding: no involucra datos, solo UI local

## 7. Checkpoint de UI
- NovaWidget: violet theme, floating, animaciones wobble/ping
- OnboardingGuide: overlay blur + spotlight + tooltip glass
- Toasts: colores semánticos, slideIn, auto-dismiss
- Connection status: dots con pulse animation
- Todo respeta el dark theme y el design system premium de Fase 1
