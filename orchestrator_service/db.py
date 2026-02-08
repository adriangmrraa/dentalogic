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
            
            logger.info("✅ Base de datos verificada y actualizada (Maintenance Robot OK)")
            
        except Exception as e:
            import traceback
            logger.error(f"❌ Error en Maintenance Robot: {e}")
            logger.error(traceback.format_exc())

    async def _apply_foundation(self, logger):
        """Ejecuta el esquema base dentalogic_schema.sql"""
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "db", "init", "dentalogic_schema.sql"),
            os.path.join(os.path.dirname(__file__), "db", "init", "dentalogic_schema.sql"),
            "/app/db/init/dentalogic_schema.sql"
        ]
        
        schema_path = next((p for p in possible_paths if os.path.exists(p)), None)
        if not schema_path:
            logger.error("❌ Foundation schema not found!")
            return

        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()

        # Limpiar comentarios y separar sentencias respetando $$
        clean_lines = [line.split('--')[0].rstrip() for line in schema_sql.splitlines()]
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
                if full: statements.append(full)
                current_stmt = []
        
        if current_stmt:
            leftover = "\n".join(current_stmt).strip()
            if leftover: statements.append(leftover)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for i, stmt in enumerate(statements):
                    await conn.execute(stmt)
        logger.info(f"✅ Foundation aplicada ({len(statements)} sentencias)")

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
        ]

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                for i, patch in enumerate(patches):
                    try:
                        await conn.execute(patch)
                    except Exception as e:
                        logger.error(f"❌ Error aplicando parche evolutivo {i+1}: {e}")
                        # En evolución, a veces es mejor fallar rápido para no corromper
                        raise e

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def try_insert_inbound(self, provider: str, provider_message_id: str, event_id: str, from_number: str, payload: dict, correlation_id: str) -> bool:
        """Try to insert inbound message. Returns True if inserted, False if duplicate."""
        query = """
        INSERT INTO inbound_messages (provider, provider_message_id, event_id, from_number, payload, status, correlation_id)
        VALUES ($1, $2, $3, $4, $5, 'received', $6)
        ON CONFLICT (provider, provider_message_id) DO NOTHING
        RETURNING id
        """
        async with self.pool.acquire() as conn:
            result = await conn.fetchval(query, provider, provider_message_id, event_id, from_number, json.dumps(payload), correlation_id)
            return result is not None

    async def mark_inbound_processing(self, provider: str, provider_message_id: str):
        query = "UPDATE inbound_messages SET status = 'processing' WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id)

    async def mark_inbound_done(self, provider: str, provider_message_id: str):
        query = "UPDATE inbound_messages SET status = 'done', processed_at = NOW() WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id)

    async def mark_inbound_failed(self, provider: str, provider_message_id: str, error: str):
        query = "UPDATE inbound_messages SET status = 'failed', processed_at = NOW(), error = $3 WHERE provider = $1 AND provider_message_id = $2"
        async with self.pool.acquire() as conn:
            await conn.execute(query, provider, provider_message_id, error)

    async def append_chat_message(self, from_number: str, role: str, content: str, correlation_id: str):
        query = "INSERT INTO chat_messages (from_number, role, content, correlation_id) VALUES ($1, $2, $3, $4)"
        async with self.pool.acquire() as conn:
            await conn.execute(query, from_number, role, content, correlation_id)

    async def ensure_patient_exists(self, phone_number: str, first_name: str = 'Visitante', status: str = 'guest'):
        """
        Ensures a patient record exists for the given phone number.
        If it exists as a 'guest', it can be updated to 'active' or update its name.
        """
        query = """
        INSERT INTO patients (tenant_id, phone_number, first_name, status, created_at)
        VALUES (1, $1, $2, $3, NOW())
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
            return await conn.fetchrow(query, phone_number, first_name, status)

    async def get_chat_history(self, from_number: str, limit: int = 15) -> List[dict]:
        """Returns list of {'role': ..., 'content': ...} in chronological order."""
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
