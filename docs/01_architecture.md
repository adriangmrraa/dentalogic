# Arquitectura del Sistema - Dentalogic

Este documento describe la estructura técnica, el flujo de datos y la interacción entre los componentes de la plataforma de gestión clínica Mercedes.

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
  - LangChain Agent (Mercedes)
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
- `check_availability(date)`: Consulta disponibilidad real en la base de datos.
- `book_appointment(datetime, reason)`: Registra un nuevo turno y emite eventos WebSocket.
- `triage_urgency(symptoms)`: Clasifica el nivel de dolor/gravedad (emergency, high, normal, low).
- `derivhumano(reason)`: Notifica al profesional y silencia el bot por 24h.

**Gestión de Datos:**
- **Memoria Persistente:** Vincula cada chat con el `patient_id` para mantener la continuidad del tratamiento.
- **Sincronización:** Emite eventos `NEW_APPOINTMENT` vía Socket.IO para actualizar la AgendaView instantáneamente.
- **Multi-Tenancy:** Soporte para múltiples consultorios/clínicas bajo la misma infraestructura.

### C. Frontend React (Puerto 5173) - **Centro de Operaciones**

**Tecnología:** React + Vite + FullCalendar + Socket.IO

**Carpeta:** `frontend_react/`

**Vistas Principales:**
- **Agenda Inteligente:** Calendario interactivo con sincronización de Google Calendar.
- **Perfil 360° del Paciente:** Acceso a historias clínicas, antecedentes y notas de evolución.
- **Monitor de Triaje:** Alertas inmediatas cuando la IA detecta una urgencia grave.

## 3. Base de Datos (PostgreSQL)

### Tablas Principales (Esquema Dental)

| Tabla | Función |
| :--- | :--- |
| **professionals** | Datos de los odontólogos y sus especialidades. |
| **patients** | Registro demográfico y antecedentes médicos (JSONB). |
| **clinical_records** | Evoluciones clínicas, diagnósticos y odontogramas. |
| **appointments** | Gestión de turnos, estados y sincronización GCalendar. |
| **accounting_transactions** | Liquidaciones y cobros de prestaciones. |
### 3.2 Maintenance Robot (Self-Healing)
El sistema utiliza un **Robot de Mantenimiento** integrado en `orchestrator_service/db.py` que garantiza la integridad del esquema en cada arranque:
- **Foundation**: Si no existe la tabla `tenants`, aplica el esquema base completo.
- **Evolution Pipeline**: Una lista de parches (`patches`) en Python que ejecutan bloques `DO $$` para agregar columnas o tablas nuevas de forma idempotente y segura.
- **Resiliencia**: El motor SQL ignora comentarios y respeta bloques de código complejos, evitando errores de sintaxis comunes en despliegues automatizados.

## 4. Flujo de una Urgencia

1. **Paciente** envía audio: "Me duele mucho la muela, está hinchado".
2. **WhatsApp Service** transcribe vía Whisper.
3. **Orchestrator** recibe texto y ejecuta `triage_urgency()`.
4. **IA** clasifica como `high` (Urgencia) y sugiere turnos próximos.
5. **Platform UI** muestra una notificación visual roja al administrativo.
6. **Agente** responde: "Entiendo que es un dolor fuerte. Tengo un hueco hoy a las 16hs, ¿te sirve?".

---

*Documentación Dentalogic © 2026*
