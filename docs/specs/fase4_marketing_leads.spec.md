# SPEC: Marketing Hub & Leads Management

**Fase:** 4 - Marketing
**Prioridad:** ALTA
**Bloqueado por:** Fase 1 (Design System)
**Origen:** Replicación de ClinicForge
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

ClinicForge tiene un módulo completo de marketing con gestión de leads, campañas de Meta/Google Ads, templates de mensajes y métricas de rendimiento. Dentalogic no tiene ninguna de estas capacidades. Esta fase implementa todo el ecosistema de marketing.

---

## 2. Requerimientos Técnicos

### 2.1 MarketingHubView (`src/views/MarketingHubView.tsx`)

**Ruta:** `/marketing` (CEO only)

**Descripción:** Dashboard central de marketing con vista consolidada de campañas y rendimiento.

**Secciones:**
1. **KPI Row** (4 GlassCards):
   - Total Leads (este mes)
   - Costo por Lead (CPL)
   - Tasa de Conversión (leads → pacientes)
   - ROI de Marketing

2. **Campañas Activas** (grid de AdContextCards):
   - Nombre de campaña
   - Plataforma (Meta/Google badge)
   - Estado (active/paused/ended)
   - Budget vs Gastado
   - Leads generados
   - CPC y CPL

3. **Rendimiento Combinado** (MarketingPerformanceCard):
   - Gráfica de líneas: leads por día (últimos 30 días)
   - Comparativa Meta vs Google
   - Gráfica de barras: inversión por plataforma

4. **Quick Actions:**
   - Ir a Templates
   - Ir a Leads
   - Sincronizar campañas
   - Ver configuración de integraciones

**API Endpoints:**
```
GET /admin/marketing/dashboard        → MarketingDashboard
GET /admin/marketing/campaigns        → Campaign[]
GET /admin/marketing/google/metrics   → GoogleMetrics
GET /admin/marketing/meta/metrics     → MetaMetrics
POST /admin/marketing/sync            → SyncResult
```

### 2.2 LeadsManagementView (`src/views/LeadsManagementView.tsx`)

**Ruta:** `/leads` (CEO only)

**Descripción:** Tabla/kanban de gestión de leads con pipeline visual.

**Modos de vista (toggle):**

**Vista Tabla:**
- Columnas: Nombre, Teléfono, Fuente, Estado, Fecha, Profesional asignado, Acciones
- Filtros: fuente (Meta/Google/WhatsApp/Manual), estado, fecha
- Búsqueda por nombre/teléfono
- Paginación con scroll infinito

**Vista Kanban (opcional, stretch goal):**
- Columnas: Nuevo → Contactado → Cita Agendada → Paciente → Perdido
- Drag & drop entre columnas
- Cards con info resumida del lead

**Estados de Lead:**
```typescript
type LeadStatus = 'new' | 'contacted' | 'appointment_scheduled' | 'converted' | 'lost';
```

**Fuentes de Lead:**
```typescript
type LeadSource = 'meta_ads' | 'google_ads' | 'whatsapp' | 'instagram' | 'facebook' | 'website' | 'referral' | 'manual';
```

**Acciones por lead:**
- Ver detalle
- Cambiar estado
- Asignar profesional
- Enviar mensaje (abre chat)
- Convertir a paciente
- Marcar como perdido (con razón)

**API Endpoints:**
```
GET    /admin/leads?source=&status=&page=&search= → PaginatedLeads
PUT    /admin/leads/{id}/status                     → Lead
PUT    /admin/leads/{id}/assign                     → Lead
POST   /admin/leads/{id}/convert                    → Patient
```

### 2.3 LeadDetailView (`src/views/LeadDetailView.tsx`)

**Ruta:** `/leads/:id` (CEO only)

**Descripción:** Perfil completo de un lead individual.

**Secciones:**
1. **Header**: Nombre, fuente (badge), estado (badge), fecha de creación
2. **Info de Contacto**: Teléfono, email, notas
3. **Origen de Campaña**: Qué campaña/ad generó el lead, UTM params
4. **Timeline**: Historial de interacciones (contactos, cambios de estado, mensajes)
5. **Acciones**: Convertir a paciente, enviar mensaje, asignar

**API Endpoints:**
```
GET /admin/leads/{id}           → LeadDetail
GET /admin/leads/{id}/timeline  → TimelineEvent[]
```

### 2.4 MetaTemplatesView (`src/views/MetaTemplatesView.tsx`)

**Ruta:** `/templates` (CEO only)

**Descripción:** Gestión de plantillas de mensajes de WhatsApp/Meta para envíos masivos y automatizados.

**Funcionalidad:**
- Lista de templates existentes con estado (approved/pending/rejected)
- Preview de template con variables renderizadas
- Crear nuevo template (nombre, categoría, idioma, body con {{variables}})
- Editar template existente
- Eliminar template
- Filtro por categoría: utility, marketing, authentication

**API Endpoints:**
```
GET    /admin/templates            → Template[]
POST   /admin/templates            → Template
PUT    /admin/templates/{id}       → Template
DELETE /admin/templates/{id}       → void
POST   /admin/templates/{id}/sync  → SyncResult (sincronizar con Meta)
```

### 2.5 MarketingPerformanceCard (`src/components/MarketingPerformanceCard.tsx`)

**Props:**
```typescript
interface MarketingPerformanceCardProps {
  data: PerformanceData;
  period: 'week' | 'month' | 'quarter';
}

interface PerformanceData {
  totalLeads: number;
  totalSpend: number;
  avgCPL: number;
  conversionRate: number;
  dailyLeads: { date: string; meta: number; google: number }[];
  platformSpend: { platform: string; amount: number }[];
}
```

**Visual:**
- GlassCard con dos gráficas:
  - LineChart de leads diarios (meta=blue, google=green)
  - BarChart de inversión por plataforma

### 2.6 AdContextCard (`src/components/AdContextCard.tsx`)

**Props:**
```typescript
interface AdContextCardProps {
  campaign: Campaign;
  onClick?: () => void;
}

interface Campaign {
  id: string;
  name: string;
  platform: 'meta' | 'google';
  status: 'active' | 'paused' | 'ended';
  budget: number;
  spent: number;
  leads: number;
  cpc: number;
  cpl: number;
  startDate: string;
  endDate?: string;
}
```

**Visual:**
- GlassCard con badge de plataforma (Meta=blue, Google=green)
- Barra de progreso budget vs spent
- Métricas: leads, CPC, CPL
- Status badge con color semántico

### 2.7 API Modules

**`src/api/chats.ts`** (dedicado):
```typescript
export const fetchChatsSummary = () => apiGet('/admin/chats/summary');
export const fetchChatMessages = (conversationId: string, page?: number) => apiGet(`/admin/chats/${conversationId}/messages?page=${page || 1}`);
export const sendChatMessage = (conversationId: string, message: string) => apiPost(`/admin/chats/${conversationId}/send`, { message });
export const uploadChatMedia = (conversationId: string, file: FormData) => apiPost(`/admin/chats/${conversationId}/media`, file);
export const setHumanOverride = (conversationId: string, active: boolean) => apiPost(`/admin/chats/${conversationId}/override`, { active });
export const markConversationRead = (conversationId: string) => apiPut(`/admin/chats/${conversationId}/read`);
export const fetchChatwootConfig = () => apiGet('/admin/integrations/chatwoot/config');
```

**`src/api/google_ads.ts`** (dedicado):
```typescript
export const getCampaigns = () => apiGet('/admin/marketing/google/campaigns');
export const getMetrics = (from: string, to: string) => apiGet(`/admin/marketing/google/metrics?from=${from}&to=${to}`);
export const getCustomers = () => apiGet('/admin/marketing/google/customers');
export const getConnectionStatus = () => apiGet('/admin/auth/google/ads/status');
export const getCombinedStats = (from: string, to: string) => apiGet(`/admin/marketing/combined?from=${from}&to=${to}`);
export const syncData = () => apiPost('/admin/marketing/google/sync');
export const disconnect = () => apiPost('/admin/auth/google/ads/disconnect');
export const refreshToken = () => apiPost('/admin/auth/google/ads/refresh');
```

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Marketing Hub

  Scenario: CEO ve dashboard de marketing
    Given un usuario CEO autenticado
    When navega a /marketing
    Then ve 4 KPI cards de marketing
    And grid de campañas activas con badges de plataforma
    And gráfica de rendimiento combinado

  Scenario: Sincronizar campañas
    Given el marketing hub abierto
    When hago click en "Sincronizar campañas"
    Then se ejecuta sync con Meta y Google
    And los datos de campañas se actualizan

Feature: Gestión de Leads

  Scenario: Ver lista de leads con filtros
    Given leads registrados en el sistema
    When navego a /leads
    Then veo tabla con leads ordenados por fecha
    When filtro por fuente "meta_ads"
    Then solo muestra leads de Meta Ads

  Scenario: Convertir lead a paciente
    Given un lead con estado "appointment_scheduled"
    When hago click en "Convertir a paciente"
    Then se crea registro de paciente con datos del lead
    And el lead cambia a estado "converted"
    And se redirige al detalle del nuevo paciente

Feature: Templates de Meta

  Scenario: Crear nuevo template
    Given la vista de templates abierta
    When creo un template con nombre, categoría y body
    And hago click en guardar
    Then el template aparece en la lista con estado "pending"
    And se puede sincronizar con Meta
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/views/MarketingHubView.tsx` | Dashboard de marketing |
| CREAR | `src/views/LeadsManagementView.tsx` | Gestión de leads |
| CREAR | `src/views/LeadDetailView.tsx` | Detalle de lead |
| CREAR | `src/views/MetaTemplatesView.tsx` | Templates de Meta |
| CREAR | `src/components/MarketingPerformanceCard.tsx` | Card de rendimiento |
| CREAR | `src/components/AdContextCard.tsx` | Card de campaña |
| CREAR | `src/api/chats.ts` | API module de chats |
| CREAR | `src/api/google_ads.ts` | API module de Google Ads |
| MODIFICAR | `src/App.tsx` | Agregar rutas de marketing |
| MODIFICAR | `src/components/Sidebar.tsx` | Agregar items: Marketing, Templates, Leads |

---

## 5. Esquema de Datos (Backend - referencia)

```sql
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  source VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  campaign_id VARCHAR(255),
  campaign_name VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  assigned_to INTEGER REFERENCES users(id),
  converted_patient_id INTEGER REFERENCES patients(id),
  lost_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_timeline (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  event_type VARCHAR(50) NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  language VARCHAR(10) DEFAULT 'es',
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  meta_template_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| APIs de Meta/Google no conectadas | Alto | Mostrar estado "no conectado" con CTA para configurar |
| Datos de campañas desactualizados | Medio | Botón de sync manual + sync automático cada 30min |
| Conversión lead→paciente duplicada | Medio | Check de teléfono/email existente antes de crear |
| Templates rechazados por Meta | Bajo | Mostrar guías de buenas prácticas al crear |

---

## 7. Checkpoint de Soberanía
- TODAS las queries de leads, templates y campañas filtran por `tenant_id`
- `tenant_id` de JWT en todos los endpoints
- La conversión lead→paciente mantiene el `tenant_id` del lead

## 8. Checkpoint de UI
- Marketing Hub: grid responsive de AdContextCards
- Leads: tabla glass con hover states, badges semánticos por fuente/estado
- Templates: preview con variables resaltadas en `text-violet-400`
- Todas las cards usan GlassCard como base
