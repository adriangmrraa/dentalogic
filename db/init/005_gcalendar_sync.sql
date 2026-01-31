-- ==================================================================================
-- FASE 1.5: GOOGLE CALENDAR SYNC - ESPEJO BIDIRECCIONAL
-- ==================================================================================
-- Agrega campos para distinguir turnos AI vs Manual y sincronización con GCalendar
-- ==================================================================================

-- ==================== AGREGAR CAMPO SOURCE A TURNOS ====================
-- Distingue entre turnos creados por IA ('ai') vs manualmente ('manual')

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'ai';

-- Actualizar turnos existentes sin source
UPDATE appointments SET source = 'ai' WHERE source IS NULL;

-- Crear índice para búsquedas rápidas por source
CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments(source);

-- ==================== TABLA DE BLOQUEOS DE GOOGLE CALENDAR ====================
-- Almacena bloques de tiempo que vienen de GCalendar (reuniones, vacaciones, etc.)

CREATE TABLE IF NOT EXISTS google_calendar_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identificación del evento en GCalendar
    google_event_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Datos del bloqueo
    title VARCHAR(255) NOT NULL,           -- Ej: "Reunión de equipo", "Vacaciones Dr. García"
    description TEXT,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    
    -- Recursos afectados (opcional)
    professional_id INTEGER REFERENCES professionals(id) ON DELETE CASCADE,
    
    -- Estado de sync
    sync_status VARCHAR(20) DEFAULT 'synced',  -- 'synced', 'pending', 'failed'
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gcalendar_blocks_tenant ON google_calendar_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gcalendar_blocks_datetime ON google_calendar_blocks(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_gcalendar_blocks_professional ON google_calendar_blocks(professional_id);
CREATE INDEX IF NOT EXISTS idx_gcalendar_blocks_sync_status ON google_calendar_blocks(sync_status);

-- ==================== TABLA DE LOG DE SINCRONIZACIÓN ====================

CREATE TABLE IF NOT EXISTS calendar_sync_log (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    sync_type VARCHAR(50) NOT NULL,           -- 'full', 'incremental', 'manual'
    direction VARCHAR(20) NOT NULL,           -- 'inbound', 'outbound', 'bidirectional'
    
    events_processed INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_deleted INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_tenant ON calendar_sync_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_date ON calendar_sync_log(started_at DESC);

-- ==================== NOTAS ====================

-- Esta migración habilita:
-- 1. Distinguir turnos AI (azul) vs Manual (verde) en la agenda visual
-- 2. Mostrar bloques de GCalendar (gris) como indisponibles
-- 3. Sincronización bidireccional con Google Calendar
-- 4. Prevención de colisiones al agendar turnos

-- Próximos pasos:
-- 1. Implementar Google Calendar API OAuth2 flow
-- 2. Crear worker para sync periódico
-- 3. Webhook para eventos de GCalendar en tiempo real
