import logging
from datetime import date, datetime
from typing import List, Dict, Optional

from db import db

logger = logging.getLogger(__name__)


class HolidayService:
    """Servicio para gestionar feriados y cierres por clínica."""

    async def get_holiday(self, target_date: date, tenant_id: int) -> Optional[Dict]:
        """
        Retorna el registro de feriado para la fecha y tenant, o None si no existe.
        """
        try:
            row = await db.pool.fetchrow(
                """
                SELECT id, tenant_id, date, description, created_at
                FROM tenant_holidays
                WHERE tenant_id = $1 AND date = $2
                """,
                tenant_id,
                target_date,
            )
            if row:
                return {
                    "id": row["id"],
                    "tenant_id": row["tenant_id"],
                    "date": row["date"],
                    "description": row["description"],
                    "created_at": row["created_at"],
                }
            return None
        except Exception as e:
            logger.error(
                f"Error fetching holiday for tenant {tenant_id} date {target_date}: {e}"
            )
            return None

    async def is_holiday(self, target_date: date, tenant_id: int) -> bool:
        """
        Verifica si una fecha es feriado (o día de cierre) para la clínica.
        Retorna True si hay un registro en tenant_holidays para esa fecha y tenant.
        """
        holiday = await self.get_holiday(target_date, tenant_id)
        return holiday is not None

    async def list_holidays(
        self,
        tenant_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> List[Dict]:
        """
        Lista los feriados de la clínica en un rango de fechas.
        Si no se especifica rango, devuelve todos los feriados del tenant.
        """
        try:
            query = """
                SELECT id, tenant_id, date, description, created_at
                FROM tenant_holidays
                WHERE tenant_id = $1
            """
            params = [tenant_id]
            if start_date:
                query += " AND date >= $2"
                params.append(start_date)
            if end_date:
                query += " AND date <= $3"
                params.append(end_date)
            query += " ORDER BY date ASC"

            rows = await db.pool.fetch(query, *params)
            return [
                {
                    "id": r["id"],
                    "tenant_id": r["tenant_id"],
                    "date": r["date"].isoformat()
                    if isinstance(r["date"], date)
                    else r["date"],
                    "description": r["description"],
                    "created_at": r["created_at"].isoformat()
                    if r["created_at"]
                    else None,
                }
                for r in rows
            ]
        except Exception as e:
            logger.error(f"Error listing holidays for tenant {tenant_id}: {e}")
            return []


# Instancia global para importar fácilmente
holiday_service = HolidayService()
