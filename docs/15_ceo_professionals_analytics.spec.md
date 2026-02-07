# Especificación Técnica: Dashboard de Analítica de Profesionales (CEO View)

**Autor:** Antigravity Agent  
**Fecha:** 2026-02-07  
**Estado:** Draft  
**Versión:** 1.0

## 1. Objetivos del Negocio
El CEO requiere una herramienta de **Inteligencia de Negocio (BI)** específica para evaluar el desempeño y la actividad de los profesionales médicos.
El objetivo no es la gestión operativa (CRUD), sino la **toma de decisiones estratégicas** basada en datos.

### Necesidades Clave
1.  **Visibilidad de Desempeño**: Entender qué profesionales generan más valor (turnos completados, ingresos, retención).
2.  **Análisis de Interacciones**: Filtrar y revisar la actividad por "títulos o cosas estratégicas" (interpretado como KPIs cualitativos: Urgencias atendidas, Tratamientos de alto valor, Pacientes nuevos vs Recurrentes).
3.  **Acceso Exclusivo**: Vista restringida al rol `CEO` (o administradores de alto nivel).

## 2. Arquitectura de Datos

### Fuentes de Datos Existentes
*   `professionals`: Perfiles y especialidades.
*   `appointments`: Turnos, estados (`completed`, `cancelled`), tipos de tratamiento.
*   `patients`: Base de pacientes.
*   `google_calendar_blocks`: Disponibilidad y bloqueos.
*   *(Potencial)* `accounting_transactions`: Ingresos por profesional.

### Nuevas Estructuras/Agregaciones (Virtuales o Materializadas)
Para cumplir con "cosas estratégicas", definiremos **Tags/Dimensiones de Análisis**:
1.  **Tasa de Ocupación**: `(Horas Agendadas / Horas Disponibles) * 100`
2.  **Conversión de Citas**: `(Citas Completadas / Citas Totales) * 100`
3.  **Valor del Profesional**: Suma de costos de tratamientos realizados (si `treatments` en `clinical_records` o `accounting` tiene montos).

## 3. Especificación Funcional (UI/UX)

### Nueva Vista: `ProfessionalAnalyticsView.tsx`
Esta vista reemplazará o complementará la actual vista de lista, accesible mediante un toggle "Vista Estratégica" o una ruta separada `/admin/analytics/professionals`.

#### A. Barra Lateral de Filtros (Dashboard Control)
*   **Selector de Profesional**: Multiselect o Single Select.
*   **Rango de Fechas**: "Este Mes", "Último Trimestre", Custom.
*   **Filtros Estratégicos (Chips)**:
    *   *High Performance* (>80% ocupación)
    *   *Urgencies Handler* (Alta tasa de urgencias)
    *   *Retention Master* (Altos pacientes recurrentes)
    *   *New Talent* (< 3 meses antigüedad)

#### B. Tarjetas de KPI (Top Row)
1.  **Pacientes Atendidos**: Total únicos en el periodo.
2.  **Turnos Totales**: Desglose (Realizados / Cancelados).
3.  **Tasa de Ocupación**: Visualización de barra de progreso.
4.  **Ingresos Estimados**: (Si hay datos financieros).

#### C. Gráfico de Actividad (Middle Row)
*   **Línea de Tiempo**: Citas por día/semana comparando profesionales seleccionados.
*   **Heatmap de Disponibilidad**: Días/Horas más concurridos por profesional.

#### D. Tabla de Detalle Estratégico (Bottom Row)
Una tabla rica con columnas ordenables:
*   Nombre del Profesional
*   Especialidad
*   Score de Satisfacción (Simulado o derivado de re-agendamiento)
*   Top Tratamiento Realizado (ej: "Limpieza", "Ortodoncia")
*   Acciones Rápidas (Ver Agenda, Ver Detalle).

## 4. Especificación Técnica (Backend API)

Requiere nuevos endpoints en `admin_routes.py` bajo `/admin/analytics/*`.

### `GET /admin/analytics/professionals/summary`
Retorna métricas agregadas para el rango de fechas.

**Request:**
```json
{
  "start_date": "2025-01-01",
  "end_date": "2025-02-01",
  "professional_ids": [1, 2] (opcional)
}
```

**Response:**
```json
[
  {
    "professional_id": 1,
    "name": "Laura Delgado",
    "total_appointments": 45,
    "completed_rate": 0.95,
    "cancellation_rate": 0.05,
    "occupation_rate": 0.82,
    "top_treatment": "Ortodoncia",
    "strategic_tags": ["High Performance", "Retention Master"]
  }
]
```

### Lógica de Cálculo "Strategic Tags"
*   **High Performance**: Ocupación > 75%.
*   **Retention Master**: > 60% de sus pacientes ya tenían citas previas.
*   **Surgical Expert**: > 30% de sus tratamientos son categoría "Cirugía".

## 5. Criterios de Aceptación
1.  La vista solo es accesible para usuarios con permiso `analytics_view` (CEO).
2.  El dashboard carga en < 2 segundos (cálculos optimizados en SQL).
3.  Los filtros actualizan los KPIs en tiempo real.
4.  Se visualiza claramente la diferencia de rendimiento entre profesionales.

## 6. Plan de Implementación
1.  **Backend**: Crear endpoint de analytics en `admin_routes.py` con queries SQL de agregación.
2.  **Frontend**: Crear componente `ProfessionalAnalyticsView` usando Recharts para gráficos.
3.  **Integración**: Conectar vista con endpoint.
4.  **Verificación**: `@[/audit]` contra este spec.
