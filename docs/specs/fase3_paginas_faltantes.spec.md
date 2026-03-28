# SPEC: Páginas Faltantes (Patient Experience + CEO)

**Fase:** 3 - Páginas
**Prioridad:** ALTA
**Bloqueado por:** Fase 1 (Design System), Fase 2 (Componentes Médicos)
**Origen:** Replicación de ClinicForge
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

ClinicForge tiene varias páginas/vistas que Dentalogic no posee. Esta fase agrega las páginas faltantes y mejora las existentes para alcanzar paridad funcional completa.

---

## 2. Requerimientos Técnicos

### 2.1 AnamnesisPublicView (`src/views/AnamnesisPublicView.tsx`)

**Ruta:** `/anamnesis/:tenantId/:token` (PÚBLICA, sin auth)

**Descripción:** Formulario público que el paciente llena antes de su primera cita. Se accede via link enviado por WhatsApp/email.

**Funcionalidad:**
- Validar token (GET `/public/anamnesis/validate/:token`)
- Si token válido: mostrar formulario de anamnesis
- Si token expirado/inválido: mostrar mensaje de error
- Formulario multi-step (3 pasos):
  1. **Datos Personales**: nombre, fecha nacimiento, teléfono, email, obra social
  2. **Historia Médica**: alergias, medicamentos, condiciones crónicas, cirugías, embarazo
  3. **Historia Dental**: última visita, frecuencia cepillado, sensibilidades, bruxismo
- Progreso visual: barra de pasos con transición `cardSlideLeft/Right`
- Botón enviar: POST `/public/anamnesis/:token`
- Pantalla de éxito con animación `slideUp` + checkmark

**UI:**
- Fondo dark theme (`#06060e`)
- Logo de la clínica (obtenido del tenant)
- Steps en GlassCards
- Mobile-first (la mayoría llenará desde el celular)

### 2.2 PrivacyTermsView (`src/views/PrivacyTermsView.tsx`)

**Rutas:** `/privacy` y `/terms` (PÚBLICAS)

**Descripción:** Páginas estáticas de Política de Privacidad y Términos de Servicio.

**Funcionalidad:**
- Recibe `type` por ruta (`privacy` o `terms`)
- Contenido renderizado desde constantes o markdown
- Scroll suave con tabla de contenidos lateral (desktop)
- Mobile: TOC colapsable arriba

**UI:**
- Dark theme con GlassCards para secciones
- Typography legible: `text-white/70` para body, `text-white` para headings
- Max-width 768px centrado

### 2.3 DashboardStatusView (`src/views/DashboardStatusView.tsx`)

**Ruta:** `/dashboard/status` (CEO only)

**Descripción:** Dashboard ejecutivo con métricas de alto nivel para CEOs.

**Funcionalidad:**
- KPIs principales en row de GlassCards:
  - Ingresos del mes (con tendencia vs mes anterior)
  - Pacientes nuevos del mes
  - Tasa de asistencia (% citas completadas vs agendadas)
  - Profesionales activos
- Gráfica de ingresos mensuales (Recharts AreaChart)
- Gráfica de citas por profesional (BarChart)
- Tabla de profesionales con métricas:
  - Nombre, citas completadas, tasa de cancelación, ingresos generados
- Filtro de rango de fechas (AnalyticsFilters)
- Socket.io: actualización en tiempo real de KPIs

**API Endpoints:**
```
GET /admin/stats/executive?from=YYYY-MM-DD&to=YYYY-MM-DD → ExecutiveStats
GET /admin/stats/professionals/performance → ProfessionalPerformance[]
```

### 2.4 PatientDetail Enhancement (`src/views/PatientDetail.tsx`)

**Descripción:** Agregar sistema de tabs al detalle de paciente para incluir los nuevos componentes.

**Tabs:**
1. **Información** (existente) - Datos personales, contacto, obra social
2. **Odontograma** (NUEVO) - Componente Odontogram.tsx
3. **Anamnesis** (NUEVO) - Componente AnamnesisPanel.tsx
4. **Documentos** (NUEVO) - Componente DocumentGallery.tsx
5. **Historial** (existente/mejorado) - Citas pasadas, tratamientos realizados

**UI de Tabs:**
- Tab bar sticky con estilo glass
- Active tab: `bg-white/[0.08]` + `border-b-2 border-blue-500`
- Transición entre tabs con `cardSlideLeft/Right`
- Cada tab carga lazy (solo cuando se activa)

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Anamnesis Pública

  Scenario: Paciente accede con token válido
    Given un link de anamnesis con token válido
    When el paciente abre el link en su celular
    Then ve el formulario paso 1 (Datos Personales) con logo de la clínica
    And la UI es dark theme responsive

  Scenario: Paciente completa formulario multi-step
    Given el paso 1 completado
    When el paciente hace click en "Siguiente"
    Then transiciona al paso 2 con animación cardSlideLeft
    When completa los 3 pasos y envía
    Then ve pantalla de éxito con checkmark animado
    And los datos se guardan en el backend

  Scenario: Token inválido
    Given un link con token expirado
    When el paciente abre el link
    Then ve mensaje de error "Este enlace ha expirado"
    And un botón para contactar la clínica

Feature: Dashboard Ejecutivo CEO

  Scenario: CEO ve métricas ejecutivas
    Given un usuario CEO autenticado
    When navega a /dashboard/status
    Then ve 4 KPI cards con ingresos, pacientes nuevos, tasa asistencia, profesionales
    And gráficas de tendencias mensuales
    And tabla de rendimiento por profesional

  Scenario: Filtrar por rango de fechas
    Given el dashboard ejecutivo visible
    When selecciono rango "Último trimestre"
    Then todos los KPIs y gráficas se actualizan

Feature: PatientDetail con Tabs

  Scenario: Navegar entre tabs
    Given el detalle de un paciente abierto
    When hago click en la tab "Odontograma"
    Then transiciona con animación y muestra el componente Odontogram
    When hago click en "Documentos"
    Then transiciona y muestra DocumentGallery
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/views/AnamnesisPublicView.tsx` | Formulario público de anamnesis |
| CREAR | `src/views/PrivacyTermsView.tsx` | Páginas de privacidad y términos |
| CREAR | `src/views/DashboardStatusView.tsx` | Dashboard ejecutivo CEO |
| MODIFICAR | `src/views/PatientDetail.tsx` | Agregar sistema de tabs |
| MODIFICAR | `src/App.tsx` | Agregar rutas nuevas |

---

## 5. Rutas a agregar en App.tsx

```typescript
// Públicas
<Route path="/anamnesis/:tenantId/:token" element={<AnamnesisPublicView />} />
<Route path="/privacy" element={<PrivacyTermsView />} />
<Route path="/terms" element={<PrivacyTermsView />} />

// CEO only (dentro de ProtectedRoute)
<Route path="dashboard/status" element={
  <ProtectedRoute allowedRoles={['ceo']}>
    <DashboardStatusView />
  </ProtectedRoute>
} />
```

---

## 6. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Token de anamnesis pública manipulable | Alto | Tokens firmados con expiración, validación server-side |
| Datos de anamnesis con PII sensible | Alto | HTTPS obligatorio, no cachear en localStorage |
| Dashboard CEO con queries pesadas | Medio | Cachear en backend con TTL de 5min |

---

## 7. Checkpoint de Soberanía
- AnamnesisPublicView: el `tenantId` viene en la URL pero el token valida la relación tenant-paciente server-side
- DashboardStatusView: `tenant_id` de JWT para todas las queries de stats
- PatientDetail tabs: mantener filtro `tenant_id` en todas las nuevas queries

## 8. Checkpoint de UI
- AnamnesisPublicView: formulario mobile-first, steps con GlassCard
- DashboardStatusView: KPI cards con GlassCard, gráficas con tema dark
- Tabs en PatientDetail: sticky tab bar, transiciones con cardSlide
- Scroll Isolation en todos los paneles con contenido scrolleable
