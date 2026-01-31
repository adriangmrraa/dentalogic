-- ========================================
-- RUN_MIGRATIONS.sql
-- Ejecuta todas las migraciones en orden
-- ========================================

-- Ejecutar los 3 archivos en orden:
-- 1. Schema base (mensajes inbound + chat)
\i 001_schema.sql

-- 2. Schema multi-tenancy + credenciales
\i 002_platform_schema.sql

-- 3. Schema dental (pacientes, turnos, historia clínica)
\i 004_dental_phase1_schema.sql

-- Verificación
SELECT 
    schemaname,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Debe mostrar:
-- ✅ appointment_statuses
-- ✅ appointments  
-- ✅ chat_conversations
-- ✅ chat_messages
-- ✅ clinical_records
-- ✅ credentials
-- ✅ daily_cash_flow
-- ✅ inbound_messages
-- ✅ patients
-- ✅ professionals
-- ✅ system_events
-- ✅ tenants

\echo '✅ Todas las migraciones ejecutadas correctamente'
