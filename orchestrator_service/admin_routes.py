import os
import uuid
import json
import asyncpg
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from pydantic import BaseModel
from db import db
from gcal_service import gcal_service

# Configuración
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-secret-token")

router = APIRouter(prefix="/admin", tags=["Dental Admin"])

# --- Helper para emitir eventos de Socket.IO ---
async def emit_appointment_event(event_type: str, data: Dict[str, Any], request: Request):
    """Emit appointment events via Socket.IO through the app state."""
    if hasattr(request.app.state, 'emit_appointment_event'):
        await request.app.state.emit_appointment_event(event_type, data)

# Configuración
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-secret-token")

router = APIRouter(prefix="/admin", tags=["Dental Admin"])

# --- Dependencia de Seguridad ---
async def verify_admin_token(x_admin_token: str = Header(None)):
    if not ADMIN_TOKEN:
        return # Si no hay token configurado, pasamos (inseguro, solo dev)
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Token de administración inválido")

# --- Modelos Pydantic (Entradas/Salidas) ---

class PatientCreate(BaseModel):
    first_name: str
    last_name: Optional[str] = ""
    phone_number: str
    email: Optional[str] = None
    dni: Optional[str] = None
    insurance: Optional[str] = None # Obra Social

class AppointmentCreate(BaseModel):
    patient_id: Optional[int] = None
    patient_phone: Optional[str] = None # Si es paciente nuevo rápido
    professional_id: int
    datetime: datetime
    type: str = "checkup"
    notes: Optional[str] = None
    check_collisions: bool = True # Por defecto verificar colisiones

class GCalendarBlockCreate(BaseModel):
    google_event_id: str
    title: str
    description: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    all_day: bool = False
    professional_id: Optional[int] = None

class ClinicalNote(BaseModel):
    content: str
    odontogram_data: Optional[Dict] = None

class ProfessionalUpdate(BaseModel):
    name: str
    specialty: str
    active: bool

# ==================== ENDPOINTS DASHBOARD ====================

@router.get("/stats/summary", dependencies=[Depends(verify_admin_token)])
async def get_dashboard_stats():
    """Devuelve métricas clave para el dashboard principal."""
    today = date.today()
    
    # 1. Turnos de hoy
    appointments_today = await db.pool.fetchval("""
        SELECT COUNT(*) FROM appointments 
        WHERE DATE(appointment_datetime) = $1 AND status != 'cancelled'
    """, today)

    # 2. Urgencias pendientes (detectadas por IA)
    urgencies = await db.pool.fetchval("""
        SELECT COUNT(*) FROM appointments 
        WHERE urgency_level IN ('high', 'emergency') AND status = 'scheduled'
    """)

    # 3. Pacientes totales
    total_patients = await db.pool.fetchval("SELECT COUNT(*) FROM patients")

    return {
        "appointments_today": appointments_today,
        "active_urgencies": urgencies,
        "total_patients": total_patients,
        "system_status": "online"
    }

@router.get("/config/deployment", dependencies=[Depends(verify_admin_token)])
async def get_deployment_config(request: Request):
    """Retorna configuración dinámica de despliegue (Webhooks, URLs)."""
    # Detectamos la URL base actual si no está forzada en ENV
    host = request.headers.get("host", "localhost:8000")
    protocol = "https" if request.headers.get("x-forwarded-proto") == "https" else "http"
    base_url = f"{protocol}://{host}"
    
    return {
        "webhook_ycloud_url": f"{base_url}/webhook/ycloud",
        "webhook_ycloud_internal_port": os.getenv("WHATSAPP_SERVICE_PORT", "8002"),
        "orchestrator_url": base_url,
        "environment": os.getenv("ENVIRONMENT", "development")
    }

# ==================== ENDPOINTS BÚSQUEDA SEMÁNTICA ====================

@router.get("/patients/search-semantic", dependencies=[Depends(verify_admin_token)])
async def search_patients_by_symptoms(
    query: str,
    limit: int = 20
):
    """
    Búsqueda semántica de pacientes por síntomas mencionados en chats IA.
    Busca coincidencias de texto en la tabla chat_messages relacionadas con síntomas.
    
    Args:
        query: Texto a buscar (ej: "dolor de muela", "gingivitis")
        limit: Número máximo de resultados
        
    Returns:
        Lista de pacientes con matches semánticos
    """
    try:
        # Buscar mensajes de chat que contengan el query (case-insensitive)
        chat_matches = await db.pool.fetch("""
            SELECT DISTINCT patient_id
            FROM chat_messages
            WHERE content ILIKE $1
            ORDER BY created_at DESC
            LIMIT $2
        """, f"%{query}%", limit)
        
        patient_ids = [row['patient_id'] for row in chat_matches if row['patient_id'] is not None]
        
        if not patient_ids:
            return []
            
        # Obtener datos de pacientes
        patients = await db.pool.fetch("""
            SELECT id, first_name, last_name, phone_number, email, insurance_provider, dni, created_at
            FROM patients
            WHERE id = ANY($1::int[])
            AND status = 'active'
        """, patient_ids)
        
        return [dict(row) for row in patients]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en búsqueda semántica: {str(e)}")

# ==================== ENDPOINTS SEGURO / OBRAS SOCIALES ====================

@router.get("/patients/{patient_id}/insurance-status", dependencies=[Depends(verify_admin_token)])
async def get_patient_insurance_status(patient_id: int):
    """
    Verifica el estado de la credencial de obra social de un paciente.
    
    Returns:
        - status: 'ok' | 'warning' | 'expired'
        - requires_token: boolean (ej: OSDE requiere token)
        - message: string con descripción del estado
        - expiration_days: días hasta el vencimiento (negativo = vencido)
        - insurance_provider: nombre de la obra social
    """
    try:
        # Obtener datos del paciente y su obra social
        patient = await db.pool.fetchrow("""
            SELECT id, first_name, last_name, phone_number, insurance_provider, 
                   insurance_number, insurance_expiry_date, insurance_verified
            FROM patients
            WHERE id = $1 AND status = 'active'
        """, patient_id)
        
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        insurance_provider = patient.get('insurance_provider') or ''
        expiry_date = patient.get('insurance_expiry_date')
        
        # Si no tiene obra social configurada
        if not insurance_provider:
            return {
                "status": "ok",
                "requires_token": False,
                "message": "Sin obra social configurada",
                "expiration_days": None,
                "insurance_provider": None
            }
        
        # Verificar si requiere token (algunas obras sociales específicas)
        requires_token = insurance_provider.upper() in ['OSDE', 'SWISS MEDICAL', 'GALENO', 'MEDICINA PREPAGA']
        
        # Calcular días hasta vencimiento
        expiration_days = None
        if expiry_date:
            if isinstance(expiry_date, str):
                expiry_date = datetime.fromisoformat(expiry_date.split('T')[0])
            
            today = date.today()
            delta = expiry_date - today
            expiration_days = delta.days
        
        # Determinar estado
        if expiration_days is not None and expiration_days < 0:
            # Credencial vencida
            return {
                "status": "expired",
                "requires_token": requires_token,
                "message": f"Credencial vencida hace {abs(expiration_days)} días. Requiere renovación.",
                "expiration_days": expiration_days,
                "insurance_provider": insurance_provider
            }
        elif expiration_days is not None and expiration_days <= 30:
            # Credencial próxima a vencer (30 días)
            return {
                "status": "warning",
                "requires_token": requires_token,
                "message": f"Credencial vence en {expiration_days} días. Considera renovar.",
                "expiration_days": expiration_days,
                "insurance_provider": insurance_provider
            }
        else:
            # Todo bien
            message = "Credencial vigente"
            if requires_token:
                message += ". Requiere validación de token"
            
            return {
                "status": "ok",
                "requires_token": requires_token,
                "message": message,
                "expiration_days": expiration_days,
                "insurance_provider": insurance_provider
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando seguro: {str(e)}")

# ==================== ENDPOINTS PACIENTES ====================

@router.get("/patients", dependencies=[Depends(verify_admin_token)])
async def list_patients(search: str = None, limit: int = 50):
    """Listar pacientes con búsqueda por nombre o DNI."""
    query = """
        SELECT id, first_name, last_name, phone_number, email, insurance_provider 
        FROM patients 
        WHERE status = 'active'
    """
    params = []
    
    if search:
        query += " AND (first_name ILIKE $1 OR last_name ILIKE $1 OR phone_number ILIKE $1)"
        params.append(f"%{search}%")
    
    query += " ORDER BY created_at DESC LIMIT 50"
    
    if not search:
        rows = await db.pool.fetch(query)
    else:
        rows = await db.pool.fetch(query, params[0])
        
    return [dict(row) for row in rows]

@router.post("/patients", dependencies=[Depends(verify_admin_token)])
async def create_patient(p: PatientCreate):
    """Crear un nuevo paciente manualmente."""
    try:
        # Verificar que el teléfono es único
        existing = await db.pool.fetchval(
            "SELECT id FROM patients WHERE phone_number = $1",
            p.phone_number
        )
        if existing:
            raise HTTPException(status_code=409, detail="Ya existe un paciente con ese número de teléfono")
        
        row = await db.pool.fetchrow("""
            INSERT INTO patients (
                phone_number, first_name, last_name, email, insurance_provider, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'active', NOW())
            RETURNING id
        """, p.phone_number, p.first_name, p.last_name, p.email, p.insurance)
        
        return {"id": row['id'], "status": "created", "phone": p.phone_number}
        
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Paciente con este teléfono ya existe")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creando paciente: {str(e)}")

@router.get("/patients/{id}/records", dependencies=[Depends(verify_admin_token)])
async def get_clinical_records(id: int):
    """Obtener historia clínica de un paciente."""
    rows = await db.pool.fetch("""
        SELECT id, appointment_id, diagnosis, treatment_plan, created_at 
        FROM clinical_records 
        WHERE patient_id = $1 
        ORDER BY created_at DESC
    """, id)
    return [dict(row) for row in rows]

@router.post("/patients/{id}/records", dependencies=[Depends(verify_admin_token)])
async def add_clinical_note(id: int, note: ClinicalNote):
    """Agregar una evolución/nota a la historia clínica."""
    await db.pool.execute("""
        INSERT INTO clinical_records (id, patient_id, diagnosis, odontogram, created_at)
        VALUES ($1, $2, $3, $4, NOW())
    """, str(uuid.uuid4()), id, note.content, json.dumps(note.odontogram_data) if note.odontogram_data else None)
    return {"status": "ok"}

# ==================== ENDPOINTS TURNOS (AGENDA) ====================

@router.get("/appointments", dependencies=[Depends(verify_admin_token)])
async def list_appointments(start_date: str, end_date: str):
    """Obtener turnos para el calendario con source (AI vs Manual)."""
    rows = await db.pool.fetch("""
        SELECT a.id, a.appointment_datetime, a.duration_minutes, a.status, a.urgency_level,
               a.source, a.appointment_type, a.notes,
               p.first_name, p.last_name, p.phone_number,
               prof.first_name as professional_name, prof.id as professional_id
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        LEFT JOIN professionals prof ON a.professional_id = prof.id
        WHERE a.appointment_datetime BETWEEN $1 AND $2
        ORDER BY a.appointment_datetime ASC
    """, datetime.fromisoformat(start_date), datetime.fromisoformat(end_date))
    
    return [dict(row) for row in rows]


# ==================== ENDPOINT COLISION DETECTION ====================

@router.get("/appointments/check-collisions", dependencies=[Depends(verify_admin_token)])
async def check_collisions(
    professional_id: int,
    datetime_str: str,
    duration_minutes: int = 60,
    exclude_appointment_id: str = None
):
    """Verificar si hay colisiones de horario para un profesional."""
    target_datetime = datetime.fromisoformat(datetime_str)
    target_end = target_datetime + timedelta(minutes=duration_minutes)
    
    # Query para buscar turnos que se solapan
    overlap_query = """
        SELECT id, appointment_datetime, duration_minutes, status, source
        FROM appointments
        WHERE professional_id = $1
        AND status NOT IN ('cancelled', 'no-show')
        AND appointment_datetime < $3
        AND appointment_datetime + (duration_minutes || ' minutes')::interval > $2
    """
    params = [professional_id, target_datetime, target_end]
    
    if exclude_appointment_id:
        overlap_query += " AND id != $4"
        params.append(exclude_appointment_id)
    
    overlapping = await db.pool.fetch(overlap_query, *params)
    
    # Verificar también bloques de GCalendar
    gcal_blocks = await db.pool.fetch("""
        SELECT id, title, start_datetime, end_datetime
        FROM google_calendar_blocks
        WHERE professional_id = $1 OR professional_id IS NULL
        AND start_datetime < $3
        AND end_datetime > $2
    """, professional_id, target_datetime, target_end)
    
    has_collisions = len(overlapping) > 0 or len(gcal_blocks) > 0
    
    return {
        "has_collisions": has_collisions,
        "conflicting_appointments": [dict(row) for row in overlapping],
        "conflicting_blocks": [dict(row) for row in gcal_blocks]
    }

@router.post("/appointments", dependencies=[Depends(verify_admin_token)])
async def create_appointment_manual(apt: AppointmentCreate, request: Request):
    """Agendar turno manualmente desde el admin."""
    
    try:
        # 0. Verificar colisiones si está habilitado
        if apt.check_collisions:
            collision_response = await check_collisions(
                apt.professional_id,
                apt.datetime.isoformat(),
                60,
                None
            )
            if collision_response["has_collisions"]:
                conflicts = []
                for apt_conflict in collision_response["conflicting_appointments"]:
                    conflicts.append(f"Turno existente: {apt_conflict['appointment_datetime']}")
                for block in collision_response["conflicting_blocks"]:
                    conflicts.append(f"Bloqueo GCalendar: {block['title']} ({block['start_datetime']})")
                raise HTTPException(
                    status_code=409, 
                    detail=f"Hay colisiones de horario: {'; '.join(conflicts)}"
                )
        
        # 1. Validar que professional_id existe
        prof_exists = await db.pool.fetchval(
            "SELECT id FROM professionals WHERE id = $1 AND is_active = true",
            apt.professional_id
        )
        if not prof_exists:
            raise HTTPException(status_code=400, detail="Profesional inválido o inactivo")
        
        # 2. Resolver patient_id
        pid = apt.patient_id
        if not pid and apt.patient_phone:
            # Buscar por teléfono
            exist = await db.pool.fetchrow("SELECT id FROM patients WHERE phone_number = $1", apt.patient_phone)
            if exist:
                pid = exist['id']
            else:
                # Crear paciente temporal
                new_p = await db.pool.fetchrow(
                    "INSERT INTO patients (phone_number, first_name, created_at) VALUES ($1, $2, NOW()) RETURNING id",
                    apt.patient_phone,
                    "Paciente Manual"
                )
                pid = new_p['id']
        
        if not pid:
            raise HTTPException(status_code=400, detail="Se requiere ID de paciente o teléfono válido.")
        
        # 3. Validar que patient_id existe
        patient_exists = await db.pool.fetchval("SELECT id FROM patients WHERE id = $1", pid)
        if not patient_exists:
            raise HTTPException(status_code=400, detail="Paciente no encontrado")
        
        # 4. Crear turno (source='manual')
        new_id = str(uuid.uuid4())
        await db.pool.execute("""
            INSERT INTO appointments (
                id, patient_id, professional_id, appointment_datetime, 
                duration_minutes, appointment_type, status, urgency_level, source, created_at
            ) VALUES ($1, $2, $3, $4, 60, $5, 'confirmed', 'normal', 'manual', NOW())
        """, new_id, pid, apt.professional_id, apt.datetime, apt.type)
        
        # 5. Sincronizar con Google Calendar
        try:
            summary = f"Cita Dental: {appointment_data['first_name']} {appointment_data['last_name'] or ''} - {apt.type}"
            start_time = apt.datetime.isoformat()
            end_time = (apt.datetime + timedelta(minutes=60)).isoformat()
            
            gcal_event = gcal_service.create_event(
                summary=summary,
                start_time=start_time,
                end_time=end_time,
                description=f"Paciente: {appointment_data['first_name']}\nTel: {appointment_data['phone_number']}\nNotas: {apt.notes or ''}"
            )
            
            if gcal_event:
                await db.pool.execute(
                    "UPDATE appointments SET google_calendar_event_id = $1, google_calendar_sync_status = 'synced' WHERE id = $2",
                    gcal_event['id'], new_id
                )
        except Exception as ge:
            print(f"Error syncing with GCal: {ge}")

        # 6. Emitir evento de Socket.IO para actualización en tiempo real
        if appointment_data:
            await emit_appointment_event("NEW_APPOINTMENT", dict(appointment_data), request)
        
        return {"id": new_id, "status": "confirmed", "patient_id": pid, "source": "manual"}
        
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(status_code=400, detail="ID de profesional o paciente no válido")
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Turno duplicado para ese horario")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando turno: {str(e)}")

@router.patch("/appointments/{id}/status", dependencies=[Depends(verify_admin_token)])
async def update_appointment_status(id: str, status: str, request: Request):
    """Cambiar estado: confirmed, cancelled, attended, no_show."""
    await db.pool.execute("UPDATE appointments SET status = $1 WHERE id = $2", status, id)
    
    # Obtener datos actualizados del turno para emitir evento
    appointment_data = await db.pool.fetchrow("""
        SELECT a.id, a.patient_id, a.professional_id, a.appointment_datetime, 
               a.appointment_type, a.status, a.urgency_level,
               p.first_name, p.last_name, p.phone_number,
               prof.first_name as professional_name,
               a.google_calendar_event_id, a.google_calendar_sync_status
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN professionals prof ON a.professional_id = prof.id
        WHERE a.id = $1
    """, id)
    
    if appointment_data:
        # 1. Sincronizar cancelación con Google Calendar
        if status == 'cancelled' and appointment_data['google_calendar_event_id']:
            try:
                gcal_service.delete_event(appointment_data['google_calendar_event_id'])
                await db.pool.execute(
                    "UPDATE appointments SET google_calendar_sync_status = 'cancelled' WHERE id = $1",
                    id
                )
            except Exception as ge:
                print(f"Error deleting GCal event: {ge}")

        # 2. Emitir evento según el nuevo estado
        if status == 'cancelled':
            await emit_appointment_event("APPOINTMENT_DELETED", {"id": id}, request)
        else:
            await emit_appointment_event("APPOINTMENT_UPDATED", dict(appointment_data), request)
    
    return {"status": "updated"}

# ==================== ENDPOINTS SLOTS DISPONIBLES ====================

class NextSlotsResponse(BaseModel):
    slot_start: str
    slot_end: str
    duration_minutes: int
    professional_id: int
    professional_name: str

@router.get("/appointments/next-slots", response_model=List[NextSlotsResponse], dependencies=[Depends(verify_admin_token)])
async def get_next_available_slots(
    days_ahead: int = 3,
    slot_duration_minutes: int = 20
):
    """
    Obtiene los próximos huecos disponibles para urgencias (triaje de 15-20 minutos).
    
    Busca gaps en la agenda de los próximos N días considerando:
    - Turnos existentes
    - Bloques de Google Calendar
    - Horario laboral: 9:00 a 18:00
    
    Returns:
        Lista de los próximos 3-5 huecos disponibles
    """
    import random
    
    # Obtener profesionales activos
    professionals = await db.pool.fetch("""
        SELECT id, first_name, last_name 
        FROM professionals 
        WHERE is_active = true
    """)
    
    if not professionals:
        # Return mock data for development if no professionals exist
        return [
            {
                "slot_start": datetime.now().replace(hour=10, minute=0, second=0, microsecond=0).isoformat(),
                "slot_end": datetime.now().replace(hour=10, minute=20, second=0, microsecond=0).isoformat(),
                "duration_minutes": 20,
                "professional_id": 1,
                "professional_name": "Dr. Demo"
            },
            {
                "slot_start": datetime.now().replace(hour=11, minute=0, second=0, microsecond=0).isoformat(),
                "slot_end": datetime.now().replace(hour=11, minute=20, second=0, microsecond=0).isoformat(),
                "duration_minutes": 20,
                "professional_id": 1,
                "professional_name": "Dr. Demo"
            },
            {
                "slot_start": datetime.now().replace(hour=14, minute=30, second=0, microsecond=0).isoformat(),
                "slot_end": datetime.now().replace(hour=14, minute=50, second=0, microsecond=0).isoformat(),
                "duration_minutes": 20,
                "professional_id": 1,
                "professional_name": "Dr. Demo"
            }
        ]
    
    available_slots: List[Dict[str, Any]] = []
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    for day_offset in range(days_ahead + 1):
        current_date = today + timedelta(days=day_offset)
        
        # Skip weekends
        if current_date.weekday() >= 5:
            continue
            
        day_start = current_date.replace(hour=9, minute=0, second=0, microsecond=0)
        day_end = current_date.replace(hour=18, minute=0, second=0, microsecond=0)
        
        for prof in professionals:
            prof_id = prof['id']
            prof_name = f"{prof['first_name']} {prof.get('last_name', '')}".strip()
            
            # Obtener turnos del día para este profesional
            appointments = await db.pool.fetch("""
                SELECT appointment_datetime, duration_minutes
                FROM appointments
                WHERE professional_id = $1
                AND DATE(appointment_datetime) = $2
                AND status NOT IN ('cancelled', 'no-show')
                ORDER BY appointment_datetime ASC
            """, prof_id, current_date.date())
            
            # Obtener bloques de GCalendar del día
            gcal_blocks = await db.pool.fetch("""
                SELECT start_datetime, end_datetime
                FROM google_calendar_blocks
                WHERE (professional_id = $1 OR professional_id IS NULL)
                AND DATE(start_datetime) = $2
                ORDER BY start_datetime ASC
            """, prof_id, current_date.date())
            
            # Crear lista de busy periods (turnos + bloques)
            busy_periods = []
            
            for apt in appointments:
                apt_start = apt['appointment_datetime']
                apt_end = apt_start + timedelta(minutes=apt.get('duration_minutes', 60))
                busy_periods.append((apt_start, apt_end))
            
            for block in gcal_blocks:
                busy_periods.append((block['start_datetime'], block['end_datetime']))
            
            # Ordenar por inicio
            busy_periods.sort(key=lambda x: x[0])
            
            # Encontrar gaps
            current_time = day_start
            
            for busy_start, busy_end in busy_periods:
                # Verificar gap antes del primer ocupado
                if current_time < busy_start:
                    gap_duration = int((busy_start - current_time).total_seconds() / 60)
                    if gap_duration >= slot_duration_minutes - 5:  # Allow 5 min tolerance
                        slot_start = current_time
                        slot_end = slot_start + timedelta(minutes=slot_duration_minutes)
                        available_slots.append({
                            "slot_start": slot_start.isoformat(),
                            "slot_end": slot_end.isoformat(),
                            "duration_minutes": slot_duration_minutes,
                            "professional_id": prof_id,
                            "professional_name": prof_name
                        })
                
                current_time = max(current_time, busy_end)
            
            # Verificar gap después del último ocupado hasta fin del día
            if current_time < day_end:
                gap_duration = int((day_end - current_time).total_seconds() / 60)
                if gap_duration >= slot_duration_minutes - 5:
                    slot_start = current_time
                    slot_end = slot_start + timedelta(minutes=slot_duration_minutes)
                    available_slots.append({
                        "slot_start": slot_start.isoformat(),
                        "slot_end": slot_end.isoformat(),
                        "duration_minutes": slot_duration_minutes,
                        "professional_id": prof_id,
                        "professional_name": prof_name
                    })
    
    # Ordenar por fecha y hora, tomar los primeros 5
    available_slots.sort(key=lambda x: x['slot_start'])
    return available_slots[:5]


# ==================== ENDPOINTS PROFESIONALES ====================

@router.get("/professionals", dependencies=[Depends(verify_admin_token)])
async def list_professionals():
    rows = await db.pool.fetch("SELECT id, first_name, last_name, specialization, is_active FROM professionals")
    return [dict(row) for row in rows]

# ==================== ENDPOINTS GOOGLE CALENDAR ====================

@router.get("/calendar/blocks", dependencies=[Depends(verify_admin_token)])
async def get_calendar_blocks(start_date: str, end_date: str):
    """Obtener bloques de Google Calendar para el período."""
    try:
        rows = await db.pool.fetch("""
            SELECT id, google_event_id, title, description,
                   start_datetime, end_datetime, all_day,
                   professional_id, sync_status
            FROM google_calendar_blocks
            WHERE start_datetime BETWEEN $1 AND $2
            ORDER BY start_datetime ASC
        """, datetime.fromisoformat(start_date), datetime.fromisoformat(end_date))
        
        return [dict(row) for row in rows]
    except Exception:
        # Si la tabla no existe, retornar array vacío (para desarrollo)
        return []


@router.post("/calendar/blocks", dependencies=[Depends(verify_admin_token)])
async def create_calendar_block(block: GCalendarBlockCreate):
    """Crear un bloque de calendario (simulado para desarrollo)."""
    try:
        new_id = str(uuid.uuid4())
        await db.pool.execute("""
            INSERT INTO google_calendar_blocks (
                id, google_event_id, title, description,
                start_datetime, end_datetime, all_day, professional_id, sync_status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', NOW())
        """, new_id, block.google_event_id, block.title, block.description,
             block.start_datetime, block.end_datetime, block.all_day, block.professional_id)
        
        return {"id": new_id, "status": "created"}
    except Exception as e:
        # Si la tabla no existe, retornar success simulado
        return {"id": str(uuid.uuid4()), "status": "simulated", "message": str(e)}


@router.delete("/calendar/blocks/{block_id}", dependencies=[Depends(verify_admin_token)])
async def delete_calendar_block(block_id: str):
    """Eliminar un bloque de Google Calendar."""
    await db.pool.execute("DELETE FROM google_calendar_blocks WHERE id = $1", block_id)
    return {"status": "deleted"}


@router.post("/sync/calendar", dependencies=[Depends(verify_admin_token)])
async def trigger_sync():
    """
    Sincronización REAL con Google Calendar.
    Trae eventos de GCal que NO son appointments y los guarda como bloqueos.
    """
    try:
        # 1. Obtener eventos de los próximos 30 días
        time_min = datetime.now().isoformat() + 'Z'
        time_max = (datetime.now() + timedelta(days=30)).isoformat() + 'Z'
        
        events = gcal_service.list_events(time_min=time_min, time_max=time_max)
        
        created = 0
        updated = 0
        
        # Obtener IDs de eventos que ya tenemos para saber si es update o create
        existing_google_ids = await db.pool.fetch("SELECT google_event_id FROM google_calendar_blocks")
        existing_ids_set = {row['google_event_id'] for row in existing_google_ids}
        
        # Tambien obtener los IDs de eventos que son APPOINTMENTS para no duplicarlos
        appointment_google_ids = await db.pool.fetch("SELECT google_calendar_event_id FROM appointments WHERE google_calendar_event_id IS NOT NULL")
        apt_ids_set = {row['google_calendar_event_id'] for row in appointment_google_ids}

        tenant_id = await db.pool.fetchval("SELECT id FROM tenants LIMIT 1")

        for event in events:
            g_id = event['id']
            
            # Si el evento es un turno nuestro, lo ignoramos para no duplicarlo como "bloqueo"
            if g_id in apt_ids_set:
                continue
                
            summary = event.get('summary', 'Bloqueo GCal')
            description = event.get('description', '')
            start = event['start'].get('dateTime') or event['start'].get('date')
            end = event['end'].get('dateTime') or event['end'].get('date')
            all_day = 'date' in event['start']
            
            if g_id in existing_ids_set:
                await db.pool.execute("""
                    UPDATE google_calendar_blocks SET
                        title = $1, description = $2, start_datetime = $3, end_datetime = $4,
                        all_day = $5, updated_at = NOW()
                    WHERE google_event_id = $6
                """, summary, description, datetime.fromisoformat(start.replace('Z', '+00:00')), 
                     datetime.fromisoformat(end.replace('Z', '+00:00')), all_day, g_id)
                updated += 1
            else:
                await db.pool.execute("""
                    INSERT INTO google_calendar_blocks (
                        tenant_id, google_event_id, title, description,
                        start_datetime, end_datetime, all_day
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, tenant_id, g_id, summary, description, 
                     datetime.fromisoformat(start.replace('Z', '+00:00')), 
                     datetime.fromisoformat(end.replace('Z', '+00:00')), all_day)
                created += 1
        
        # Registrar sync en log
        await db.pool.execute("""
            INSERT INTO calendar_sync_log (
                tenant_id, sync_type, direction, events_processed, 
                events_created, events_updated, completed_at
            ) VALUES ($1, 'manual', 'inbound', $2, $3, $4, NOW())
        """, tenant_id, len(events), created, updated)
        
        return {
            "status": "success",
            "events_processed": len(events),
            "created": created,
            "updated": updated,
            "message": f"Sincronización completada. {created} nuevos, {updated} actualizados."
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error en sincronización: {str(e)}"
        }
# --- Función Helper de Entorno (Legacy support) ---
async def sync_environment():
    """Crea el tenant default si no existe (Necesario para que arranque main.py)."""
    # Esta función es llamada por main.py en el startup
    exists = await db.pool.fetchval("SELECT id FROM tenants LIMIT 1")
    if not exists:
        await db.pool.execute("""
            INSERT INTO tenants (store_name, bot_phone_number) 
            VALUES ('Clínica Dental', '5491100000000')
        """)
# ==================== ENDPOINTS TRATAMIENTOS ====================

class TreatmentTypeUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    default_duration_minutes: int
    min_duration_minutes: int
    max_duration_minutes: int
    complexity_level: str
    category: str
    requires_multiple_sessions: bool = False
    session_gap_days: int = 0
    is_active: bool = True
    is_available_for_booking: bool = True
    internal_notes: Optional[str] = None


@router.get("/treatment-types", dependencies=[Depends(verify_admin_token)])
async def list_treatment_types():
    """Listar tipos de tratamiento con sus duraciones."""
    rows = await db.pool.fetch("""
        SELECT id, code, name, description, default_duration_minutes,
               min_duration_minutes, max_duration_minutes, complexity_level,
               category, requires_multiple_sessions, session_gap_days,
               is_active, is_available_for_booking, internal_notes
        FROM treatment_types
        ORDER BY category, name
    """)
    return [dict(row) for row in rows]


@router.get("/treatment-types/{code}", dependencies=[Depends(verify_admin_token)])
async def get_treatment_type(code: str):
    """Obtener un tipo de tratamiento específico."""
    row = await db.pool.fetchrow("""
        SELECT id, code, name, description, default_duration_minutes,
               min_duration_minutes, max_duration_minutes, complexity_level,
               category, requires_multiple_sessions, session_gap_days,
               is_active, is_available_for_booking, internal_notes
        FROM treatment_types
        WHERE code = $1
    """, code)
    
    if not row:
        raise HTTPException(status_code=404, detail="Tipo de tratamiento no encontrado")
    
    return dict(row)


@router.put("/treatment-types/{code}", dependencies=[Depends(verify_admin_token)])
async def update_treatment_type(code: str, treatment: TreatmentTypeUpdate):
    """Actualizar configuración de un tipo de tratamiento."""
    result = await db.pool.execute("""
        UPDATE treatment_types SET
            name = $1,
            description = $2,
            default_duration_minutes = $3,
            min_duration_minutes = $4,
            max_duration_minutes = $5,
            complexity_level = $6,
            category = $7,
            requires_multiple_sessions = $8,
            session_gap_days = $9,
            is_active = $10,
            is_available_for_booking = $11,
            internal_notes = $12,
            updated_at = NOW()
        WHERE code = $13
    """, treatment.name, treatment.description, treatment.default_duration_minutes,
        treatment.min_duration_minutes, treatment.max_duration_minutes,
        treatment.complexity_level, treatment.category, treatment.requires_multiple_sessions,
        treatment.session_gap_days, treatment.is_active, treatment.is_available_for_booking,
        treatment.internal_notes, code)
    
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Tipo de tratamiento no encontrado")
    
    return {"status": "updated", "code": code}


@router.get("/treatment-types/{code}/duration", dependencies=[Depends(verify_admin_token)])
async def get_treatment_duration(code: str, urgency_level: str = "normal"):
    """
    Obtener duración calculada para un tratamiento según urgencia.
    
    Args:
        code: Código del tratamiento (ej: 'root_canal', 'cleaning')
        urgency_level: 'low', 'normal', 'high', 'emergency'
    
    Returns:
        duration_minutes: Duración calculada en minutos
    """
    row = await db.pool.fetchrow("""
        SELECT default_duration_minutes, min_duration_minutes, max_duration_minutes
        FROM treatment_types
        WHERE code = $1 AND is_active = TRUE AND is_available_for_booking = TRUE
    """, code)
    
    if not row:
        # Return default duration if treatment not found
        return {"duration_minutes": 30, "source": "default"}
    
    default_duration = row['default_duration_minutes']
    min_duration = row['min_duration_minutes']
    max_duration = row['max_duration_minutes']
    
    # Calculate duration based on urgency
    if urgency_level == 'emergency':
        calculated_duration = min(min_duration, default_duration)
    elif urgency_level == 'high':
        calculated_duration = default_duration
    elif urgency_level == 'normal':
        calculated_duration = default_duration
    else:  # low
        calculated_duration = max(default_duration, max_duration)
    
    return {
        "duration_minutes": calculated_duration,
        "source": "calculated",
        "treatment_code": code,
        "urgency_level": urgency_level,
        "details": {
            "default": default_duration,
            "min": min_duration,
            "max": max_duration
        }
    }
