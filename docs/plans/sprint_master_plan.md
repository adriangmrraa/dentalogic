# Plan Maestro: Sprint Evolución Dentalogic

**Generado:** 2026-03-27
**Basado en:** Análisis comparativo ClinicForge vs Dentalogic

---

## Goal Description

Llevar Dentalogic a paridad completa con ClinicForge en UI, componentes, páginas, funcionalidades e integraciones. El resultado es una aplicación dental con design system premium glassmorphic, componentes médicos especializados, módulo de marketing completo e integraciones con Meta y Google.

---

## User Review Required

- **Breaking Change**: Migración de tema claro a dark theme afecta TODAS las vistas
- **Decisión**: ¿Migrar gradualmente (vista por vista) o big bang?
- **Dependencia externa**: APIs de Meta/Google requieren credentials configurados
- **BD**: Se necesitan 6 tablas nuevas (migraciones idempotentes)

---

## Orden de Ejecución Detallado

### FASE 1: Design System Premium (Fundación)
**Estimación de complejidad:** Alta (base para todo)

**Tareas:**
1. [ ] Crear `GlassCard.tsx` con props, layers, hover effects, Ken Burns
2. [ ] Actualizar `tailwind.config.js` con animations, fonts, colores
3. [ ] Reescribir `index.css` con animaciones premium + scrollbar + dark base
4. [ ] Migrar `Layout.tsx` a dark theme con Scroll Isolation
5. [ ] Migrar `Sidebar.tsx` a versión premium con hover images
6. [ ] Migrar `Modal.tsx` a glass styling
7. [ ] Migrar `PageHeader.tsx` a text opacity scale
8. [ ] Migrar `DashboardView.tsx` a dark theme + GlassCards
9. [ ] Migrar `AgendaView.tsx` a dark theme
10. [ ] Migrar `PatientsView.tsx` a dark theme
11. [ ] Migrar `ChatsView.tsx` a dark theme
12. [ ] Migrar `TreatmentsView.tsx` a dark theme
13. [ ] Migrar `ProfileView.tsx` a dark theme
14. [ ] Migrar `LoginView.tsx` a dark theme
15. [ ] Migrar `ConfigView.tsx` a dark theme
16. [ ] Migrar `ClinicsView.tsx` a dark theme
17. [ ] Migrar `ProfessionalAnalyticsView.tsx` a dark theme
18. [ ] Migrar `UserApprovalView.tsx` a dark theme
19. [ ] Migrar componentes menores: AppointmentCard, AppointmentForm, DateStrip, SkeletonLoader, KPICard, AnalyticsFilters

**Verificación:**
- Ningún `bg-white` literal en código (excepto text-white/opacity)
- Ningún `bg-gray-50/100` claro
- GlassCard renderiza con capas correctas
- Animaciones reproducen en Chrome y Safari
- Mobile responsive mantenido

---

### FASE 2: Componentes Médicos (paralelo con 4 y 6 tras Fase 1)

**Tareas:**
1. [ ] Crear `Odontogram.tsx` con layout FDI, colores por estado, panel lateral
2. [ ] Crear `AnamnesisPanel.tsx` con secciones colapsables
3. [ ] Crear `DocumentGallery.tsx` con grid, upload, lightbox
4. [ ] Crear `chat/MessageMedia.tsx` con renderizado por tipo
5. [ ] Integrar Odontogram en PatientDetail (tab)
6. [ ] Integrar AnamnesisPanel en PatientDetail (tab)
7. [ ] Integrar DocumentGallery en PatientDetail (tab)
8. [ ] Integrar MessageMedia en ChatsView

**Verificación:**
- Odontograma muestra 32 dientes con colores correctos
- Click en diente → toothPop + panel lateral
- Upload de documento funciona con drag & drop
- Media en chat renderiza imagen, audio, video, documento

---

### FASE 3: Páginas Faltantes (tras Fase 2)

**Tareas:**
1. [ ] Crear `AnamnesisPublicView.tsx` multi-step con validación de token
2. [ ] Crear `PrivacyTermsView.tsx` con contenido estático
3. [ ] Crear `DashboardStatusView.tsx` con KPIs ejecutivos y gráficas
4. [ ] Refactorizar `PatientDetail.tsx` con sistema de tabs
5. [ ] Agregar rutas en `App.tsx`

**Verificación:**
- AnamnesisPublicView accesible sin login con token válido
- Token inválido muestra error correcto
- DashboardStatusView solo accesible para rol CEO
- Tabs en PatientDetail transicionan con animación

---

### FASE 4: Marketing & Leads (paralelo con 2 y 6 tras Fase 1)

**Tareas:**
1. [ ] Crear `api/chats.ts` módulo dedicado
2. [ ] Crear `api/google_ads.ts` módulo dedicado
3. [ ] Crear `AdContextCard.tsx`
4. [ ] Crear `MarketingPerformanceCard.tsx`
5. [ ] Crear `MarketingHubView.tsx` con KPIs y grid de campañas
6. [ ] Crear `LeadsManagementView.tsx` con tabla filtrable
7. [ ] Crear `LeadDetailView.tsx` con timeline
8. [ ] Crear `MetaTemplatesView.tsx` con CRUD y preview
9. [ ] Agregar items de marketing en Sidebar
10. [ ] Agregar rutas en App.tsx

**Verificación:**
- Marketing Hub muestra KPIs y campañas
- Leads se filtran por fuente y estado
- Lead se puede convertir a paciente
- Templates se crean y previsualizan

---

### FASE 5: Integraciones (tras Fase 4)

**Tareas:**
1. [ ] Crear `useFacebookSdk.ts` hook
2. [ ] Crear `useSmartScroll.ts` hook
3. [ ] Crear `MetaConnectionWizard.tsx` multi-step
4. [ ] Crear `GoogleConnectionWizard.tsx` multi-step
5. [ ] Crear `MetaConnectionTab.tsx`
6. [ ] Crear `LeadsFormsTab.tsx`
7. [ ] Crear `MetaTokenBanner.tsx`
8. [ ] Integrar MetaTokenBanner en Layout
9. [ ] Agregar tabs de integraciones en ConfigView

**Verificación:**
- Facebook SDK carga correctamente
- Wizard de Meta completa flujo de conexión
- Banner aparece cuando token expira
- ConfigView muestra estado de conexiones

---

### FASE 6: Features Especiales (paralelo con 2 y 4 tras Fase 1)

**Tareas:**
1. [ ] Instalar dompurify
2. [ ] Crear `NovaWidget.tsx` con botón flotante y panel
3. [ ] Crear `OnboardingGuide.tsx` con overlay y steps
4. [ ] Expandir sistema de toasts en Layout (6 tipos)
5. [ ] Agregar Connection Status indicator en Layout
6. [ ] Integrar DOMPurify en ChatsView, AnamnesisPanel, Templates, Nova
7. [ ] Integrar NovaWidget y OnboardingGuide en Layout

**Verificación:**
- Nova abre/cierra con animaciones correctas
- Onboarding aparece para usuario nuevo
- Toasts aparecen para todos los eventos de Socket.io
- DOMPurify sanitiza HTML malicioso

---

## Verification Plan Global

1. **Build**: `npm run build` sin errores ni warnings
2. **Lint**: `npm run lint` sin errores
3. **TypeScript**: Sin errores de tipo
4. **Visual**: Todas las vistas en dark theme glassmorphic
5. **Mobile**: Responsive en 375px, 390px, 428px viewports
6. **Scroll**: No hay double scroll en ninguna vista
7. **Seguridad**: DOMPurify activo en todo HTML dinámico
8. **Soberanía**: Grep por queries SQL verifica tenant_id en todas
