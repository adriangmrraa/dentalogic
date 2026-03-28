# SPEC: SuperAdmin Panel & Demo Lead Tracking

**Fase:** 7 - SuperAdmin & Tracking
**Prioridad:** CRITICA
**Bloqueado por:** Fase 1 (Design System), Fase 4 (Marketing/Leads base)
**Origen:** Necesidad de negocio - Dentalogic es un producto DEMO; necesitamos rastrear visitantes y exponer datos al CRM VENTAS de Adrian
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

Dentalogic funciona como un producto de demostración. El flujo de negocio es: un dueño de clinica ve un anuncio, visita la demo, prueba la plataforma, interactua con el agente AI de WhatsApp y eventualmente agenda una cita de demostración. Actualmente no existe ningún mecanismo para rastrear este embudo, identificar leads calificados ni exponer esos datos al equipo de ventas.

Esta fase implementa tres piezas fundamentales:

1. **Rol `superadmin`**: un rol oculto por encima de CEO que tiene visibilidad total sobre todos los tenants y datos de tracking. No aparece en la UI normal ni en el sidebar.
2. **Tracking middleware**: sistema backend que registra sesiones de demo, interacciones WhatsApp, citas de demostración y uso de features en tablas dedicadas (`demo_*`).
3. **API publica para CRM VENTAS**: endpoints JSON protegidos por `X-Bridge-Token` que el CRM VENTAS (proyecto separado, en otro VPS) consume para sincronizar leads, metricas y estados.

El objetivo es cerrar el ciclo: **Ad → Demo → Tracking → CRM VENTAS → Cierre de venta**.

---

## 2. Requerimientos Tecnicos

### 2.1 Nuevo rol: `superadmin`

**Descripcion:** Rol maximo del sistema, oculto de la interfaz normal. Tiene acceso irrestricto a todos los tenants y datos.

**Comportamiento:**
- No aparece en el selector de roles ni en la UI de gestion de usuarios
- No se muestra en el sidebar normal; tiene su propio sidebar en `/superadmin`
- El JWT incluye `role: 'superadmin'` cuando aplica
- El middleware de autorizacion del backend reconoce `superadmin` como superior a `ceo`
- Solo se puede asignar este rol directamente en base de datos (no desde la UI)

**Jerarquia de roles actualizada:**
```
superadmin > ceo > admin > doctor > receptionist > assistant
```

**Proteccion de ruta frontend:**
```typescript
// En el router principal
{
  path: '/superadmin',
  element: <SuperAdminLayout />,
  children: [
    { index: true, element: <SuperAdminDashboard /> },
    { path: 'leads', element: <SuperAdminLeads /> },
    { path: 'leads/:id', element: <SuperAdminLeadDetail /> },
    { path: 'tenants', element: <SuperAdminTenants /> },
    { path: 'metrics', element: <SuperAdminMetrics /> },
  ],
  // Guard: solo superadmin
}
```

### 2.2 Tracking Middleware (Backend)

**Descripcion:** Middleware Express que intercepta acciones clave y registra eventos en las tablas `demo_*`.

**Eventos a rastrear:**

| Evento | Trigger | Datos capturados |
|--------|---------|------------------|
| `session_start` | Login a la demo | IP, user_agent, UTM params, timestamp |
| `session_end` | Logout / inactividad 30min | Duracion, paginas visitadas |
| `page_view` | Navegacion entre rutas | Ruta, tiempo en pagina |
| `whatsapp_first_contact` | Primer mensaje de un numero nuevo | Telefono, nombre, mensaje inicial |
| `whatsapp_message` | Cada mensaje en conversacion demo | lead_id, direccion (in/out), timestamp |
| `whatsapp_conversion` | AI detecta intencion de compra | lead_id, intent detectado |
| `demo_appointment_created` | Se agenda cita desde la demo | lead_id, tipo de cita, fecha |
| `feature_used` | Click en feature clave | feature_name, duracion de uso |

**Implementacion:**
```typescript
// middleware/demoTracking.ts
export const trackDemoEvent = async (
  eventType: string,
  leadId: string | null,
  eventData: Record<string, any>,
  req?: Request
) => {
  await db('demo_events').insert({
    id: uuidv4(),
    lead_id: leadId,
    event_type: eventType,
    event_data: eventData,
    created_at: new Date(),
  });

  // Recalcular engagement_score si hay lead_id
  if (leadId) {
    await recalculateEngagementScore(leadId);
  }
};
```

**Calculo de Engagement Score (0-100):**
```
session_count * 5          (max 20)
+ pages_visited * 2        (max 20)
+ whatsapp_messages * 3    (max 30)
+ demo_appointment * 20    (max 20)
+ feature_usage * 1        (max 10)
```

### 2.3 SuperAdmin Dashboard (Frontend)

**Ruta:** `/superadmin` (solo rol superadmin)

**Descripcion:** Dashboard principal con KPIs, funnel de conversion y lista de leads en tiempo real.

**Secciones:**

1. **KPI Row** (5 GlassCards):
   - Total Sesiones Demo (ultimos 30 dias)
   - Conversaciones WhatsApp unicas
   - Citas Demo agendadas
   - Leads calificados (engagement_score >= 60)
   - Tasa de conversion (visita → cita)

2. **Funnel de Conversion** (FunnelChart):
   ```
   Visita al sitio → Login Demo → Interaccion WhatsApp → Cita Demo → Lead Calificado
   ```
   - Visualizacion de embudo con porcentajes entre etapas
   - Colores degradados: `cyan-500` → `violet-500` → `emerald-500` → `amber-500`
   - Click en etapa filtra la tabla de leads

3. **Lead Table** (tabla con filtros):
   - Columnas: Nombre, Telefono, Email, Fuente, Score, Estado, Ultimo contacto, Acciones
   - Filtros: estado, rango de score, fuente (UTM), fecha
   - Busqueda por nombre/telefono/email
   - Ordenar por score (desc por defecto)
   - Badge de estado con colores semanticos
   - Boton "Ver detalle" → `/superadmin/leads/:id`
   - Boton "Exportar CSV"

4. **Activity Feed** (panel lateral o inferior):
   - Eventos en tiempo real via Socket.io
   - Formato: `[HH:mm] {icono} {descripcion}`
   - Ejemplo: `[14:32] 📱 Nuevo WhatsApp de +52 55 1234 5678`
   - Auto-scroll, maximo 50 eventos visibles

**Real-time via Socket.io:**
```typescript
// El superadmin se une a un room especial
socket.emit('join_superadmin');

// Eventos que recibe:
socket.on('DEMO_SESSION_START', handleNewSession);
socket.on('DEMO_WHATSAPP_NEW', handleWhatsAppNew);
socket.on('DEMO_APPOINTMENT_NEW', handleAppointmentNew);
socket.on('DEMO_LEAD_UPDATED', handleLeadUpdated);
```

### 2.4 SuperAdmin Lead Detail (`/superadmin/leads/:id`)

**Descripcion:** Vista detallada de un lead con timeline de actividad completa.

**Secciones:**

1. **Header Card:**
   - Nombre, telefono, email
   - Engagement Score (barra circular animada)
   - Estado actual (dropdown para cambiar)
   - Fuente (UTM badge)
   - First seen / Last seen
   - Boton "Abrir en CRM VENTAS" (link externo)

2. **Activity Timeline:**
   - Linea temporal vertical con eventos del lead
   - Cada evento: icono + tipo + descripcion + timestamp
   - Colores por tipo de evento
   - Scroll infinito si hay muchos eventos

3. **WhatsApp Conversations Summary:**
   - Total mensajes, primer mensaje, ultimo mensaje
   - Intenciones detectadas por AI
   - Link a conversacion completa en ChatsView (si aplica)

4. **Notas internas:**
   - Textarea para agregar notas sobre el lead
   - Historial de notas con autor y timestamp

### 2.5 API Publica para CRM VENTAS

**Descripcion:** Endpoints REST que el CRM VENTAS consume desde otro VPS. Autenticacion por token compartido.

**Autenticacion:**
```
Header: X-Bridge-Token: <shared_secret>
```
- El token se configura como variable de entorno `BRIDGE_TOKEN` en ambos VPS
- Si el token no coincide, responder `401 Unauthorized`
- Rate limit: 100 requests/minuto por IP

**Endpoints:**

#### `GET /api/superadmin/leads`
Lista paginada de leads con actividad resumida.

```typescript
// Query params
?page=1&limit=20&status=new&min_score=30&since=2026-03-01

// Response
{
  "data": [
    {
      "id": "uuid",
      "name": "Dr. Garcia",
      "phone": "+52 55 1234 5678",
      "email": "garcia@clinica.com",
      "source": "meta_ad_campana_marzo",
      "status": "contacted",
      "engagement_score": 75,
      "first_seen": "2026-03-15T10:30:00Z",
      "last_seen": "2026-03-20T14:22:00Z",
      "whatsapp_conversations": 3,
      "demo_appointments": 1,
      "crm_synced_at": "2026-03-20T14:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "pages": 8
  }
}
```

#### `GET /api/superadmin/leads/:id`
Detalle completo de un lead con timeline de eventos.

```typescript
// Response
{
  "lead": { /* ...campos de demo_leads... */ },
  "events": [
    {
      "id": "uuid",
      "event_type": "whatsapp_first_contact",
      "event_data": { "message": "Hola, vi su anuncio..." },
      "created_at": "2026-03-15T10:30:00Z"
    }
  ],
  "status_history": [
    {
      "old_status": "new",
      "new_status": "contacted",
      "changed_by": "crm_ventas",
      "changed_at": "2026-03-16T09:00:00Z"
    }
  ]
}
```

#### `GET /api/superadmin/metrics`
Metricas agregadas para dashboard del CRM.

```typescript
// Query params
?period=30d  // 7d, 30d, 90d, all

// Response
{
  "period": "30d",
  "total_sessions": 342,
  "unique_visitors": 198,
  "whatsapp_conversations": 87,
  "demo_appointments": 23,
  "qualified_leads": 15,
  "conversion_rates": {
    "visit_to_login": 0.58,
    "login_to_whatsapp": 0.44,
    "whatsapp_to_appointment": 0.26,
    "appointment_to_qualified": 0.65
  },
  "top_sources": [
    { "source": "meta_ad_marzo", "leads": 45 },
    { "source": "google_ads_dental", "leads": 32 }
  ],
  "avg_engagement_score": 42
}
```

#### `POST /api/superadmin/leads/:id/status`
Actualizar estado de un lead desde el CRM VENTAS.

```typescript
// Body
{
  "status": "contacted",
  "changed_by": "crm_ventas",
  "notes": "Se llamo por telefono, interesado en plan premium"
}

// Response
{
  "success": true,
  "lead": { /* lead actualizado */ },
  "status_history_entry": { /* nuevo registro */ }
}
```

#### `GET /api/superadmin/export`
Exportar leads a CSV.

```typescript
// Query params
?status=all&since=2026-03-01&format=csv

// Response: text/csv
// Headers: Content-Disposition: attachment; filename="leads_export_2026-03-27.csv"
```

---

## 3. Criterios de Aceptacion (Gherkin)

```gherkin
Feature: Rol SuperAdmin

  Scenario: SuperAdmin accede al dashboard
    Given un usuario con rol "superadmin" autenticado
    When navego a /superadmin
    Then veo el dashboard con KPIs, funnel y tabla de leads
    And el sidebar normal de la app no se muestra

  Scenario: Usuario normal no puede acceder a SuperAdmin
    Given un usuario con rol "ceo" autenticado
    When intento navegar a /superadmin
    Then soy redirigido a /dashboard
    And veo mensaje "No tienes permisos para acceder a esta seccion"

  Scenario: SuperAdmin no aparece en UI normal
    Given un usuario con rol "ceo" autenticado
    When veo el sidebar y la gestion de usuarios
    Then no existe opcion ni mencion de "superadmin"
    And el rol no aparece en el selector de roles

Feature: Tracking de Sesiones Demo

  Scenario: Rastrear inicio de sesion demo
    Given un visitante que llega desde un anuncio de Meta
    When hace login en la demo
    Then se crea un registro en demo_sessions con IP, user_agent y UTM params
    And se crea o actualiza un registro en demo_leads con la info del visitante

  Scenario: Rastrear navegacion durante la demo
    Given una sesion demo activa
    When el visitante navega de /dashboard a /agenda
    Then se registra un evento page_view con ruta y timestamp
    And el campo pages_visited de demo_sessions se actualiza

  Scenario: Rastrear fin de sesion
    Given una sesion demo activa
    When el visitante hace logout o pasan 30 minutos de inactividad
    Then se actualiza ended_at en demo_sessions
    And se calcula la duracion total de la sesion

Feature: Tracking de WhatsApp

  Scenario: Primer contacto por WhatsApp
    Given un numero de telefono nuevo que no existe en demo_leads
    When envia su primer mensaje al agente AI de WhatsApp
    Then se crea un registro en demo_leads con el telefono
    And se registra evento whatsapp_first_contact en demo_events
    And se emite evento DEMO_WHATSAPP_NEW por Socket.io

  Scenario: Deteccion de intencion de compra
    Given una conversacion WhatsApp activa con un lead
    When el AI detecta intencion de compra en el mensaje
    Then se registra evento whatsapp_conversion en demo_events
    And el engagement_score del lead se recalcula

Feature: Tracking de Citas Demo

  Scenario: Lead agenda cita de demostracion
    Given un lead identificado en el sistema
    When agenda una cita desde la plataforma demo
    Then se registra evento demo_appointment_created en demo_events
    And el campo demo_appointments del lead se incrementa
    And el engagement_score se recalcula
    And se emite evento DEMO_APPOINTMENT_NEW por Socket.io

Feature: SuperAdmin Dashboard

  Scenario: Ver KPIs en tiempo real
    Given el superadmin en /superadmin
    When llega un nuevo evento de sesion demo
    Then los KPIs se actualizan en tiempo real sin recargar
    And el activity feed muestra el nuevo evento

  Scenario: Funnel de conversion
    Given el superadmin en /superadmin
    When veo el funnel de conversion
    Then cada etapa muestra el conteo y porcentaje de conversion
    And puedo hacer click en una etapa para filtrar la tabla de leads

  Scenario: Exportar leads a CSV
    Given el superadmin viendo la tabla de leads
    When hago click en "Exportar CSV"
    Then se descarga un archivo CSV con los leads filtrados
    And el CSV incluye todas las columnas visibles

Feature: API para CRM VENTAS

  Scenario: CRM consulta leads con token valido
    Given el CRM VENTAS con un X-Bridge-Token valido
    When hace GET /api/superadmin/leads?status=new
    Then recibe 200 con lista paginada de leads nuevos en JSON

  Scenario: Solicitud sin token es rechazada
    Given una solicitud HTTP sin header X-Bridge-Token
    When hace GET /api/superadmin/leads
    Then recibe 401 Unauthorized
    And el body contiene { "error": "Invalid or missing bridge token" }

  Scenario: CRM actualiza estado de lead
    Given el CRM VENTAS con token valido y un lead_id existente
    When hace POST /api/superadmin/leads/:id/status con status "contacted"
    Then el lead se actualiza en demo_leads
    And se crea registro en demo_lead_status_history
    And se devuelve 200 con el lead actualizado

  Scenario: Rate limiting protege la API
    Given el CRM VENTAS haciendo requests rapidos
    When supera 100 requests en 1 minuto
    Then recibe 429 Too Many Requests
    And el header Retry-After indica cuando puede reintentar
```

---

## 4. Archivos a Crear/Modificar

| Accion | Archivo | Descripcion |
|--------|---------|-------------|
| CREAR | `src/views/superadmin/SuperAdminDashboard.tsx` | Dashboard principal con KPIs, funnel, activity feed |
| CREAR | `src/views/superadmin/SuperAdminLeads.tsx` | Tabla de leads con filtros, busqueda, export |
| CREAR | `src/views/superadmin/SuperAdminLeadDetail.tsx` | Detalle de lead con timeline y notas |
| CREAR | `src/views/superadmin/SuperAdminTenants.tsx` | Lista de todos los tenants |
| CREAR | `src/views/superadmin/SuperAdminMetrics.tsx` | Metricas agregadas con graficas |
| CREAR | `src/components/superadmin/SuperAdminLayout.tsx` | Layout con sidebar propio para superadmin |
| CREAR | `src/components/superadmin/FunnelChart.tsx` | Componente de funnel de conversion |
| CREAR | `src/components/superadmin/ActivityFeed.tsx` | Feed de eventos en tiempo real |
| CREAR | `src/components/superadmin/LeadScoreBadge.tsx` | Badge circular de engagement score |
| CREAR | `src/components/superadmin/LeadTimeline.tsx` | Timeline vertical de eventos del lead |
| CREAR | `backend/middleware/demoTracking.ts` | Middleware de tracking de eventos demo |
| CREAR | `backend/middleware/bridgeAuth.ts` | Middleware de autenticacion por X-Bridge-Token |
| CREAR | `backend/routes/superadmin.ts` | Rutas de la API publica para CRM VENTAS |
| CREAR | `backend/services/engagementScore.ts` | Calculo de engagement score |
| CREAR | `backend/services/demoLeadService.ts` | Logica de negocio para leads demo |
| CREAR | `backend/migrations/xxx_create_demo_tracking_tables.ts` | Migracion para tablas demo_* |
| MODIFICAR | `backend/middleware/auth.ts` | Agregar reconocimiento del rol superadmin |
| MODIFICAR | `backend/routes/index.ts` | Registrar rutas de superadmin |
| MODIFICAR | `backend/handlers/whatsapp.ts` | Agregar tracking en webhook de WhatsApp |
| MODIFICAR | `backend/handlers/appointments.ts` | Agregar tracking al crear citas |
| MODIFICAR | `backend/handlers/auth.ts` | Agregar tracking en login/logout |
| MODIFICAR | `backend/socket.ts` | Agregar room y eventos de superadmin |
| MODIFICAR | `src/router.tsx` | Agregar rutas de /superadmin con guard |
| MODIFICAR | `src/hooks/useAuth.ts` | Agregar logica para rol superadmin |

---

## 5. Data Schema

### Tabla: `demo_sessions`
```sql
CREATE TABLE demo_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id    VARCHAR(255),          -- fingerprint o ID anonimo
  ip            VARCHAR(45),
  user_agent    TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  pages_visited JSONB DEFAULT '[]',    -- [{ "path": "/dashboard", "entered_at": "...", "left_at": "..." }]
  source        JSONB DEFAULT '{}',    -- { "utm_source": "meta", "utm_medium": "cpc", "utm_campaign": "marzo26" }
  tenant_id     UUID REFERENCES tenants(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_sessions_started_at ON demo_sessions(started_at);
CREATE INDEX idx_demo_sessions_visitor_id ON demo_sessions(visitor_id);
```

### Tabla: `demo_leads`
```sql
CREATE TABLE demo_leads (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(255),
  phone                   VARCHAR(50),
  email                   VARCHAR(255),
  source                  VARCHAR(255),          -- utm_source o identificador de campana
  status                  VARCHAR(50) NOT NULL DEFAULT 'new',
                                                  -- new | contacted | appointment_set | qualified | converted | lost
  engagement_score        INTEGER NOT NULL DEFAULT 0,  -- 0-100
  first_seen              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  whatsapp_conversations  INTEGER NOT NULL DEFAULT 0,
  demo_appointments       INTEGER NOT NULL DEFAULT 0,
  notes                   TEXT,
  crm_synced_at           TIMESTAMPTZ,
  tenant_id               UUID REFERENCES tenants(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_leads_status ON demo_leads(status);
CREATE INDEX idx_demo_leads_score ON demo_leads(engagement_score DESC);
CREATE INDEX idx_demo_leads_phone ON demo_leads(phone);
CREATE UNIQUE INDEX idx_demo_leads_phone_unique ON demo_leads(phone) WHERE phone IS NOT NULL;
```

### Tabla: `demo_events`
```sql
CREATE TABLE demo_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES demo_leads(id) ON DELETE CASCADE,
  event_type  VARCHAR(100) NOT NULL,   -- session_start, whatsapp_first_contact, demo_appointment_created, etc.
  event_data  JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_events_lead_id ON demo_events(lead_id);
CREATE INDEX idx_demo_events_type ON demo_events(event_type);
CREATE INDEX idx_demo_events_created_at ON demo_events(created_at);
```

### Tabla: `demo_lead_status_history`
```sql
CREATE TABLE demo_lead_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES demo_leads(id) ON DELETE CASCADE,
  old_status  VARCHAR(50),
  new_status  VARCHAR(50) NOT NULL,
  changed_by  VARCHAR(255) NOT NULL,   -- 'superadmin', 'crm_ventas', 'system'
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_lead_status_history_lead_id ON demo_lead_status_history(lead_id);
```

---

## 6. Riesgos y Mitigacion

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| Bridge token comprometido | ALTO - acceso a todos los leads | Rotacion periodica del token, IP whitelist en nginx, rate limiting estricto |
| Volumen alto de eventos de tracking | MEDIO - impacto en performance | Batch inserts, tabla particionada por mes, cleanup de eventos > 90 dias |
| CRM VENTAS no disponible | BAJO - no afecta tracking | Los datos se almacenan localmente; el CRM hace pull, no push |
| Engagement score desactualizado | BAJO - metricas incorrectas | Recalculo en cada evento + job periodico cada 15 minutos |
| GDPR / privacidad de datos de visitantes | MEDIO - riesgo legal | Anonimizar IPs despues de 30 dias, no almacenar datos sensibles en event_data |
| Socket.io overhead para superadmin | BAJO - conexion extra | Room dedicado, solo emitir eventos si hay un superadmin conectado |
| Fingerprinting de visitantes anonimos | BAJO - precision reducida | Combinar IP + user_agent como visitor_id basico, sin fingerprinting invasivo |

---

## 7. Checkpoint de Soberania

- El rol `superadmin` NO pertenece a ningun tenant; tiene acceso cross-tenant
- Las tablas `demo_*` incluyen `tenant_id` para segmentar datos por clinica demo
- La API publica (`/api/superadmin/*`) bypasea el filtro de tenant ya que es cross-tenant por diseño
- El `X-Bridge-Token` es independiente del sistema JWT de tenants
- Los datos de tracking son propiedad de Dentalogic (Adrian), no de los usuarios demo

## 8. Checkpoint de UI

- SuperAdmin usa el mismo design system premium de Fase 1 (glassmorphism, dark theme)
- Sidebar propio con iconos: Dashboard, Leads, Tenants, Metrics, Export
- Colores de acento: `cyan-500` para KPIs, `violet-500` para funnel, `emerald-500` para conversiones
- FunnelChart: degradado de colores con animacion de entrada
- ActivityFeed: scroll con animacion fadeIn para nuevos eventos
- LeadScoreBadge: circulo con progreso animado, colores: rojo (0-30), amber (31-60), verde (61-100)
- Todo responsive, pero optimizado para desktop (uso interno)
