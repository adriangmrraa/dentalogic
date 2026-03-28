-- ==================== FASE 7: DEMO LEADS & TRACKING ====================

CREATE TABLE IF NOT EXISTS demo_leads (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'synced_to_crm', 'dropped', 'junk')),
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

CREATE TABLE IF NOT EXISTS demo_events (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES demo_leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_events_lead ON demo_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_demo_events_type ON demo_events(event_type);
