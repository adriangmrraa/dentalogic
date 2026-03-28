from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
from demo_tracking_service import demo_tracking_service
from auth_service import auth_service

router = APIRouter()
logger = logging.getLogger("demo_tracking_routes")

class SessionRequest(BaseModel):
    phone_number: str
    email: Optional[str] = None
    source_ad: Optional[str] = None

class EventRequest(BaseModel):
    lead_id: int
    event_type: str
    event_data: Dict[str, Any] = {}

# Endpoints públicos (Trackers)
@router.post("/session")
async def start_demo_session(req: SessionRequest):
    try:
        lead_id = await demo_tracking_service.create_or_get_lead(
            phone_number=req.phone_number,
            email=req.email,
            source_ad=req.source_ad
        )
        return {"lead_id": lead_id, "status": "ok"}
    except Exception as e:
        logger.error(f"Error starting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/event")
async def track_demo_event(req: EventRequest):
    try:
        await demo_tracking_service.register_event(
            lead_id=req.lead_id,
            event_type=req.event_type,
            event_data=req.event_data
        )
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error tracking event: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoints SuperAdmin
async def superadmin_required(current_user=Depends(auth_service.get_current_user)):
    user_dict = dict(current_user) if current_user else {}
    if user_dict.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return current_user

@router.get("/superadmin/leads")
async def get_demo_leads(current_user=Depends(superadmin_required)):
    leads = await demo_tracking_service.get_all_leads()
    # Convert dates to isoformat for JSON serialization
    for lead in leads:
        if lead.get('first_seen_at'): lead['first_seen_at'] = lead['first_seen_at'].isoformat()
        if lead.get('last_seen_at'): lead['last_seen_at'] = lead['last_seen_at'].isoformat()
        if lead.get('created_at'): lead['created_at'] = lead['created_at'].isoformat()
        if lead.get('updated_at'): lead['updated_at'] = lead['updated_at'].isoformat()
        if lead.get('engagement_score'): lead['engagement_score'] = float(lead['engagement_score'])
    return {"leads": leads}

@router.get("/superadmin/leads/{lead_id}/events")
async def get_lead_timeline(lead_id: int, current_user=Depends(superadmin_required)):
    events = await demo_tracking_service.get_lead_events(lead_id)
    for event in events:
        if event.get('created_at'): event['created_at'] = event['created_at'].isoformat()
    return {"events": events}
