-- ==================================================================================
-- SEED DEMO DATA FOR DENTALOGIC FUNCTIONAL DEMO
-- ==================================================================================
-- Inserts realistic demo patients, professionals, appointments, documents,
-- digital records, and holidays for tenant_id = 1 (demo clinic).
-- Uses ON CONFLICT DO NOTHING to be safe and idempotent.
-- ==================================================================================

-- Disable triggers for performance (optional)
-- SET session_replication_role = 'replica';

-- ==================== PATIENTS ====================
-- 10 realistic Argentine patients with unique phone numbers
INSERT INTO patients (tenant_id, phone_number, first_name, last_name, dni, email, status, city, created_at)
VALUES
    (1, '+5491100000001', 'Juan', 'Gómez', '30123456', 'juan.gomez@example.com', 'active', 'Buenos Aires', NOW()),
    (1, '+5491100000002', 'María', 'López', '32123457', 'maria.lopez@example.com', 'active', 'Córdoba', NOW()),
    (1, '+5491100000003', 'Carlos', 'Rodríguez', '34123458', 'carlos.rodriguez@example.com', 'active', 'Rosario', NOW()),
    (1, '+5491100000004', 'Ana', 'Martínez', '36123459', 'ana.martinez@example.com', 'active', 'Mendoza', NOW()),
    (1, '+5491100000005', 'Luis', 'Fernández', '38123460', 'luis.fernandez@example.com', 'active', 'Tucumán', NOW()),
    (1, '+5491100000006', 'Sofía', 'García', '40123461', 'sofia.garcia@example.com', 'active', 'Salta', NOW()),
    (1, '+5491100000007', 'Diego', 'Pérez', '42123462', 'diego.perez@example.com', 'active', 'La Plata', NOW()),
    (1, '+5491100000008', 'Valeria', 'Sánchez', '44123463', 'valeria.sanchez@example.com', 'active', 'Mar del Plata', NOW()),
    (1, '+5491100000009', 'Martín', 'Torres', '46123464', 'martin.torres@example.com', 'active', 'San Juan', NOW()),
    (1, '+5491100000010', 'Lucía', 'Díaz', '48123465', 'lucia.diaz@example.com', 'active', 'Neuquén', NOW())
ON CONFLICT (tenant_id, phone_number) DO NOTHING;

-- ==================== PROFESSIONALS (if not already present) ====================
-- Ensure at least 5 professionals exist (some may already be seeded by foundation)
-- We'll insert only if they don't exist (based on email).
INSERT INTO professionals (tenant_id, user_id, first_name, last_name, email, phone_number, specialty, is_active)
SELECT 1, 
       (SELECT id FROM users WHERE email = tmp.email),
       tmp.first_name,
       tmp.last_name,
       tmp.email,
       tmp.phone_number,
       tmp.specialty,
       TRUE
FROM (VALUES
    ('Dra. Laura', 'Delgado', 'laura.delgado@clinicforge.com', '+5491100000011', 'Odontología General'),
    ('Dr. Javier', 'Mendoza', 'javier.mendoza@clinicforge.com', '+5491100000012', 'Ortodoncia'),
    ('Dra. Carla', 'Romero', 'carla.romero@clinicforge.com', '+5491100000013', 'Endodoncia'),
    ('Dr. Pablo', 'Silva', 'pablo.silva@clinicforge.com', '+5491100000014', 'Implantología'),
    ('Dra. Elena', 'Ríos', 'elena.rios@clinicforge.com', '+5491100000015', 'Periodoncia')
) AS tmp (first_name, last_name, email, phone_number, specialty)
WHERE NOT EXISTS (SELECT 1 FROM professionals p WHERE p.email = tmp.email AND p.tenant_id = 1);

-- If user records don't exist, we can't link them. For demo, we can leave user_id NULL.
-- Alternatively, we could create users, but that's more complex. We'll skip user linkage.

-- ==================== APPOINTMENTS ====================
-- Generate 50 appointments across the next 30 days, distributed among patients and professionals.
-- We'll use a recursive CTE to generate dates and times.
WITH RECURSIVE dates AS (
    SELECT CURRENT_DATE + INTERVAL '1 day' AS date, 1 AS n
    UNION ALL
    SELECT date + INTERVAL '1 day', n + 1 FROM dates WHERE n < 30
),
times AS (
    SELECT '09:00'::time AS time UNION SELECT '10:30' UNION SELECT '12:00'
    UNION SELECT '14:00' UNION SELECT '15:30' UNION SELECT '17:00'
),
appointment_slots AS (
    SELECT 
        d.date + t.time AS start_time,
        d.date + t.time + INTERVAL '45 minutes' AS end_time,
        row_number() OVER (ORDER BY d.date, t.time) AS slot_num
    FROM dates d CROSS JOIN times t
),
patient_ids AS (SELECT id FROM patients WHERE tenant_id = 1 ORDER BY id LIMIT 10),
professional_ids AS (SELECT id FROM professionals WHERE tenant_id = 1 ORDER BY id LIMIT 5)
INSERT INTO appointments (tenant_id, patient_id, professional_id, start_time, end_time, status, source, created_at)
SELECT 
    1,
    (SELECT id FROM patient_ids OFFSET (slot_num % 10) LIMIT 1),
    (SELECT id FROM professional_ids OFFSET (slot_num % 5) LIMIT 1),
    start_time,
    end_time,
    'scheduled',
    'demo',
    NOW()
FROM appointment_slots
WHERE slot_num <= 50
ON CONFLICT DO NOTHING;

-- ==================== PATIENT DOCUMENTS ====================
-- Insert sample documents for each patient (1-2 documents per patient)
WITH patient_sample AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM patients WHERE tenant_id = 1 LIMIT 10
)
INSERT INTO patient_documents (tenant_id, patient_id, file_name, file_path, file_size, mime_type, document_type, uploaded_at, created_at)
SELECT 
    1,
    p.id,
    CASE (ps.rn % 3)
        WHEN 0 THEN 'radiografia-periapical.jpg'
        WHEN 1 THEN 'consentimiento-firmado.pdf'
        ELSE 'historia-clinica.pdf'
    END,
    CASE (ps.rn % 3)
        WHEN 0 THEN 'uploads/demo/sample-xray.jpg'
        WHEN 1 THEN 'uploads/demo/consent-form.pdf'
        ELSE 'uploads/demo/clinical-history.pdf'
    END,
    CASE (ps.rn % 3)
        WHEN 0 THEN 2048000
        WHEN 1 THEN 512000
        ELSE 1024000
    END,
    CASE (ps.rn % 3)
        WHEN 0 THEN 'image/jpeg'
        WHEN 1 THEN 'application/pdf'
        ELSE 'application/pdf'
    END,
    CASE (ps.rn % 3)
        WHEN 0 THEN 'xray'
        WHEN 1 THEN 'consent'
        ELSE 'clinical'
    END,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '7 days'
FROM patient_sample ps
JOIN patients p ON p.id = ps.id
ON CONFLICT (tenant_id, patient_id, file_name) DO NOTHING;

-- ==================== PATIENT DIGITAL RECORDS ====================
-- Insert sample digital records for each patient (1-2 records per patient)
WITH patient_sample AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM patients WHERE tenant_id = 1 LIMIT 10
)
INSERT INTO patient_digital_records (id, tenant_id, patient_id, template_type, title, html_content, status, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    1,
    p.id,
    CASE (ps.rn % 4)
        WHEN 0 THEN 'clinical_report'
        WHEN 1 THEN 'post_surgery'
        WHEN 2 THEN 'odontogram_art'
        ELSE 'authorization_request'
    END,
    CASE (ps.rn % 4)
        WHEN 0 THEN 'Informe Clínico - Control periódico'
        WHEN 1 THEN 'Instrucciones Post‑Operatorias'
        WHEN 2 THEN 'Odontograma Actualizado'
        ELSE 'Solicitud de Autorización a Obra Social'
    END,
    '<html><body><h1>Contenido de ejemplo para ' || p.first_name || ' ' || p.last_name || '</h1><p>Este es un registro digital generado automáticamente para fines de demostración.</p></body></html>',
    CASE (ps.rn % 3)
        WHEN 0 THEN 'draft'
        WHEN 1 THEN 'final'
        ELSE 'sent'
    END,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '1 day'
FROM patient_sample ps
JOIN patients p ON p.id = ps.id
ON CONFLICT DO NOTHING;

-- ==================== TENANT HOLIDAYS ====================
-- Insert fixed holidays for tenant 1 (demo clinic)
INSERT INTO tenant_holidays (tenant_id, date, description, created_at)
VALUES
    (1, DATE '2026-12-25', 'Navidad', NOW()),
    (1, DATE '2026-01-01', 'Año Nuevo', NOW()),
    (1, DATE '2026-05-25', 'Día de la Revolución de Mayo', NOW()),
    (1, DATE '2026-07-09', 'Día de la Independencia', NOW())
ON CONFLICT (tenant_id, date) DO NOTHING;

-- Re-enable triggers if disabled
-- SET session_replication_role = 'origin';

-- ==================================================================================
-- END OF SEED DEMO DATA
-- ==================================================================================