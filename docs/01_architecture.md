# Arquitectura del Sistema - Dentalogic

Este documento describe la estructura técnica, el flujo de datos y la interacción entre los componentes de la plataforma de gestión clínica Dentalogic.

## 1. Diagrama de Bloques (Conceptual)

```
Usuario WhatsApp (Paciente)
        |
        | Audio/Texto
        v
WhatsApp Service (8002)
  - YCloud Webhook
  - Deduplicación (Redis)
  - Transcripción (Whisper)
        |
        | POST /chat
        v
Orchestrator Service (8000)
  - LangChain Agent (Asistente Dental)
  - Tools Clínicas (Agenda, Triaje)
  - Memoria Histórica (Postgres)
  - Lockout (24h)
  - Socket.IO Server (Real-time)
        |
    ____|____
   /    |    \
  v     v     v
PostgreSQL Redis OpenAI
(Historias)(Locks)(LLM)
   |
   v
Frontend React (5173)
Centro de Operaciones Dental
   |
   | WebSocket (Socket.IO)
   v
AgendaView / Odontograma
   - FullCalendar
   - Real-time updates
```

## 2. Estructura de Microservicios (Dentalogic)

### A. WhatsApp Service (Puerto 8002)

**Tecnología:** FastAPI + httpx + Redis

**Función:** Interfaz de comunicación con pacientes vía YCloud.

**Responsabilidades:**
- **Transcripción Whisper:** Convierte audios de síntomas en texto para el análisis de la IA.
- **Deduplicación:** Evita procesar el mismo mensaje de WhatsApp múltiples veces.
- **Buffering:** Agrupa mensajes enviados en ráfaga para dar un contexto completo.
- **Relay de Audio:** Permite que los audios sean escuchados por humanos en el dashboard.

### B. Orchestrator Service (Puerto 8000) - **Coordinador Clínico**

**Tecnología:** FastAPI + LangChain + OpenAI + PostgreSQL

**Función:** Procesamiento de lenguaje natural, clasificación de urgencias y gestión de agenda.

**Tools Clínicas Integradas:**
- `check_availability(date)`: Implementa lógica **Just-in-Time (JIT)** v2.
  1. **Limpieza de Identidad:** Normaliza nombres de profesionales (elimina títulos como "Dr."/"Dra.").
  2. **Mirroring en Vivo:** Consulta eventos a Google Calendar API en tiempo real.
  3. **Deduping Inteligente:** Filtra eventos de GCal que ya son citas del sistema (`appointments`).
  4. **Cálculo de Huecos:** Combina `appointments` locales + bloqueos externos de GCal.
- `book_appointment(...)`: 
  - **Protocolo Service-First (2026-02-08)**: La IA indaga el servicio clínico antes de los datos del paciente para garantizar que la duración del turno sea correcta.
  - Valida datos obligatorios para leads (DNI, Obra Social).
  - Registra turno en PG + GCal.
  - Emite eventos WebSocket (`NEW_APPOINTMENT`) para actualizar UI.

**Gestión de Datos:**
- **Memoria Persistente:** Vincula cada chat con el `patient_id`.
- **Sincronización Real-Time (Omnipresente v3):** 
  - Server Socket.IO (namespace `/`) emite eventos: `NEW_APPOINTMENT`, `APPOINTMENT_UPDATED`, `APPOINTMENT_DELETED`.
  - **Frontend Listeners Optimizados (2026-02-08)**:
    - Ambos eventos `NEW_APPOINTMENT` y `APPOINTMENT_UPDATED` ahora ejecutan `calendarApi.refetchEvents()` 
    - Este método re-carga todos los eventos desde las sources configuradas (DB + Google Calendar blocks)
    - Garantiza sincronización total y consistencia en todas las sesiones activas
    - Elimina riesgo de duplicados o estados desincronizados del método manual anterior (`addEvent()`, `setProp()`)
  - **Auto-Sync Silencioso**: 
    - La sincronización con Google Calendar ocurre automáticamente al cargar `AgendaView`
    - No requiere intervención manual del usuario (botón "Sync" removido en v3 hito 2026-02-08)
    - Delay de 800ms post-sync garantiza que los writes en DB se completen antes del fetch
- **Urgencia y Triaje (Clinical Triage v1):**
  - Los pacientes ahora poseen un `urgency_level` (`low`, `medium`, `high`, `emergency`).
  - La UI de la agenda resalta automáticamente los turnos con urgencia `high` o superior mediante bordes y efectos pulsantes.
- **UUID Serialization Fix (Backend):**
  - Endpoints de actualización de estado (`PUT /admin/appointments/{id}/status`) ahora convierten UUID a string antes de JSON response
  - Eliminado error `TypeError: Object of type UUID is not JSON serializable`
- **Multi-Tenancy:** Soporte para múltiples consultorios/clínicas.
- **Sovereign Analytics Engine (v1 2026-02-08):**
  - **Propósito**: Consolidar métricas operativas y financieras en un dashboard centralizado.
  - **Lógica de Ingresos**: Basada estrictamente en asistencia confirmada (`attended` o `completed`).
  - **Eficiencia de IA**: Las "Conversaciones IA" se calculan como hilos únicos por paciente (`COUNT(DISTINCT from_number)`), no por volumen de mensajes individuales.
  - **Filtrado Dinámico**: Soporte nativo para rangos `weekly` (7 días) y `monthly` (30 días).
  - **Triage Monitoring**: Integración directa con el flujo de detección de urgencias IA.

### D. Sistema de Layout y Scroll (SaaS-style)

**Tecnología:** Flexbox + `min-h-0` + Overflow Isolation

**Arquitectura de Visualización:**
- **Layout Global Rígido:** El contenedor principal (`Layout.tsx`) utiliza `h-screen` y `overflow-hidden` para eliminar el scroll de la página completa, siguiendo el estándar **Sovereign Glass**.
- **Aislamiento de Scroll:** Cada vista maestra gestiona su propio desplazamiento interno mediante `flex-1 min-h-0 overflow-auto`.
- **ProfessionalsView (Vista Maestra):** Implementa un sistema de **Overflow Isolation** donde el grid fluye de forma independiente.
- **Mobile-First Evolution (Hito Agenda 2.0):**
    - **`MobileAgenda`**: Nueva capa de visualización vertical optimizada para pantallas pequeñas, activada automáticamente vía `@media` queries o JS detection.
    - **`DateStrip`**: Navegador de fechas horizontal táctil que permite cambiar el foco del calendario sin recargar la página.
- **Odontograma y Pantallas de Alta Densidad:** Utilizan el patrón de **Sub-Scrolling**, permitiendo que herramientas complejas mantengan sus controles visibles mientras los diagramas scrollean.
- **ChatsView Rígido:** Implementa una jerarquía flex con `min-h-0` que fuerza el scroll únicamente en el área de mensajes.

## 6. Paginación y Carga Incremental

Para optimizar el rendimiento en conversaciones extensas, Dentalogic utiliza un sistema de carga bajo demanda:
- **Backend (Admin API)**: Soporta parámetros `limit` y `offset` para consultas SQL (`LIMIT $2 OFFSET $3`).
- **Frontend (ChatsView)**:
    - Carga inicial: Últimos 50 mensajes.
    - Botón "Cargar más": Recupera bloques anteriores y los concatena al estado, manteniendo la posición visual.
    - Estado `hasMoreMessages`: Controla la disponibilidad de historial en el servidor.

### C. Frontend React (Puerto 80) - **Centro de Operaciones**

**Tecnología:** React + Vite + FullCalendar + Socket.IO

**Carpeta:** `frontend_react/`

**Vistas Principales:**
- **Agenda Inteligente:** Calendario interactivo con sincronización de Google Calendar.
- **Perfil 360° del Paciente:** Acceso a historias clínicas, antecedentes y notas de evolución.
- **Monitor de Triaje:** Alertas inmediatas cuando la IA detecta una urgencia grave.
- **Modales IA-Aware:** Los modales de edición (especialmente en `Profesionales`) están sincronizados con la lógica de la IA, permitiendo configurar `working_hours` que el agente respeta estrictamente durante la reserva de turnos.

## 3. Base de Datos (PostgreSQL)

### Tablas Principales (Esquema Dental)

| Tabla | Función |
| :--- | :--- |
| **professionals** | Datos de los odontólogos y sus especialidades. |
| **patients** | Registro demográfico y antecedentes médicos (JSONB). |
| **clinical_records** | Evoluciones clínicas, diagnósticos y odontogramas. |
| **appointments** | Gestión de turnos, estados y sincronización GCalendar. |
| **accounting_transactions** | Liquidaciones y cobros de prestaciones. |
| **users** | Credenciales, roles y estado de aprobación. |

### 3.2 Maintenance Robot (Self-Healing)
El sistema utiliza un **Robot de Mantenimiento** integrado en `orchestrator_service/db.py` que garantiza la integridad del esquema en cada arranque:
- **Foundation**: Si no existe la tabla `tenants`, aplica el esquema base completo.
- **Evolution Pipeline**: Una lista de parches (`patches`) en Python que ejecutan bloques `DO $$` para agregar columnas o tablas nuevas de forma idempotente y segura.
- **Resiliencia**: El motor SQL ignora comentarios y respeta bloques de código complejos, evitando errores de sintaxis comunes en despliegues automatizados.

## 4. Seguridad e Identidad (Auth Layer)

Dentalogic implementa una arquitectura de **Seguridad de Triple Capa**:

1.  **Capa de Identidad (JWT)**: Gestión de sesiones de usuario con tokens firmados (HS256). Define el rol (`ceo`, `professional`, `secretary`) y el `tenant_id`.
2.  **Capa de Infraestructura (X-Admin-Token)**: Las rutas administrativas críticas requieren un token estático (`INTERNAL_SECRET_KEY`) para prevenir accesos no autorizados incluso si la sesión del usuario es válida.
3.  **Capa de Gatekeeper (Aprobación)**: Todo registro nuevo entra en estado `pending`. Solo un usuario con rol `ceo` puede activar cuentas desde el panel de control.

## 5. Flujo de una Urgencia

---

## 5. Flujo de una Urgencia

1. **Paciente** envía audio: "Me duele mucho la muela, está hinchado".
2. **WhatsApp Service** transcribe vía Whisper.
3. **Orchestrator** recibe texto y ejecuta `triage_urgency()`.
4. **IA** clasifica como `high` (Urgencia) y sugiere turnos próximos.
5. **Platform UI** muestra una notificación visual roja al administrativo.
6. **Agente** responde: "Entiendo que es un dolor fuerte. Tengo un hueco hoy a las 16hs, ¿te sirve?".

---

*Documentación Dentalogic © 2026*
泛
