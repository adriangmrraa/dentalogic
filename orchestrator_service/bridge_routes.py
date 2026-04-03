from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
import os
import logging
from demo_tracking_service import demo_tracking_service
from db import db

logger = logging.getLogger("bridge_routes")
router = APIRouter()

# Variable de entorno de seguridad para la sincronización M2M
BRIDGE_API_TOKEN = os.getenv("BRIDGE_API_TOKEN", "super-secret-bridge-token-2026")


def verify_bridge_token(x_bridge_token: str = Header(None)):
    if not x_bridge_token or x_bridge_token != BRIDGE_API_TOKEN:
        logger.warning("Intento de acceso denegado a Bridge API: Token inválido")
        raise HTTPException(status_code=401, detail="Invalid X-Bridge-Token")
    return True


@router.get("/v1/leads", dependencies=[Depends(verify_bridge_token)])
async def get_bridge_leads(min_score: float = 0.0, status: Optional[str] = None):
    """
    Exporta los leads registrados para que CRM VENTAS los ingiera.
    """
    try:
        query = "SELECT * FROM demo_leads WHERE engagement_score >= $1"
        args: list[Any] = [min_score]

        if status:
            args.append(status)
            query += " AND status = $2"

        query += " ORDER BY engagement_score DESC, last_seen_at DESC"

        rows = await db.pool.fetch(query, *args)
        leads = [dict(row) for row in rows]

        return {"version": "1.0", "count": len(leads), "leads": leads}
    except Exception as e:
        logger.error(f"Error exportando leads puente: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/v1/leads/{lead_id}/sync", dependencies=[Depends(verify_bridge_token)])
async def mark_lead_synced(lead_id: int):
    """
    Marca un lead como importado/sincronizado exitosamente en CRM VENTAS
    para mover su estado si fuera necesario o evitar importarlo de nuevo.
    """
    try:
        await db.pool.execute(
            "UPDATE demo_leads SET status = 'synced_to_crm' WHERE id = $1 AND status != 'synced_to_crm'",
            lead_id,
        )
        return {
            "status": "success",
            "message": f"Lead {lead_id} marcado como sincronizado",
        }
    except Exception as e:
        logger.error(f"Error marcando sync de lead puente: {e}")
        raise HTTPException(status_code=500, detail=str(e))
