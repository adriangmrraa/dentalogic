import asyncpg
import os
import json
from typing import List, Tuple, Optional

POSTGRES_DSN = os.getenv("POSTGRES_DSN")


class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Conecta al pool de PostgreSQL y ejecuta auto-migraciones."""
        if not self.pool:
            if not POSTGRES_DSN:
                print("❌ ERROR: POSTGRES_DSN environment variable is not set!")
                return

            # asyncpg no soporta el esquema 'postgresql+asyncpg', solo 'postgresql' o 'postgres'
            dsn = POSTGRES_DSN.replace("postgresql+asyncpg://", "postgresql://")

            try:
                self.pool = await asyncpg.create_pool(dsn)
            except Exception as e:
                print(f"❌ ERROR: Failed to create database pool: {e}")
                return

            # Auto-Migration: Ejecutar dentalogic_schema.sql si las tablas no existen
            await self._run_auto_migrations()

    async def _run_auto_migrations(self):
        """
        Sistema de Auto-Migración (Maintenance Robot / Schema Surgeon).
        Se asegura de que la base de datos esté siempre actualizada y saludable.
        """
        import logging

        logger = logging.getLogger("db")

        try:
            # 1. Auditoría de Salud: ¿Existe la base mínima?
            async with self.pool.acquire() as conn:
                schema_exists = await conn.fetchval("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'tenants'
                    )
                """)

            # 2. Aplicar Base (Foundation) si es un Fresh Install
            if not schema_exists:
                logger.warning("⚠️ Base de datos vacía, aplicando Foundation...")
                await self._apply_foundation(logger)

            # 3. Evolución Continua (Pipeline de Cirugía)
            # Aquí agregamos parches específicos que deben correr siempre de forma segura
            await self._run_evolution_pipeline(logger)

            logger.info(
                "✅ Base de datos verificada y actualizada (Maintenance Robot OK)"
            )

        except Exception as e:
            import traceback

            logger.error(f"❌ Error en Maintenance Robot: {e}")
            logger.error(traceback.format_exc())

    async def _apply_foundation(self, logger):
        """Ejecuta el esquema base dentalogic_schema.sql"""
        possible_paths = [
            os.path.join(
                os.path.dirname(__file__), "..", "db", "init", "dentalogic_schema.sql"
            ),
            os.path.join(
                os.path.dirname(__file__), "db", "init", "dentalogic_schema.sql"
            ),
            "/app/db/init/dentalogic_schema.sql",
        ]

        schema_path = next((p for p in possible_paths if os.path.exists(p)), None)
        if not schema_path:
            logger.error("❌ Foundation schema not found!")
            return

        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()

        # Limpiar comentarios y separar sentencias respetando $$
        clean_lines = [line.split("--")[0].rstrip() for line in schema_sql.splitlines()]
        clean_sql = "\n".join(clean_lines)

        statements = []
        current_stmt = []
        in_dollar = False
        for line in clean_sql.splitlines():
            if "$$" in line:
                in_dollar = not in_dollar if line.count("$$") % 2 != 0 else in_dollar
            current_stmt.append(line)
            if not in_dollar and ";" in line:
                full = "\n".join(current_stmt).strip()
                if full:
                    statements.append(full)
                current_stmt = []

        if current_stmt:
            leftover = "\n".join(current_stmt).strip()
            if leftover:
                statements.append(leftover)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for i, stmt in enumerate(statements):
                    await conn.execute(stmt)
        logger.info(f"✅ Foundation aplicada ({len(statements)} sentencias)")

    async def _seed_demo_data(self, conn, logger):
        """
        Ejecuta el script de datos demo (seed_demo_data.sql) si existe.
        Solo se ejecuta si no hay pacientes demo ya insertados (opcional).
        """
        import os

        seed_path = os.path.join(os.path.dirname(__file__), "seed_demo_data.sql")
        if not os.path.exists(seed_path):
            logger.warning(f"⚠️  Archivo de seed no encontrado: {seed_path}")
            return

        with open(seed_path, "r", encoding="utf-8") as f:
            sql_content = f.read()

        # Separar sentencias respetando bloques DO $$ (similar a _apply_foundation)
        clean_lines = [
            line.split("--")[0].rstrip() for line in sql_content.splitlines()
        ]
        clean_sql = "\n".join(clean_lines)

        statements = []
        current_stmt = []
        in_dollar = False
        for line in clean_sql.splitlines():
            if "$$" in line:
                in_dollar = not in_dollar if line.count("$$") % 2 != 0 else in_dollar
            current_stmt.append(line)
            if not in_dollar and ";" in line:
                full = "\n".join(current_stmt).strip()
                if full:
                    statements.append(full)
                current_stmt = []

        if current_stmt:
            leftover = "\n".join(current_stmt).strip()
            if leftover:
                statements.append(leftover)

        if not statements:
            logger.warning("⚠️  Seed vacío, nada que ejecutar.")
            return

        logger.info(f"🌱 Ejecutando seed demo ({len(statements)} sentencias)...")
        for i, stmt in enumerate(statements):
            try:
                await conn.execute(stmt)
            except Exception as e:
                logger.error(f"❌ Error en sentencia seed {i + 1}: {e}")
                # Continuar con las siguientes (seed es idempotente)
        logger.info("✅ Seed demo ejecutado (los conflictos se ignoraron)")

    async def _run_evolution_pipeline(self, logger):
        """
        Pipeline de Cirugía: Parches acumulativos e independientes.
        Agrega aquí bloques DO $$ que aseguren la evolución del esquema.
        """
        patches = [
            # Parche 1: Asegurar tabla 'users' y columna 'user_id' en 'professionals'
            """
            DO $$ 
            BEGIN 
                -- Asegurar columna user_id en professionals
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professionals' AND column_name='user_id') THEN
                    ALTER TABLE professionals ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
                END IF;
            END $$;
            """,
            # Parche 2: Auto-activación del primer CEO (Protocolo Omega Prime)
            """
            DO $$ 
            BEGIN 
                -- Si existe un usuario CEO en estado pending, lo activamos
                UPDATE users SET status = 'active' 
                WHERE role = 'ceo' AND status = 'pending';
                
                -- Aseguramos que su perfil profesional también esté activo
                UPDATE professionals SET is_active = TRUE 
                WHERE email IN (SELECT email FROM users WHERE role = 'ceo' AND status = 'active');
            END $$;
            """,
            # Agrega más parches aquí en el futuro...
            # Parche 3: Permitir DNI y Apellido nulos para 'guests' (Chat Users)
            """
            DO $$ 
            BEGIN 
                -- Hacer dni nullable
                ALTER TABLE patients ALTER COLUMN dni DROP NOT NULL;
                
                -- Hacer last_name nullable
                ALTER TABLE patients ALTER COLUMN last_name DROP NOT NULL;
                
                -- El constraint de unique dni debe ignorar nulos (Postgres lo hace por defecto, pero revisamos index)
            EXCEPTION
                WHEN others THEN null; -- Ignorar si ya se aplicó o falla
            END $$;
            """,
            # Parche 4: Asegurar constraint unique (tenant_id, phone_number) en patients
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'patients_tenant_id_phone_number_key'
                ) THEN
                    ALTER TABLE patients ADD CONSTRAINT patients_tenant_id_phone_number_key UNIQUE (tenant_id, phone_number);
                END IF;
            END $$;
            """,
            # Parche 5: Agregar urgencia a la tabla patients para tracking de leads
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='urgency_level') THEN
                    ALTER TABLE patients ADD COLUMN urgency_level VARCHAR(20) DEFAULT 'normal';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='urgency_reason') THEN
                    ALTER TABLE patients ADD COLUMN urgency_reason TEXT;
                END IF;
            END $$;
            """,
            # Parche 6: Evolucionar treatment_plan a JSONB en clinical_records
            """
            DO $$ 
            BEGIN 
                -- Si la columna existe y es de tipo text/varchar, la convertimos a JSONB
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='clinical_records' AND column_name='treatment_plan' 
                    AND data_type IN ('text', 'character varying')
                ) THEN
                    ALTER TABLE clinical_records ALTER COLUMN treatment_plan TYPE JSONB USING treatment_plan::jsonb;
                END IF;
                
                -- Si no existe, la creamos
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_records' AND column_name='treatment_plan') THEN
                    ALTER TABLE clinical_records ADD COLUMN treatment_plan JSONB DEFAULT '{}';
                END IF;
            END $$;
            """,
            # Parche 7: Asegurar nombres en tabla users para gestión unificada
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='first_name') THEN
                    ALTER TABLE users ADD COLUMN first_name VARCHAR(100);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_name') THEN
                    ALTER TABLE users ADD COLUMN last_name VARCHAR(100);
                END IF;
            END $$;
            
            -- Copiar datos existentes de professionals a users (opcional pero recomendado)
            UPDATE users u
            SET first_name = p.first_name, last_name = p.last_name
            FROM professionals p
            WHERE u.id = p.user_id AND u.first_name IS NULL;
            """,
            # Parche 8: Agregar google_calendar_id a la tabla de profesionales
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professionals' AND column_name='google_calendar_id') THEN
                    ALTER TABLE professionals ADD COLUMN google_calendar_id VARCHAR(255);
                END IF;
            END $$;
            """,
            # Parche 9: Agregar working_hours a la tabla profesionales
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professionals' AND column_name='working_hours') THEN
                    ALTER TABLE professionals ADD COLUMN working_hours JSONB DEFAULT '{}';
                END IF;
            END $$;
            """,
            # Parche 10: Inicializar working_hours para profesionales existentes
            """
            DO $$ 
            BEGIN 
                UPDATE professionals 
                SET working_hours = '{
                    "monday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "tuesday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "wednesday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "thursday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "friday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "saturday": {"enabled": true, "slots": [{"start": "09:00", "end": "18:00"}]},
                    "sunday": {"enabled": false, "slots": []}
                }'::jsonb
                WHERE working_hours = '{}'::jsonb OR working_hours IS NULL;
            END $$;
            """,
            # Parche 11: Columna config (JSONB) en tenants para calendar_provider y demás opciones
            """
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='config') THEN
                    ALTER TABLE tenants ADD COLUMN config JSONB DEFAULT '{}';
                END IF;
                -- Asegurar que tenants existentes tengan calendar_provider por defecto
                UPDATE tenants SET config = jsonb_set(COALESCE(config, '{}'), '{calendar_provider}', '"local"')
                WHERE config IS NULL OR config->>'calendar_provider' IS NULL;
            END $$;
            """,
            # Parche 12: tenant_id en professionals (idempotente, no rompe datos existentes)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'tenant_id') THEN
                    ALTER TABLE professionals ADD COLUMN tenant_id INTEGER DEFAULT 1;
                    UPDATE professionals SET tenant_id = 1 WHERE tenant_id IS NULL;
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
                        ALTER TABLE professionals ADD CONSTRAINT fk_professionals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END IF;
            END $$;
            CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON professionals(tenant_id);
            """,
            # Parche 12b: registration_id en professionals (matrícula; BD puede tener license_number)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'registration_id') THEN
                    ALTER TABLE professionals ADD COLUMN registration_id VARCHAR(50);
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'license_number') THEN
                        UPDATE professionals SET registration_id = license_number WHERE license_number IS NOT NULL;
                    END IF;
                END IF;
            END $$;
            """,
            # Parche 12c: updated_at en professionals (algunos esquemas antiguos no lo tienen)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'updated_at') THEN
                    ALTER TABLE professionals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
                    UPDATE professionals SET updated_at = NOW() WHERE updated_at IS NULL;
                END IF;
            END $$;
            """,
            # Parche 12d: phone_number en professionals (esquemas antiguos pueden no tenerla)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'phone_number') THEN
                    ALTER TABLE professionals ADD COLUMN phone_number VARCHAR(20);
                END IF;
            END $$;
            """,
            # Parche 12e: specialty en professionals (esquemas antiguos pueden no tenerla)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'professionals' AND column_name = 'specialty') THEN
                    ALTER TABLE professionals ADD COLUMN specialty VARCHAR(100);
                END IF;
            END $$;
            """,
            # Parche 13: tenant_id, source y google_calendar_event_id en appointments (idempotente)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'tenant_id') THEN
                    ALTER TABLE appointments ADD COLUMN tenant_id INTEGER DEFAULT 1;
                    UPDATE appointments SET tenant_id = 1 WHERE tenant_id IS NULL;
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
                        ALTER TABLE appointments ADD CONSTRAINT fk_appointments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'source') THEN
                    ALTER TABLE appointments ADD COLUMN source VARCHAR(20) DEFAULT 'ai';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'google_calendar_event_id') THEN
                    ALTER TABLE appointments ADD COLUMN google_calendar_event_id VARCHAR(255);
                END IF;
            END $$;
            CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments(source);
            """,
            # Parche 14: tenant_id en treatment_types (idempotente)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'treatment_types' AND column_name = 'tenant_id') THEN
                    ALTER TABLE treatment_types ADD COLUMN tenant_id INTEGER DEFAULT 1;
                    UPDATE treatment_types SET tenant_id = 1 WHERE tenant_id IS NULL;
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
                        ALTER TABLE treatment_types ADD CONSTRAINT fk_treatment_types_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END IF;
            END $$;
            CREATE INDEX IF NOT EXISTS idx_treatment_types_tenant ON treatment_types(tenant_id);
            """,
            # Parche 15: tenant_id en chat_messages (conversaciones por clínica, buffer/override independientes)
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'tenant_id') THEN
                    ALTER TABLE chat_messages ADD COLUMN tenant_id INTEGER DEFAULT 1;
                    UPDATE chat_messages SET tenant_id = 1 WHERE tenant_id IS NULL;
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
                        ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END IF;
            END $$;
            CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id ON chat_messages(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_from_created ON chat_messages(tenant_id, from_number, created_at DESC);
            """,
            # Parche 16: Tablas de tracking de leads demo (SuperAdmin + Bridge CRM VENTAS)
            """
            CREATE TABLE IF NOT EXISTS demo_leads (
                id SERIAL PRIMARY KEY,
                phone_number VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(255),
                email VARCHAR(255),
                status VARCHAR(20) DEFAULT 'new',
                source VARCHAR(50) DEFAULT 'demo',
                whatsapp_messages INTEGER DEFAULT 0,
                demo_appointments INTEGER DEFAULT 0,
                pages_visited JSONB DEFAULT '[]',
                first_seen_at TIMESTAMPTZ DEFAULT NOW(),
                last_seen_at TIMESTAMPTZ DEFAULT NOW(),
                source_ad VARCHAR(255),
                engagement_score NUMERIC(5,2) DEFAULT 0,
                auth_token TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_demo_leads_phone ON demo_leads(phone_number);
            CREATE INDEX IF NOT EXISTS idx_demo_leads_status ON demo_leads(status);
            CREATE INDEX IF NOT EXISTS idx_demo_leads_score ON demo_leads(engagement_score DESC);

            CREATE TABLE IF NOT EXISTS demo_events (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER NOT NULL REFERENCES demo_leads(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL,
                event_data JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_demo_events_lead ON demo_events(lead_id);
            CREATE INDEX IF NOT EXISTS idx_demo_events_type ON demo_events(event_type);
            """,
            # Parche 17: Tabla patient_documents (documentos del paciente)
            """
            DO $$
            BEGIN
                -- Crear tabla patient_documents si no existe
                CREATE TABLE IF NOT EXISTS patient_documents (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                    file_name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    file_size INTEGER,
                    mime_type VARCHAR(100),
                    document_type VARCHAR(50) DEFAULT 'clinical',
                    uploaded_by UUID REFERENCES users(id),
                    source VARCHAR(50) DEFAULT 'manual',
                    source_details JSONB DEFAULT '{}',
                    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Índices
                CREATE INDEX IF NOT EXISTS idx_patient_documents_tenant ON patient_documents(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_patient_documents_patient ON patient_documents(patient_id);
                CREATE INDEX IF NOT EXISTS idx_patient_documents_uploaded_at ON patient_documents(uploaded_at DESC);

                -- Constraint único: tenant_id + patient_id + file_name (evita duplicados en misma clínica)
                ALTER TABLE patient_documents DROP CONSTRAINT IF EXISTS patient_documents_tenant_patient_filename_key;
                ALTER TABLE patient_documents ADD CONSTRAINT patient_documents_tenant_patient_filename_key UNIQUE (tenant_id, patient_id, file_name);
            EXCEPTION
                WHEN others THEN NULL; -- Ignorar errores (tabla ya existe, columnas ya existen, etc.)
            END $$;
            """,
            # Parche 18: Tabla patient_digital_records (registros digitales)
            """
            DO $$
            BEGIN
                -- Crear tabla patient_digital_records si no existe
                CREATE TABLE IF NOT EXISTS patient_digital_records (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                    professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
                    template_type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    html_content TEXT NOT NULL DEFAULT '',
                    pdf_path VARCHAR(500),
                    pdf_generated_at TIMESTAMPTZ,
                    source_data JSONB DEFAULT '{}',
                    generation_metadata JSONB DEFAULT '{}',
                    status VARCHAR(20) DEFAULT 'draft',
                    sent_to_email VARCHAR(255),
                    sent_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Índices
                CREATE INDEX IF NOT EXISTS idx_pdr_tenant_patient ON patient_digital_records(tenant_id, patient_id);
                CREATE INDEX IF NOT EXISTS idx_pdr_tenant ON patient_digital_records(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_pdr_status ON patient_digital_records(tenant_id, status);
                CREATE INDEX IF NOT EXISTS idx_pdr_template_type ON patient_digital_records(template_type);
                CREATE INDEX IF NOT EXISTS idx_pdr_created_at ON patient_digital_records(created_at DESC);

                -- Constraints de verificación (si no existen)
                ALTER TABLE patient_digital_records DROP CONSTRAINT IF EXISTS ck_patient_digital_records_status;
                ALTER TABLE patient_digital_records ADD CONSTRAINT ck_patient_digital_records_status 
                    CHECK (status IN ('draft', 'final', 'sent'));

                ALTER TABLE patient_digital_records DROP CONSTRAINT IF EXISTS ck_patient_digital_records_template_type;
                ALTER TABLE patient_digital_records ADD CONSTRAINT ck_patient_digital_records_template_type 
                    CHECK (template_type IN ('clinical_report', 'post_surgery', 'odontogram_art', 'authorization_request'));
            EXCEPTION
                WHEN others THEN NULL; -- Ignorar errores (tabla ya existe, columnas ya existen, etc.)
            END $$;
            """,
            # Parche 19: Columnas faltantes en tabla patients (anamnesis_token, guardian_phone, city, instagram_psid, facebook_psid)
            """
            DO $$
            BEGIN
                -- Añadir anamnesis_token si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'anamnesis_token') THEN
                    ALTER TABLE patients ADD COLUMN anamnesis_token VARCHAR(100);
                END IF;

                -- Añadir guardian_phone si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'guardian_phone') THEN
                    ALTER TABLE patients ADD COLUMN guardian_phone VARCHAR(20);
                END IF;

                -- Añadir city si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'city') THEN
                    ALTER TABLE patients ADD COLUMN city VARCHAR(100);
                END IF;

                -- Añadir instagram_psid si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'instagram_psid') THEN
                    ALTER TABLE patients ADD COLUMN instagram_psid VARCHAR(255);
                END IF;

                -- Añadir facebook_psid si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'facebook_psid') THEN
                    ALTER TABLE patients ADD COLUMN facebook_psid VARCHAR(255);
                END IF;

                -- Añadir anamnesis_completed_at si no existe (opcional, de ClinicForge)
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'anamnesis_completed_at') THEN
                    ALTER TABLE patients ADD COLUMN anamnesis_completed_at TIMESTAMPTZ;
                END IF;

                -- Añadir anamnesis_completed_by si no existe (opcional)
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'anamnesis_completed_by') THEN
                    ALTER TABLE patients ADD COLUMN anamnesis_completed_by INTEGER REFERENCES professionals(id);
                END IF;
            END $$;
            """,
            # Parche 20: Tabla tenant_holidays (feriados y cierres por clínica)
            """
            DO $$
            BEGIN
                -- Crear tabla tenant_holidays si no existe
                CREATE TABLE IF NOT EXISTS tenant_holidays (
                    id SERIAL PRIMARY KEY,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    date DATE NOT NULL,
                    description TEXT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Índices
                CREATE INDEX IF NOT EXISTS idx_tenant_holidays_tenant_date ON tenant_holidays(tenant_id, date);
                CREATE INDEX IF NOT EXISTS idx_tenant_holidays_date ON tenant_holidays(date);

                -- Constraint único: un feriado por clínica y fecha (simplificado)
                ALTER TABLE tenant_holidays DROP CONSTRAINT IF EXISTS tenant_holidays_tenant_date_key;
                ALTER TABLE tenant_holidays ADD CONSTRAINT tenant_holidays_tenant_date_key UNIQUE (tenant_id, date);
            EXCEPTION
                WHEN others THEN NULL; -- Ignorar errores (tabla ya existe, columnas ya existen, etc.)
            END $$;
            """,
            # Parche 21: Tablas de billing/treatment_plans (igual a ClinicForge)
            """
            DO $$
            BEGIN
                -- 1. Crear tabla treatment_plans si no existe
                CREATE TABLE IF NOT EXISTS treatment_plans (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                    professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
                    name VARCHAR(255) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'draft',
                    estimated_total NUMERIC(12,2) DEFAULT 0,
                    approved_total NUMERIC(12,2),
                    approved_by VARCHAR(100),
                    approved_at TIMESTAMPTZ,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- 2. Crear tabla treatment_plan_items si no existe
                CREATE TABLE IF NOT EXISTS treatment_plan_items (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    treatment_type_code VARCHAR(50),
                    custom_description VARCHAR(255),
                    estimated_price NUMERIC(12,2) DEFAULT 0,
                    approved_price NUMERIC(12,2),
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- 3. Crear tabla treatment_plan_payments si no existe
                CREATE TABLE IF NOT EXISTS treatment_plan_payments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
                    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                    amount NUMERIC(12,2) NOT NULL,
                    payment_method VARCHAR(20) NOT NULL,
                    payment_date DATE DEFAULT CURRENT_DATE,
                    recorded_by VARCHAR(100),
                    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
                    receipt_data JSONB,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );

                -- Índices para treatment_plans
                CREATE INDEX IF NOT EXISTS idx_treatment_plans_tenant_patient ON treatment_plans(tenant_id, patient_id);
                CREATE INDEX IF NOT EXISTS idx_treatment_plans_tenant_status ON treatment_plans(tenant_id, status);
                CREATE INDEX IF NOT EXISTS idx_treatment_plans_tenant_professional ON treatment_plans(tenant_id, professional_id);

                -- Índices para treatment_plan_items
                CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan ON treatment_plan_items(plan_id);
                CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_tenant_plan ON treatment_plan_items(tenant_id, plan_id);

                -- Índices para treatment_plan_payments
                CREATE INDEX IF NOT EXISTS idx_treatment_plan_payments_plan ON treatment_plan_payments(plan_id);
                CREATE INDEX IF NOT EXISTS idx_treatment_plan_payments_tenant_plan ON treatment_plan_payments(tenant_id, plan_id);
                CREATE INDEX IF NOT EXISTS idx_treatment_plan_payments_tenant_date ON treatment_plan_payments(tenant_id, payment_date);

                -- Agregar plan_item_id a appointments si no existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'plan_item_id') THEN
                    ALTER TABLE appointments ADD COLUMN plan_item_id UUID REFERENCES treatment_plan_items(id) ON DELETE SET NULL;
                    CREATE INDEX IF NOT EXISTS idx_appointments_plan_item ON appointments(plan_item_id) WHERE plan_item_id IS NOT NULL;
                END IF;
            EXCEPTION
                WHEN others THEN NULL;
            END $$;
            """,
            # Parche 22: Columnas faltantes en patients (igual a ClinicForge)
            """
            DO $$
            BEGIN
                -- insurance_provider
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'insurance_provider') THEN
                    ALTER TABLE patients ADD COLUMN insurance_provider VARCHAR(100);
                END IF;

                -- insurance_id (número de socio)
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'insurance_id') THEN
                    ALTER TABLE patients ADD COLUMN insurance_id VARCHAR(50);
                END IF;

                -- insurance_valid_until
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'insurance_valid_until') THEN
                    ALTER TABLE patients ADD COLUMN insurance_valid_until DATE;
                END IF;

                -- external_ids (JSONB para IDs externos: meta_ad_id, instagram_psid, etc)
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'external_ids') THEN
                    ALTER TABLE patients ADD COLUMN external_ids JSONB DEFAULT '{}';
                END IF;

                -- acquisition_source (ORGANIC, META_ADS, REFERRAL, etc)
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'acquisition_source') THEN
                    ALTER TABLE patients ADD COLUMN acquisition_source VARCHAR(20);
                END IF;

                -- meta_ad_id, meta_ad_headline, meta_campaign_id
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'meta_ad_id') THEN
                    ALTER TABLE patients ADD COLUMN meta_ad_id VARCHAR(50);
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'meta_ad_headline') THEN
                    ALTER TABLE patients ADD COLUMN meta_ad_headline VARCHAR(255);
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'meta_campaign_id') THEN
                    ALTER TABLE patients ADD COLUMN meta_campaign_id VARCHAR(50);
                END IF;
            END $$;
            """,
        ]

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for i, patch in enumerate(patches):
                    try:
                        await conn.execute(patch)
                    except Exception as e:
                        logger.error(
                            f"❌ Error aplicando parche evolutivo {i + 1}: {e}"
                        )
                        # En evolución, a veces es mejor fallar rápido para no corromper
                        raise e

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def try_insert_inbound(
        self,
        provider: str,
        provider_message_id: str,
        event_id: str,
        from_number: str,
        payload: dict,
        correlation_id: str,
    ) -> bool:
        """Try to insert inbound message. Returns True if inserted, False if duplicate."""
        query = """
        INSERT INTO inbound_messages (provider, provider_message_id, event_id, from_number, payload, status, correlation_id)
        VALUES ($1, $2, $3, $4, $5, 'received', $6)
        ON CONFLICT (provider, provider_message_id) DO NOTHING
        RETURNING id
        """
        async with self.pool.acquire() as conn:
            result = await conn.fetchval(
                query,
                provider,
                provider_message_id,
                event_id,
                from_number,
                json.dumps(payload),
                correlation_id,
            )
            return result is not None

    async def mark_inbound_processing(self, provider: str, provider_message_id: str):
        query = "UPDATE inbound_messages SET status = 'processing' WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id)

    async def mark_inbound_done(self, provider: str, provider_message_id: str):
        query = "UPDATE inbound_messages SET status = 'done', processed_at = NOW() WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id)

    async def mark_inbound_failed(
        self, provider: str, provider_message_id: str, error: str
    ):
        query = "UPDATE inbound_messages SET status = 'failed', processed_at = NOW(), error = $3 WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id, error)

    async def append_chat_message(
        self,
        from_number: str,
        role: str,
        content: str,
        correlation_id: str,
        tenant_id: int = 1,
    ):
        query = "INSERT INTO chat_messages (from_number, role, content, correlation_id, tenant_id) VALUES ($1, $2, $3, $4, $5)"
        async with self.pool.acquire() as conn:
            await conn.execute(
                query, from_number, role, content, correlation_id, tenant_id
            )

    async def ensure_patient_exists(
        self,
        phone_number: str,
        tenant_id: int,
        first_name: str = "Visitante",
        status: str = "guest",
    ):
        """
        Ensures a patient record exists for the given phone number.
        If it exists as a 'guest', it can be updated to 'active' or update its name.
        """
        query = """
        INSERT INTO patients (tenant_id, phone_number, first_name, status, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (tenant_id, phone_number) 
        DO UPDATE SET 
            first_name = CASE 
                WHEN patients.status = 'guest' 
                     OR patients.first_name IS NULL 
                     OR patients.first_name IN ('Visitante', 'Paciente', 'Visitante ', 'Paciente ')
                THEN EXCLUDED.first_name 
                ELSE patients.first_name 
            END,
            status = CASE WHEN patients.status = 'guest' AND EXCLUDED.status = 'active' THEN 'active' ELSE patients.status END,
            updated_at = NOW() 
        RETURNING id, status
        """
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(
                query, tenant_id, phone_number, first_name, status
            )

    async def get_chat_history(
        self, from_number: str, limit: int = 15, tenant_id: Optional[int] = None
    ) -> List[dict]:
        """Returns list of {'role': ..., 'content': ...} in chronological order. Opcional tenant_id para aislamiento por clínica."""
        if tenant_id is not None:
            query = "SELECT role, content FROM chat_messages WHERE from_number = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT $3"
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(query, from_number, tenant_id, limit)
                return [dict(row) for row in reversed(rows)]
        query = "SELECT role, content FROM chat_messages WHERE from_number = $1 ORDER BY created_at DESC LIMIT $2"
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, from_number, limit)
            return [dict(row) for row in reversed(rows)]

    # --- WRAPPER METHODS PARA TOOLS (acceso directo al pool) ---
    async def fetch(self, query: str, *args):
        """Wrapper para pool.fetch - usado por check_availability."""
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args):
        """Wrapper para pool.fetchrow - usado por book_appointment."""
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args):
        """Wrapper para pool.fetchval."""
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    async def execute(self, query: str, *args):
        """Wrapper para pool.execute - usado por book_appointment."""
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)


# Global instance
db = Database()
