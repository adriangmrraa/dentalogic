-- ==================================================================================
-- FASE 1: EVOLUCIÓN DE DATOS - PLATAFORMA DENTAL PARA MERCEDES
-- ==================================================================================
-- Archivo de migración que extiende Nexus v3 para soportar lógica dental
-- Compatible con la infraestructura multi-tenant existente
-- ==================================================================================

-- ==================== TABLA DE PROFESIONALES (Requisito previo) ====================

CREATE TABLE IF NOT EXISTS professionals (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identidad
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    license_number VARCHAR(100) UNIQUE,  -- Matrícula profesional
    specialization VARCHAR(100),          -- Ej: "Endodoncia", "Ortodoncia"
    
    -- Disponibilidad
    is_active BOOLEAN DEFAULT TRUE,
    schedule_json JSONB DEFAULT '{}',     -- {"monday": ["09:00-13:00", "14:00-18:00"], ...}
    
    -- Contacto
    email VARCHAR(255),
    phone VARCHAR(20),
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professionals_active ON professionals(is_active);

-- ==================== TABLA DE PACIENTES ====================

CREATE TABLE IF NOT EXISTS patients (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identidad del Paciente
    phone_number VARCHAR(20) NOT NULL,  -- WhatsApp primary key
    dni VARCHAR(15) NOT NULL,            -- Documento Nacional de Identidad
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE,
    gender VARCHAR(10),                  -- 'M', 'F', 'Other'
    
    -- Obra Social (Insurance)
    insurance_provider VARCHAR(100),     -- Ej: "OSDE", "SWISS", "Sanatorio Allende"
    insurance_id VARCHAR(50),            -- Número de afiliado
    insurance_valid_until DATE,          -- Vencimiento de cobertura
    
    -- Anamnesis (JSONB: Historial Médico)
    medical_history JSONB DEFAULT '{}',  -- {
                                         --   "allergies": ["Penicilina", "Ibuprofeno"],
                                         --   "medical_conditions": ["Diabetes", "Hipertensión"],
                                         --   "medications": ["Metformina 1000mg"],
                                         --   "past_treatments": ["Blanqueamiento 2023"],
                                         --   "systemic_diseases": true,
                                         --   "last_checkup": "2024-01-15"
                                         -- }
    
    -- Datos de Contacto
    email VARCHAR(255),
    alternative_phone VARCHAR(20),
    
    -- Estado del Paciente
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'inactive', 'archived'
    preferred_schedule VARCHAR(50),       -- Ej: "Mañana", "Tarde", "Fin de semana"
    notes TEXT,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_visit TIMESTAMPTZ,
    
    -- Constraints
    UNIQUE (tenant_id, phone_number),
    UNIQUE (tenant_id, dni)
);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_phone ON patients(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_dni ON patients(tenant_id, dni);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_insurance ON patients(insurance_provider);

-- ==================== TABLA DE HISTORIAS CLÍNICAS ====================

CREATE TABLE IF NOT EXISTS clinical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Metadata del Registro
    record_date DATE NOT NULL DEFAULT CURRENT_DATE,
    professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
    
    -- Odontograma (JSONB: Representación gráfica de dientes)
    odontogram JSONB DEFAULT '{}',  -- {
                                    --   "tooth_32": {
                                    --     "number": 32,
                                    --     "status": "healthy|caries|missing|implant|crowned",
                                    --     "surfaces": {
                                    --       "occlusal": "healthy|caries",
                                    --       "mesial": "healthy|caries",
                                    --       "distal": "healthy|caries",
                                    --       "buccal": "healthy|caries",
                                    --       "lingual": "healthy|caries"
                                    --     },
                                    --     "notes": "Caries inicial en superficie oclusal"
                                    --   }
                                    -- }
    
    -- Diagnósticos Principales
    diagnosis TEXT,
    
    -- Tratamientos Realizados (Array de objetos)
    treatments JSONB DEFAULT '[]',   -- [
                                     --   {
                                     --     "date": "2025-01-15",
                                     --     "type": "cleaning|filling|extraction|root_canal|crown",
                                     --     "description": "Profilaxis con fluoruro",
                                     --     "teeth": [11, 12, 13],
                                     --     "cost": 500,
                                     --     "insurance_covered": true
                                     --   }
                                     -- ]
    
    -- Radiografías & Documentación
    radiographs JSONB DEFAULT '[]',  -- [
                                     --   {
                                     --     "date": "2025-01-15",
                                     --     "type": "panoramic|intraoral|bitewing",
                                     --     "storage_url": "s3://bucket/x-ray-123.jpg",
                                     --     "notes": "Radiografía de seguimiento"
                                     --   }
                                     -- ]
    
    -- Plan de Tratamiento Futuro
    treatment_plan JSONB DEFAULT '{}',  -- {
                                        --   "estimated_sessions": 5,
                                        --   "planned_treatments": ["Endodoncia 11", "Corona 12"],
                                        --   "estimated_cost": 15000,
                                        --   "priority": "high|medium|low"
                                        -- }
    
    -- Observaciones Clínicas
    clinical_notes TEXT,
    recommendations TEXT,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient ON clinical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_records_tenant ON clinical_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinical_records_date ON clinical_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_records_professional ON clinical_records(professional_id);

-- ==================== TABLA DE TURNOS / CITAS ====================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Datos del Turno
    appointment_datetime TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    
    -- Asignación de Recursos
    chair_id INTEGER,                 -- Sillón/Box número (para dashboard visual)
    professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
    
    -- Tipo de Cita
    appointment_type VARCHAR(50) NOT NULL,  -- 'checkup', 'cleaning', 'treatment', 'emergency', 'followup'
    notes TEXT,
    
    -- Sincronización con Google Calendar
    google_calendar_event_id VARCHAR(255),
    google_calendar_sync_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'synced', 'failed'
    
    -- Urgencia (detectada por AI triage)
    urgency_level VARCHAR(20) DEFAULT 'normal',  -- 'low', 'normal', 'high', 'emergency'
    urgency_reason TEXT,                        -- Ej: "Dolor agudo en molar"
    
    -- Estado del Turno
    status VARCHAR(20) DEFAULT 'scheduled',  -- 'scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show'
    cancellation_reason TEXT,
    cancellation_by VARCHAR(50),              -- 'patient', 'clinic', 'system'
    
    -- Recordatorio (SMS/WhatsApp por AI)
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_sent_at TIMESTAMPTZ,
    
    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_datetime ON appointments(appointment_datetime);
CREATE INDEX IF NOT EXISTS idx_appointments_chair ON appointments(chair_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_urgency ON appointments(urgency_level);
CREATE INDEX IF NOT EXISTS idx_appointments_google_sync ON appointments(google_calendar_sync_status);

-- ==================== TABLA DE TRANSACCIONES CONTABLES ====================

CREATE TABLE IF NOT EXISTS accounting_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    
    -- Tipo de Transacción
    transaction_type VARCHAR(50) NOT NULL,  -- 'payment', 'insurance_claim', 'expense', 'refund'
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Monto
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    
    -- Detalles del Pago
    payment_method VARCHAR(50),             -- 'cash', 'card', 'transfer', 'insurance'
    description TEXT,
    
    -- Obra Social / Insurance
    insurance_claim_id VARCHAR(100),        -- Para rastreo OSDE, etc.
    insurance_covered_amount NUMERIC(12, 2) DEFAULT 0,
    patient_paid_amount NUMERIC(12, 2) DEFAULT 0,
    
    -- Estado
    status VARCHAR(20) DEFAULT 'completed',  -- 'pending', 'completed', 'failed'
    
    -- Auditoría
    recorded_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_tenant ON accounting_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_patient ON accounting_transactions(patient_id);
CREATE INDEX IF NOT EXISTS idx_accounting_date ON accounting_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_type ON accounting_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_accounting_status ON accounting_transactions(status);

-- ==================== TABLA DE REPORTE DE CAJA DIARIA ====================

CREATE TABLE IF NOT EXISTS daily_cash_flow (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Fecha
    cash_date DATE NOT NULL,
    
    -- Totales
    total_cash_received NUMERIC(12, 2) DEFAULT 0,
    total_card_received NUMERIC(12, 2) DEFAULT 0,
    total_insurance_claimed NUMERIC(12, 2) DEFAULT 0,
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    
    -- Saldo
    net_balance NUMERIC(12, 2) DEFAULT 0,
    
    -- Registro
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    recorded_by VARCHAR(100),
    notes TEXT,
    
    -- Constraint: Una sola entrada por fecha/tenant
    UNIQUE (tenant_id, cash_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_cash_flow_tenant ON daily_cash_flow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_cash_flow_date ON daily_cash_flow(cash_date);

-- ==================== NOTAS DE MIGRACIÓN ====================

-- Esta migración es idempotente (IF NOT EXISTS en todas las tablas)
-- Compatible con Nexus v3 multi-tenant: todas las tablas incluyen tenant_id
-- JSONB se utiliza para:
--   - medical_history: Anamnesis flexible (alergias, condiciones, medicinas)
--   - odontogram: Representación gráfica de dientes (estado por diente y superficie)
--   - treatments: Historial de tratamientos realizados
--   - radiographs: URLs y metadatos de radiografías
--   - treatment_plan: Plan futuro de tratamientos
--   - schedule_json (professionals): Horarios disponibles por día

-- Los índices están optimizados para:
--   - Búsqueda por paciente + tenant
--   - Búsqueda de citas por fecha/hora
--   - Filtrado por urgencia y estado
--   - Sincronización con Google Calendar
--   - Consultas contables por fecha y tipo

-- Próximos pasos (FASE 2):
--   1. Reemplazar tools de Tienda Nube en orchestrator_service/main.py
--   2. Implementar check_availability(), book_appointment(), triage_urgency()
--   3. Integración con Google Calendar API (OAuth2 flow)
--   4. Adaptar sys_template para "Asistente Dental Profesional"
