import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from db import db

logger = logging.getLogger("demo_tracking_service")

# Puntuaciones por tipo de evento
EVENT_SCORES = {
    'page_view': 1.0,
    'scroll_depth_50': 2.0,
    'scroll_depth_90': 3.0,
    'button_click': 2.0,
    'feature_view': 4.0,
    'whatsapp_click': 15.0,
    'anamnesis_fill': 20.0,
    'login_attempt': 10.0
}

class DemoTrackingService:
    
    async def create_or_get_lead(self, phone_number: str, email: Optional[str] = None, source_ad: Optional[str] = None) -> int:
        """Crea o devuelve el ID del lead demo."""
        try:
            # Buscar existente
            row = await db.pool.fetchrow("SELECT id FROM demo_leads WHERE phone_number = $1", phone_number)
            if row:
                await db.pool.execute("UPDATE demo_leads SET last_seen_at = NOW() WHERE id = $1", row['id'])
                return row['id']
            
            # Crear nuevo
            row = await db.pool.fetchrow("""
                INSERT INTO demo_leads (phone_number, email, source_ad, first_seen_at, last_seen_at) 
                VALUES ($1, $2, $3, NOW(), NOW()) 
                RETURNING id
            """, phone_number, email, source_ad)
            return row['id']
        except Exception as e:
            logger.error(f"Error en create_or_get_lead: {e}")
            raise e

    async def register_event(self, lead_id: int, event_type: str, event_data: Dict[str, Any]):
        """Registra un evento y actualiza el engagement score."""
        try:
            await db.pool.execute("""
                INSERT INTO demo_events (lead_id, event_type, event_data, created_at)
                VALUES ($1, $2, $3, NOW())
            """, lead_id, event_type, json.dumps(event_data))
            
            # Actualizar score
            score_increment = EVENT_SCORES.get(event_type, 1.0)
            await db.pool.execute("""
                UPDATE demo_leads 
                SET engagement_score = engagement_score + $1, last_seen_at = NOW()
                WHERE id = $2
            """, score_increment, lead_id)
            
            # Actualizar status a 'contacted' si hace clic en WhatsApp
            if event_type == 'whatsapp_click':
                await db.pool.execute("UPDATE demo_leads SET status = 'contacted' WHERE id = $1 AND status = 'new'", lead_id)
                
        except Exception as e:
            logger.error(f"Error en register_event: {e}")
            raise e

    async def get_all_leads(self):
        """Devuelve todos los leads para el panel de SuperAdmin."""
        rows = await db.pool.fetch("SELECT * FROM demo_leads ORDER BY engagement_score DESC, last_seen_at DESC")
        return [dict(row) for row in rows]
        
    async def get_lead_events(self, lead_id: int):
        """Devuelve el timeline de eventos de un lead."""
        rows = await db.pool.fetch("SELECT * FROM demo_events WHERE lead_id = $1 ORDER BY created_at DESC", lead_id)
        return [dict(row) for row in rows]

demo_tracking_service = DemoTrackingService()
