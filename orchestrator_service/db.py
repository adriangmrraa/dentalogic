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

    async def ensure_patient_exists(self, phone_number: str):
        """Ensures a patient record exists for the given phone number."""
        # Fix: Usamos status 'guest' para diferenciar leads de pacientes confirmados
        query = """
        INSERT INTO patients (phone_number, first_name, status, created_at)
        VALUES ($1, 'Visitante', 'guest', NOW())
        ON CONFLICT (phone_number) DO NOTHING
        RETURNING id
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, phone_number)

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
