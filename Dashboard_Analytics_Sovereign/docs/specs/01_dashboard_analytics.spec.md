# 📝 Specification: Dashboard Analytics Sovereign (Refined)

## 1. Context & Objectives
Implementar un sistema de analítica de alto nivel que proporcione visibilidad total sobre la salud financiera, operativa y clínica del tenant, garantizando el aislamiento de datos y la seguridad por roles.

## 2. Requerimientos Técnicos

### 2.1 Esquema de Datos (Sovereign Aggregations)
Todas las agregaciones deben ejecutarse con filtrado obligatorio por `tenant_id` para evitar fugas de información.

#### Agregaciones Críticas:
1. **Appointments (Eficiencia Operativa)**:
   - Tasa de No-Show: `(appointments WHERE status='no_show') / (total_appointments)`.
   - Ocupación de Sillones: `(SUM(duration_minutes) WHERE status='confirmed') / (total_available_minutes)`.
2. **Patients (Crecimiento)**:
   - Leads Convirtiéndose a Pacientes: `COUNT(patients WHERE status='active' AND created_at >= date_range)`.
   - LTV (Lifetime Value): `SUM(total_paid) GROUP BY patient_id`.
3. **Accounting Transactions (Finanzas)**:
   - Revenue Bruto: `SUM(amount) WHERE transaction_type='income'`.
   - ROI de IA: `(Revenue FROM ia_leads - Costo API IA) / Costo API IA`.

### 2.2 UI/UX (Dentalogic Glassmorphism)
El diseño debe seguir el estándar premium de Dentalogic.
- **Layout Rígido**: Contenedor principal con `h-screen` y `overflow-hidden`.
- **Aislamiento de Scroll**: 
  - Sidebar y Topbar fijos.
  - Contenedor de dashlets con `flex-1 min-h-0 overflow-y-auto`.
- **Estética**: `bg-white/60 backdrop-blur-2xl`, bordes `rounded-[2.5rem]`, sombras `shadow-elevated`.

### 2.3 Lógica 'Gala' (Business Intelligence)
- **Filtros Dinámicos**: Toggle superior para cambiar visualización entre `Semanal` y `Mensual` (afecta a todas las queries de agregación).
- **Strategic Tags (Insights)**:
  - `High Performance`: Se activa si la ocupación de sillones es `>75%`.
  - `Critical Attrition`: Se activa si el no-show es `>15%`.
  - `ROI Spark`: Se activa si el ROI de IA supera el `300%`.

### 2.4 Seguridad (Access Control)
- **X-Admin-Token**: Las peticiones de métricas financieras deben incluir el token de administración en el header.
- **Role Enforcement (CEO)**: 
  - Las métricas de flujo (Sala de Espera) son visibles para `secretary` y `ceo`.
  - El acceso a la pestaña de "Finanzas" y "ROI de IA" está restringido estrictamente al rol `ceo`.
  - Si un usuario con rol `secretary` intenta acceder a `/admin/analytics/ceo`, el backend debe responder `403 Forbidden`.

## 3. Criterios de Aceptación (Gherkin)

### Scenario: CEO analyzes monthly ROI
- **Given** a user with role `ceo` and valid `X-Admin-Token`.
- **When** the dashboard is filtered to `Monthly`.
- **Then** the `ROI Spark` tag should appear if ROI > 300%.
- **And** all metrics must belong to the active `tenant_id`.

### Scenario: Secretary attempts to view financial data
- **Given** a user with role `secretary`.
- **When** attempting to fetch `/admin/analytics/ceo` data.
- **Then** the system must return an error and the UI must hide the Financial dashlets.
