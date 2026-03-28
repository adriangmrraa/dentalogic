# Sprint: Evolución Dentalogic → Paridad ClinicForge

**Fecha inicio:** 2026-03-27
**Objetivo:** Replicar todas las capacidades, páginas, componentes y design system de ClinicForge en Dentalogic.

---

## Specs Generadas

| # | Fase | Spec | Prioridad | Bloqueado por | Archivos nuevos | Archivos modificados |
|---|------|------|-----------|---------------|-----------------|---------------------|
| 1 | Design System Premium | [fase1_design_system_premium.spec.md](fase1_design_system_premium.spec.md) | CRITICA | - | 1 | 7+ (todas las views) |
| 2 | Componentes Médicos | [fase2_componentes_medicos.spec.md](fase2_componentes_medicos.spec.md) | ALTA | Fase 1 | 4 | 2 |
| 3 | Páginas Faltantes | [fase3_paginas_faltantes.spec.md](fase3_paginas_faltantes.spec.md) | ALTA | Fase 1, 2 | 3 | 2 |
| 4 | Marketing & Leads | [fase4_marketing_leads.spec.md](fase4_marketing_leads.spec.md) | ALTA | Fase 1 | 8 | 2 |
| 5 | Integraciones | [fase5_integraciones.spec.md](fase5_integraciones.spec.md) | MEDIA-ALTA | Fase 4 | 7 | 3 |
| 6 | Features Especiales | [fase6_features_especiales.spec.md](fase6_features_especiales.spec.md) | MEDIA | Fase 1 | 2 | 3 |
| 7 | SuperAdmin & Lead Tracking | [fase7_superadmin_tracking.spec.md](fase7_superadmin_tracking.spec.md) | ALTA | - | ~8 | - |
| 8 | CRM VENTAS Bridge API | [fase8_crm_bridge_api.spec.md](fase8_crm_bridge_api.spec.md) | ALTA | Fase 7 | ~4 | - |
| 9 | Premium UI Animations | [fase9_premium_ui_animations.spec.md](fase9_premium_ui_animations.spec.md) | ALTA | Fase 1 | 2 | 2 |

---

## Grafo de Dependencias

```
FASE 1 (Design System) ──┬──→ FASE 2 (Médicos) ──→ FASE 3 (Páginas)
                          ├──→ FASE 4 (Marketing) ──→ FASE 5 (Integraciones)
                          └──→ FASE 6 (Features Especiales)

FASE 7 (SuperAdmin & Lead Tracking) ──→ FASE 8 (CRM VENTAS Bridge API)
```

**Ejecución paralela posible:**
- Después de Fase 1: Fases 2, 4 y 6 pueden ejecutarse en paralelo
- Fase 3 requiere Fase 2 completada
- Fase 5 requiere Fase 4 completada
- Fase 7 es independiente y puede ejecutarse en paralelo con cualquier otra fase
- Fase 8 requiere Fase 7 completada

---

## Resumen de Entregables

### Total estimado: ~41 archivos nuevos (Fases 1-9)

### Componentes Nuevos (22 archivos):
1. `GlassCard.tsx`
2. `Odontogram.tsx`
3. `AnamnesisPanel.tsx`
4. `DocumentGallery.tsx`
5. `chat/MessageMedia.tsx`
6. `MarketingPerformanceCard.tsx`
7. `AdContextCard.tsx`
8. `integrations/MetaConnectionWizard.tsx`
9. `integrations/MetaConnectionTab.tsx`
10. `integrations/GoogleConnectionWizard.tsx`
11. `integrations/LeadsFormsTab.tsx`
12. `MetaTokenBanner.tsx`
13. `NovaWidget.tsx`
14. `OnboardingGuide.tsx`

### Vistas Nuevas (7 archivos):
1. `AnamnesisPublicView.tsx`
2. `PrivacyTermsView.tsx`
3. `DashboardStatusView.tsx`
4. `MarketingHubView.tsx`
5. `LeadsManagementView.tsx`
6. `LeadDetailView.tsx`
7. `MetaTemplatesView.tsx`

### Hooks Nuevos (2 archivos):
1. `useFacebookSdk.ts`
2. `useSmartScroll.ts`

### API Modules Nuevos (2 archivos):
1. `api/chats.ts`
2. `api/google_ads.ts`

### Dependencias Nuevas:
- `dompurify` + `@types/dompurify`

### Tablas de BD (referencia):
- `patient_odontogram`
- `patient_anamnesis`
- `patient_documents`
- `leads`
- `lead_timeline`
- `message_templates`

### Fase 7 - SuperAdmin & Lead Tracking (~8 archivos):
- Backend routes (SuperAdmin endpoints)
- Frontend views (SuperAdmin dashboard, lead management)
- DB migration (SuperAdmin role, demo tracking tables)
- Demo tracking middleware

### Fase 8 - CRM VENTAS Bridge API (~4 archivos):
- Bridge routes (public REST API)
- Auth middleware (API key / token validation)
- Webhook handler (CRM VENTAS events)

### Fase 9 - Premium UI Animations (2 archivos):
- Componente DynamicShowcase
- Refactor LandingView con `useSmartScroll`

---

## Protocolo de Ejecución (por fase)

Para cada fase, seguir el workflow `/autonomy`:

1. `/specify` - Spec ya generada (este documento)
2. `/plan` - Generar plan de implementación detallado
3. `/gate` - Evaluar confidence score
4. `/implement` - Ejecutar cambios
5. `/verify` - Tests y validación
6. `/audit` - Comparar spec vs código
7. `/review` - Calidad y seguridad
