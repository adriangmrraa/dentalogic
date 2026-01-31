-- ==================================================================================
-- FASE 1.6: CONFIGURACIÓN DE TRATAMIENTOS
-- ==================================================================================
-- Agrega tabla de configuración de tratamientos con duraciones
-- Alimenta la lógica de book_appointment() para agENDAMIENTO inteligente
-- ==================================================================================

-- ==================== TABLA DE TIPOS DE TRATAMIENTO ====================
-- Configuración de tratamientos con duraciones y complejidad

CREATE TABLE IF NOT EXISTS treatment_types (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identificación del tratamiento
    code VARCHAR(50) NOT NULL,              -- 'cleaning', 'root_canal', 'emergency', etc.
    name VARCHAR(100) NOT NULL,             -- 'Limpieza', 'Endodoncia', 'Consulta Urgente'
    description TEXT,
    
    -- Configuración de duración (inteligente según complejidad)
    default_duration_minutes INTEGER NOT NULL DEFAULT 30,
    min_duration_minutes INTEGER NOT NULL DEFAULT 15,
    max_duration_minutes INTEGER NOT NULL DEFAULT 120,
    
    -- Complejidad del tratamiento
    complexity_level VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'emergency'
    
    -- Categoría
    category VARCHAR(50),                   -- 'prevention', 'restorative', 'surgical', 'orthodontics', 'emergency'
    
    -- Configuración de agendamiento
    requires_multiple_sessions BOOLEAN DEFAULT FALSE,
    session_gap_days INTEGER DEFAULT 0,     -- Días entre sesiones si requiere múltiples
    
    -- Estado
    is_active BOOLEAN DEFAULT TRUE,
    is_available_for_booking BOOLEAN DEFAULT TRUE,
    
    -- Notas internas
    internal_notes TEXT,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_treatment_types_tenant ON treatment_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_treatment_types_code ON treatment_types(code);
CREATE INDEX IF NOT EXISTS idx_treatment_types_category ON treatment_types(category);
CREATE INDEX IF NOT EXISTS idx_treatment_types_active ON treatment_types(is_active, is_available_for_booking);

-- Constraint: Código único por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_treatment_types_tenant_code 
ON treatment_types(tenant_id, code);

-- ==================== DATOS POR DEFECTO: TRATAMIENTOS DENTALES ====================

-- Insertar tratamientos por defecto si no existen
INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'checkup',
    'Control/Checkup',
    'Revisión general y evaluación de salud bucodental',
    20,
    15,
    30,
    'low',
    'prevention',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'checkup'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'cleaning',
    'Limpieza Dental',
    'Profilaxis y limpieza profesional',
    30,
    20,
    45,
    'low',
    'prevention',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'cleaning'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'emergency',
    'Consulta Urgente',
    'Atención de urgencia odontológica',
    15,
    10,
    30,
    'emergency',
    'emergency',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'emergency'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'extraction',
    'Extracción Dental',
    'Extracción simple o quirúrgica de pieza dental',
    30,
    20,
    60,
    'medium',
    'surgical',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'extraction'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'root_canal',
    'Endodoncia',
    'Tratamiento de conducto',
    60,
    45,
    90,
    'high',
    'restorative',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'root_canal'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'restoration',
    'Restauración/Obturación',
    'Empastes y reconstrucciones',
    30,
    20,
    45,
    'medium',
    'restorative',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'restoration'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'orthodontics',
    'Ortodoncia',
    'Colocación de aparato de ortodoncia',
    45,
    30,
    60,
    'high',
    'orthodontics',
    TRUE,
    7,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'orthodontics'
);

INSERT INTO treatment_types (
    tenant_id, code, name, description, default_duration_minutes, 
    min_duration_minutes, max_duration_minutes, complexity_level, category,
    requires_multiple_sessions, is_active, is_available_for_booking
)
SELECT 
    t.id,
    'consultation',
    'Consulta General',
    'Primera consulta o evaluación',
    30,
    15,
    45,
    'low',
    'prevention',
    FALSE,
    TRUE,
    TRUE
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM treatment_types tt 
    WHERE tt.tenant_id = t.id AND tt.code = 'consultation'
);

-- ==================== FUNCIÓN PARA OBTENER DURACIÓN ====================

CREATE OR REPLACE FUNCTION get_treatment_duration(
    p_treatment_code VARCHAR,
    p_tenant_id INTEGER,
    p_urgency_level VARCHAR DEFAULT 'normal'
) RETURNS INTEGER AS $$
DECLARE
    v_duration INTEGER;
    v_min_duration INTEGER;
    v_max_duration INTEGER;
BEGIN
    SELECT default_duration_minutes, min_duration_minutes, max_duration_minutes
    INTO v_duration, v_min_duration, v_max_duration
    FROM treatment_types
    WHERE code = p_treatment_code
      AND tenant_id = p_tenant_id
      AND is_active = TRUE
      AND is_available_for_booking = TRUE;
    
    -- Si no encuentra el tratamiento, usar duración por defecto
    IF v_duration IS NULL THEN
        RETURN 30;
    END IF;
    
    -- Ajustar según urgencia
    IF p_urgency_level = 'emergency' THEN
        RETURN LEAST(v_min_duration, v_duration);
    ELSIF p_urgency_level IN ('high', 'normal') THEN
        RETURN v_duration;
    ELSE
        -- low urgency - maybe longer slot
        RETURN GREATEST(v_duration, v_max_duration);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ==================== NOTAS ====================

-- Esta migración habilita:
-- 1. Configuración centralizada de tratamientos y duraciones
-- 2. Lógica inteligente de duración según complejidad
-- 3. Ajuste automático según nivel de urgencia
-- 4. Soporte para tratamientos que requieren múltiples sesiones

-- Para usar en book_appointment():
-- SELECT get_treatment_duration('root_canal', tenant_id, urgency_level)
-- para obtener la duración correcta del turno
