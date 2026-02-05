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

## 3. Gestor de Migraciones (Maintenance Robot)
Dentalogic utiliza un sistema de **Self-Healing** y **Evolución Continua** en `orchestrator_service/db.py`.

### Arquitectura de Dos Capas:
1.  **Foundation**: Si la tabla `tenants` no existe, se aplica `dentalogic_schema.sql` completo.
2.  **Evolution Pipeline**: Una lista de parches en `db.py` que se ejecutan en cada arranque.

### Reglas para Evolucionar el Esquema:
- **NUNCA** hagas migraciones manuales en producción.
- **SIEMPRE** agrega un parche a la lista `patches` en `db.py`.
- **SINTAXIS**: Usa bloques `DO $$ BEGIN ... END $$` con `IF NOT EXISTS` para cualquier `ALTER TABLE` o `CREATE TABLE`.

**Ejemplo de Parche Seguro:**
```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professionals' AND column_name='specialty_code') THEN
        ALTER TABLE professionals ADD COLUMN specialty_code VARCHAR(10);
    END IF;
END $$;
```

## 4. Sincronización de Archivos SQL
Mantén siempre sincronizado el archivo raíz con el del orquestador usando:
```bash
powershell -ExecutionPolicy Bypass -File ./sync-schema.ps1
```

## 5. Integración con Google Calendar
Sincronizar siempre el `google_calendar_event_id` para evitar duplicados. Si un turno se cancela en la BD, **debe** dispararse la cancelación en el `gcal_service`.

## 6. Checklist de Base de Datos
- [ ] ¿El cambio está en el Evolution Pipeline de `db.py`?
- [ ] ¿El bloque `DO` verifica la existencia antes de alterar?
- [ ] ¿Se sincronizó el `dentalogic_schema.sql` para nuevas instalaciones?
- [ ] ¿La query usa `$1`, `$2` para prevenir SQL Injection?
- [ ] ¿Los índices están en los campos de búsqueda frecuentes?
