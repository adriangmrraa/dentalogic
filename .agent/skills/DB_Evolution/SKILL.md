---
name: "DB Schema Surgeon"
description: "Gestión del esquema PostgreSQL, Auto-Healing y arquitectura RAG híbrida."
trigger: "base de datos, modelos, migraciones, tablas, RAG, schema, SQL"
scope: "DATABASE"
auto-invoke: true
---

# DB Schema Surgeon - Dentalogic

# DB Schema Surgeon - Dentalogic

## 1. Patrón de Acceso a Datos (Direct asyncpg)
Dentalogic prioriza el uso de SQL puro sobre `asyncpg` para máxima velocidad e hilos no bloqueantes. No usamos SQLAlchemy ORM de forma extensiva.

### Conector Principal (`orchestrator_service/db.py`):
```python
from db import pool

# Fetch row simple
patient = await db.pool.fetchrow("SELECT * FROM patients WHERE phone_number = $1", phone)
```

## 2. Esquema Core (Citas y Salud)

### Tabla `appointments` (El Corazón)
```sql
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id),
    appointment_datetime TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled
    urgency_level VARCHAR(50) DEFAULT 'normal', -- normal, high, emergency
    google_calendar_event_id TEXT,
    google_calendar_sync_status VARCHAR(50) DEFAULT 'pending'
);
```

### Tabla `patients`
```sql
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT UNIQUE,
    clinical_history TEXT
);
```

## 3. Gestor de Migraciones Manuales
Cuando necesites agregar una columna o índice, creá un script SQL en `orchestrator_service/scripts/` o ejecútalo directamente vía `db.pool`.

**Ejemplo de agregado de Urgencia**:
```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS triage_notes TEXT;
```

## 4. Integración con Google Calendar
Sincronizar siempre el `google_calendar_event_id` para evitar duplicados. Si un turno se cancela en la BD, **debe** dispararse la cancelación en el `gcal_service`.

## 5. Checklist de Base de Datos
- [ ] ¿La query usa `$1`, `$2` para prevenir SQL Injection?
- [ ] ¿Los índices están en `phone_number` y `appointment_datetime`?
- [ ] ¿Se manejan correctamente los husos horarios (TIMESTAMPTZ)?
- [ ] ¿Se emiten logs precisos en caso de fallo de conexión al pool?
