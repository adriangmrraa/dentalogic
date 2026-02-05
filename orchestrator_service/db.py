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
        Sistema de Auto-Migración (Maintenance Robot).
        Lee dentalogic_schema.sql y lo ejecuta de forma idempotente.
        """
        import logging
        logger = logging.getLogger("db")
        
        try:
            # Verificar si las tablas principales existen
            async with self.pool.acquire() as conn:
                tables_exist = await conn.fetchval("""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name IN ('patients', 'professionals', 'appointments')
                """)
            
            if tables_exist >= 3:
                logger.info("✅ Tablas principales detectadas, schema OK")
                return
            
            logger.warning("⚠️ Tablas faltantes detectadas, ejecutando auto-migración...")
            
            # Intentar múltiples rutas para el schema (Dev vs Docker)
            possible_paths = [
                os.path.join(os.path.dirname(__file__), "..", "db", "init", "dentalogic_schema.sql"), # Estructura raíz
                os.path.join(os.path.dirname(__file__), "db", "init", "dentalogic_schema.sql"),      # Estructura interna (Docker)
                "/app/db/init/dentalogic_schema.sql"                                               # Ruta absoluta Docker
            ]
            
            schema_path = None
            for p in possible_paths:
                if os.path.exists(p):
                    schema_path = p
                    break

            if not schema_path:
                logger.error(f"❌ Schema file not found. Tried: {possible_paths}")
                return

            # Cargar y ejecutar el schema
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            
            # Split robusto para manejar funciones PL/pgSQL (evita romper por ; dentro de $$)
            import re
            # Regex que busca ; pero ignora los que están dentro de $$...$$
            # Esta es una aproximación simple pero efectiva para este schema
            statements = []
            current_stmt = []
            in_dollar = False
            for line in schema_sql.splitlines():
                if "$$" in line:
                    in_dollar = not in_dollar
                
                if ";" in line and not in_dollar:
                    parts = line.split(";")
                    current_stmt.append(parts[0])
                    statements.append("\n".join(current_stmt).strip())
                    current_stmt = parts[1:] if len(parts) > 1 else []
                else:
                    current_stmt.append(line)
            
            if current_stmt:
                leftover = "\n".join(current_stmt).strip()
                if leftover: statements.append(leftover)

            statements = [s for s in statements if s.strip()]
            
            logger.info(f"⏳ Ejecutando {len(statements)} sentencias SQL...")
            async with self.pool.acquire() as conn:
                async with conn.transaction():
                    for i, stmt in enumerate(statements):
                        try:
                            await conn.execute(stmt)
                        except Exception as st_err:
                            logger.error(f"❌ Error en sentencia {i+1}: {st_err}")
                            logger.error(f"Sentencia: {stmt[:100]}...")
                            # Dependiendo de la gravedad podrías querer hacer raise o continuar
                            # Como usamos IF NOT EXISTS, la mayoría de errores serán por duplicados previos
                            pass
            
            logger.info("✅ Auto-migración completada exitosamente")
            
        except Exception as e:
            import traceback
            logger.error(f"❌ Error en auto-migración: {e}")
            logger.error(traceback.format_exc())
            # No fallar el startup, solo loguear

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
