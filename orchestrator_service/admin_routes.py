import os
import uuid
import json
import asyncpg
import httpx
import logging
import re
from datetime import datetime, timedelta, date, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Depends, Request, status, BackgroundTasks
from pydantic import BaseModel
from db import db
from gcal_service import gcal_service
from analytics_service import analytics_service

logger = logging.getLogger(__name__)

# Configuración
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin-secret-token")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "internal-secret-token")
WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://whatsapp:8002")

ARG_TZ = timezone(timedelta(hours=-3))

router = APIRouter(prefix="/admin", tags=["Dental Admin"])

def normalize_phone(phone: str) -> str:
    """Asegura que el número tenga el formato +123456789 (E.164)"""
    clean = re.sub(r'\D', '', phone)
    if not phone.startswith('+'):
        return '+' + clean
    return '+' + clean

# --- Helper para emitir eventos de Socket.IO ---
async def emit_appointment_event(event_type: str, data: Dict[str, Any], request: Request):
    """Emit appointment events via Socket.IO through the app state."""
    if hasattr(request.app.state, 'emit_appointment_event'):
        await request.app.state.emit_appointment_event(event_type, data)

# --- Background Task para envío a WhatsApp ---
async def send_to_whatsapp_task(phone: str, message: str, business_number: str):
    """Tarea en segundo plano para no bloquear la UI mientras se envía el mensaje."""
    normalized = normalize_phone(phone)
    logger.info(f"📤 Intentando envío manual a WhatsApp: {normalized} via {WHATSAPP_SERVICE_URL}")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            ws_resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/send",
                json={
                    "to": normalized,
                    "message": message
                },
                headers={
                    "X-Internal-Token": INTERNAL_API_TOKEN,
                    "X-Correlation-Id": str(uuid.uuid4())
                },
                params={"from_number": business_number}
            )
            if ws_resp.status_code != 200:
                logger.error(f"❌ Error en WhatsApp Service ({ws_resp.status_code}): {ws_resp.text}")
            else:
                logger.info(f"✅ WhatsApp background send success for {normalized}")
    except Exception as e:
        logger.error(f"❌ WhatsApp background send CRITICAL failed for {normalized}: {str(e)}")

# --- Dependencia de Seguridad (Triple Capa Nexus v7.6) ---
async def verify_admin_token(
    request: Request,
    x_admin_token: str = Header(None),
    authorization: str = Header(None)
):
    """
    Implementa la validación de doble factor para administración:
    1. Validar Token JWT (Identidad y Sesión)
    2. Validar X-Admin-Token (Autorización Estática de Infraestructura)
    """
    # 1. Validar X-Admin-Token
    if not ADMIN_TOKEN:
        logger.warning("⚠️ ADMIN_TOKEN no configurado. Validación estática omitida.")
    elif x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Token de infraestructura (X-Admin-Token) inválido.")

    # 2. Validar JWT (Capa de Identidad)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión no válida. Token JWT requerido.")
    
    token = authorization.split(" ")[1]
    from auth_service import auth_service
    user_data = auth_service.decode_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Token de sesión expirado o inválido.")
    
    # 3. Validar Rol (CEOs, Secretarias y Profesionales tienen acceso básico)
    if user_data.role not in ['ceo', 'secretary', 'professional']:
        raise HTTPException(status_code=403, detail="No tienes permisos suficientes para realizar esta acción.")

    # Inyectar datos del usuario en el request state para uso posterior
    request.state.user = user_data
    return user_data

@router.get("/patients/phone/{phone}/context")
async def get_patient_clinical_context(
    phone: str,
    user_data=Depends(verify_admin_token)
):
    """
    Retorna el contexto clínico completo de un paciente por su teléfono:
    Basic info, última cita, próxima cita y plan de tratamiento.
    """
    normalized_phone = normalize_phone(phone)
    
    # 1. Buscar paciente
    patient = await db.pool.fetchrow("""
        SELECT id, first_name, last_name, phone_number, status, urgency_level, urgency_reason, preferred_schedule
        FROM patients 
        WHERE phone_number = $1 OR phone_number = $2
    """, normalized_phone, phone)
    
    if not patient:
        # Si no existe, es un lead puro sin registro previo
        return {
            "patient": None,
            "last_appointment": None,
            "upcoming_appointment": None,
            "treatment_plan": None,
            "is_guest": True
        }

    # 2. Última cita (pasada)
    last_apt = await db.pool.fetchrow("""
        SELECT a.id, a.appointment_datetime, a.appointment_type, a.status, 
               p.first_name as professional_name
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        WHERE a.patient_id = $1 AND a.appointment_datetime < NOW()
        ORDER BY a.appointment_datetime DESC LIMIT 1
    """, patient['id'])

    # 3. Próxima cita (futura)
    upcoming_apt = await db.pool.fetchrow("""
        SELECT a.id, a.appointment_datetime, a.appointment_type, a.status,
               p.first_name as professional_name
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        WHERE a.patient_id = $1 AND a.appointment_datetime >= NOW()
        AND a.status IN ('scheduled', 'confirmed')
        ORDER BY a.appointment_datetime ASC LIMIT 1
    """, patient['id'])

    # 4. Plan de tratamiento (del último registro clínico)
    clinical_record = await db.pool.fetchrow("""
        SELECT treatment_plan, diagnosis, record_date
        FROM clinical_records
        WHERE patient_id = $1
        ORDER BY created_at DESC LIMIT 1
    """, patient['id'])

    return {
        "patient": dict(patient),
        "last_appointment": dict(last_apt) if last_apt else None,
        "upcoming_appointment": dict(upcoming_apt) if upcoming_apt else None,
        "treatment_plan": clinical_record['treatment_plan'] if clinical_record else None,
        "diagnosis": clinical_record['diagnosis'] if clinical_record else None,
        "is_guest": patient['status'] == 'guest'
    }

class StatusUpdate(BaseModel):
    status: str # active, suspended, pending

# --- RUTAS DE ADMINISTRACIÓN DE USUARIOS ---

@router.get("/users/pending")
async def get_pending_users(user_data = Depends(verify_admin_token)):
    """ Retorna la lista de usuarios con estado 'pending' (Solo CEO/Secretary) """
    if user_data.role not in ['ceo', 'secretary']:
        raise HTTPException(status_code=403, detail="Solo el personal administrador puede ver usuarios pendientes.")
        
    users = await db.fetch("""
        SELECT id, email, role, status, created_at, first_name, last_name
        FROM users 
        WHERE status = 'pending'
        ORDER BY created_at DESC
    """)
    return [dict(u) for u in users]

@router.get("/users")
async def get_all_users(user_data = Depends(verify_admin_token)):
    """ Retorna la lista de todos los usuarios de la clínica (Solo CEO/Secretary) """
    if user_data.role not in ['ceo', 'secretary']:
        raise HTTPException(status_code=403, detail="Solo el personal administrador puede listar usuarios.")
        
    users = await db.fetch("""
        SELECT id, email, role, status, created_at, updated_at, first_name, last_name
        FROM users 
        ORDER BY status ASC, created_at DESC
    """)
    return [dict(u) for u in users]

@router.post("/users/{user_id}/status")
async def update_user_status(user_id: str, payload: StatusUpdate, user_data = Depends(verify_admin_token)):
    """ Actualiza el estado de un usuario (Aprobación/Suspensión) - Solo CEO """
    if user_data.role != 'ceo':
        raise HTTPException(status_code=403, detail="Solo el CEO puede cambiar el estado de los usuarios.")

    # Validar que el usuario exista
    target_user = await db.fetchrow("SELECT email, role FROM users WHERE id = $1", user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Actualizar estado
    await db.execute("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2", payload.status, user_id)

    # Si se cambia el estado de un profesional, sincronizar su perfil médico
    if target_user['role'] == 'professional':
        is_active = (payload.status == 'active')
        await db.execute("UPDATE professionals SET is_active = $1 WHERE user_id = $2", is_active, uuid.UUID(user_id))

    return {"message": f"Usuario {target_user['email']} actualizado a {payload.status}."}

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

class ProfessionalCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True
    availability: Dict[str, Any] = {}

class ProfessionalUpdate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    is_active: bool
    availability: Dict[str, Any]


class ChatSendMessage(BaseModel):
    phone: str
    message: str

class HumanInterventionToggle(BaseModel):
    phone: str
    activate: bool
    duration: Optional[int] = 86400000  # 24 horas en ms

# ==================== ENDPOINTS CHAT MANAGEMENT ====================

@router.get("/chat/sessions", dependencies=[Depends(verify_admin_token)])
async def get_chat_sessions():
    """
    Obtiene todas las sesiones de chat activas con su estado.
    Devuelve información de paciente, último mensaje, y estado de intervención humana.
    """
    rows = await db.pool.fetch("""
        SELECT * FROM (
            SELECT DISTINCT ON (p.phone_number)
                p.phone_number,
                p.id as patient_id,
                p.first_name || ' ' || COALESCE(p.last_name, '') as patient_name,
                cm.content as last_message,
                cm.created_at as last_message_time,
                p.human_handoff_requested,
                p.human_override_until,
                p.last_derivhumano_at,
                CASE 
                    WHEN p.human_handoff_requested AND p.human_override_until > NOW() THEN 'human_handling'
                    WHEN p.human_override_until > NOW() THEN 'silenced'
                    ELSE 'active'
                END as status,
                urgency.urgency_level
            FROM patients p
            LEFT JOIN LATERAL (
                SELECT content, created_at, role
                FROM chat_messages
                WHERE from_number = p.phone_number
                ORDER BY created_at DESC
                LIMIT 1
            ) cm ON true
            LEFT JOIN LATERAL (
                SELECT urgency_level
                FROM appointments
                WHERE patient_id = p.id
                ORDER BY created_at DESC
                LIMIT 1
            ) urgency ON true
            WHERE EXISTS (
                SELECT 1 FROM chat_messages 
                WHERE from_number = p.phone_number
            )
            ORDER BY p.phone_number, cm.created_at DESC
        ) sub
        ORDER BY last_message_time DESC NULLS LAST
    """)
    
    sessions = []
    for row in rows:
        # Calcular mensajes no leídos
        unread = await db.pool.fetchval("""
            SELECT COUNT(*) 
            FROM chat_messages 
            WHERE from_number = $1 
            AND role = 'user' 
            AND created_at > COALESCE(
                (SELECT created_at FROM chat_messages 
                 WHERE from_number = $1 AND role = 'assistant' 
                 ORDER BY created_at DESC LIMIT 1),
                '1970-01-01'::timestamptz
            )
        """, row['phone_number'])

        # Calcular si la ventana de 24hs está abierta (último mensaje del USUARIO)
        last_user_msg = await db.pool.fetchval("""
            SELECT created_at FROM chat_messages 
            WHERE from_number = $1 AND role = 'user' 
            ORDER BY created_at DESC LIMIT 1
        """, row['phone_number'])
        
        is_window_open = False
        if last_user_msg:
            # Normalize naive stored dates to ARG_TZ if they come back naive, 
            # or just use aware now with original tz
            now_localized = datetime.now(last_user_msg.tzinfo if last_user_msg.tzinfo else ARG_TZ)
            is_window_open = (now_localized - last_user_msg) < timedelta(hours=24)
        
        sessions.append({
            "phone_number": row['phone_number'],
            "patient_id": row['patient_id'],
            "patient_name": row['patient_name'],
            "last_message": row['last_message'] or "",
            "last_message_time": row['last_message_time'].isoformat() if row['last_message_time'] else None,
            "unread_count": unread or 0,
            "status": row['status'],
            "human_override_until": row['human_override_until'].isoformat() if row['human_override_until'] else None,
            "urgency_level": row['urgency_level'],
            "last_derivhumano_at": row['last_derivhumano_at'].isoformat() if row['last_derivhumano_at'] else None,
            "is_window_open": is_window_open,
            "last_user_message_time": last_user_msg.isoformat() if last_user_msg else None
        })
    
    return sessions


@router.get("/chat/messages/{phone}", dependencies=[Depends(verify_admin_token)])
async def get_chat_messages(phone: str, limit: int = 50, offset: int = 0):
    """Obtiene el historial de mensajes para un número de teléfono específico con paginación."""
    rows = await db.pool.fetch("""
        SELECT id, from_number, role, content, created_at, correlation_id
        FROM chat_messages
        WHERE from_number = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    """, phone, limit, offset)
    
    # Invertir para que lleguen en orden cronológico al frontend
    rows = sorted(rows, key=lambda x: x['created_at'])
    
    messages = []
    for row in rows:
        # Detectar si es un mensaje de derivhumano (sistema indica handoff)
        is_derivhumano = row['role'] == 'assistant' and 'representante humano' in row['content'].lower()
        
        messages.append({
            "id": row['id'],
            "from_number": row['from_number'],
            "role": row['role'],
            "content": row['content'],
            "created_at": row['created_at'].isoformat(),
            "is_derivhumano": is_derivhumano
        })
    
    return messages




@router.post("/chat/human-intervention", dependencies=[Depends(verify_admin_token)])
async def toggle_human_intervention(payload: HumanInterventionToggle, request: Request):
    """
    Activa o desactiva la intervención humana para un chat específico.
    Cuando está activo, la IA permanece silenciada por la duración especificada.
    """
    if payload.activate:
        # Activar intervención humana
        override_until = datetime.now(ARG_TZ) + timedelta(milliseconds=payload.duration)
        
        await db.pool.execute("""
            UPDATE patients 
            SET human_handoff_requested = TRUE,
                human_override_until = $1,
                last_derivhumano_at = NULL,
                updated_at = NOW()
            WHERE phone_number = $2
        """, override_until, payload.phone)
        
        logger.info(f"👤 Intervención humana activada para {payload.phone} hasta {override_until}")
        
        # Notificar vía Socket
        await emit_appointment_event('HUMAN_OVERRIDE_CHANGED', {
            'phone_number': payload.phone,
            'enabled': True,
            'until': override_until.isoformat()
        }, request)
        
        return {
            "status": "activated",
            "phone": payload.phone,
            "until": override_until.isoformat()
        }
    else:
        # Desactivar intervención humana
        await db.pool.execute("""
            UPDATE patients 
            SET human_handoff_requested = FALSE,
                human_override_until = NULL,
                updated_at = NOW()
            WHERE phone_number = $1
        """, payload.phone)
        
        logger.info(f"🤖 IA reactivada para {payload.phone}")
        
        # Notificar vía Socket
        await emit_appointment_event('HUMAN_OVERRIDE_CHANGED', {
            'phone_number': payload.phone,
            'enabled': False
        }, request)
        
        return {
            "status": "deactivated",
            "phone": payload.phone
        }


@router.post("/chat/remove-silence", dependencies=[Depends(verify_admin_token)])
async def remove_silence(payload: dict, request: Request):
    """Remueve el silencio de la IA para un número específico."""
    phone = payload.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    await db.pool.execute("""
        UPDATE patients 
        SET human_handoff_requested = FALSE,
            human_override_until = NULL,
            updated_at = NOW()
        WHERE phone_number = $1
    """, phone)
    
    # Notificar vía Socket
    await emit_appointment_event('HUMAN_OVERRIDE_CHANGED', {
        'phone_number': phone,
        'enabled': False
    }, request)
    
    return {"status": "removed", "phone": phone}


@router.get("/internal/credentials/{name}")
async def get_internal_credential(name: str, x_internal_token: str = Header(None)):
    """Permite a servicios internos obtener credenciales de forma segura."""
    if not INTERNAL_API_TOKEN or x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="Internal token invalid")
    
    # Mapeo de nombres a variables de entorno o valores de BD
    creds = {
        "YCLOUD_API_KEY": os.getenv("YCLOUD_API_KEY"),
        "YCLOUD_WEBHOOK_SECRET": os.getenv("YCLOUD_WEBHOOK_SECRET"),
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "YCLOUD_Phone_Number_ID": os.getenv("YCLOUD_Phone_Number_ID") or os.getenv("BOT_PHONE_NUMBER")
    }
    
    val = creds.get(name)
    if val is None: # Solo 404 si la clave no existe en nuestro mapeo
        raise HTTPException(status_code=404, detail=f"Credential '{name}' not supported by this endpoint")
        
    return {"name": name, "value": val}


@router.post("/chat/send", dependencies=[Depends(verify_admin_token)])
async def send_chat_message(payload: ChatSendMessage, request: Request, background_tasks: BackgroundTasks):
    """Envía un mensaje manual por WhatsApp y lo guarda en BD."""
    try:
        # 0. Verificar ventana de 24hs (WhatsApp Policy)
        last_user_msg = await db.pool.fetchval("""
            SELECT created_at FROM chat_messages 
            WHERE from_number = $1 AND role = 'user' 
            ORDER BY created_at DESC LIMIT 1
        """, payload.phone)
        
        if not last_user_msg:
             raise HTTPException(status_code=403, detail="No se puede enviar un mensaje si el usuario nunca ha escrito.")
             
        now_localized = datetime.now(last_user_msg.tzinfo if last_user_msg.tzinfo else ARG_TZ)
        diff = now_localized - last_user_msg
        if diff > timedelta(hours=24):
             raise HTTPException(status_code=403, detail="La ventana de 24hs de WhatsApp ha expirado. El paciente debe escribir primero.")

        # 1. Guardar en Base de Datos
        correlation_id = str(uuid.uuid4())
        await db.append_chat_message(
            from_number=payload.phone,
            role='assistant',
            content=payload.message,
            correlation_id=correlation_id
        )
        
        # 2. Notificar al Frontend vía Socket
        if hasattr(request.app.state, 'emit_appointment_event'):
            await request.app.state.emit_appointment_event('NEW_MESSAGE', {
                'phone_number': payload.phone,
                'message': payload.message,
                'role': 'assistant'
            })

        # 3. Enviar a WhatsApp Service (Segundo plano para evitar latencia)
        business_number = os.getenv("YCLOUD_Phone_Number_ID") or os.getenv("BOT_PHONE_NUMBER") or "default"
        background_tasks.add_task(send_to_whatsapp_task, payload.phone, payload.message, business_number)
            
        return {"status": "sent", "correlation_id": correlation_id}
        
    except Exception as e:
        logger.error(f"Error sending manual message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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

@router.get("/settings/clinic", dependencies=[Depends(verify_admin_token)])
async def get_clinic_settings():
    """Retorna la configuración operativa de la clínica (horarios, nombre, etc)."""
    return {
        "name": os.getenv("CLINIC_NAME", "Consultorio Dental"),
        "location": os.getenv("CLINIC_LOCATION", "Mercedes, Buenos Aires"),
        "hours_start": os.getenv("CLINIC_HOURS_START", "08:00"),
        "hours_end": os.getenv("CLINIC_HOURS_END", "19:00"),
        "working_days": [0, 1, 2, 3, 4, 5], # 0=Lunes, 5=Sábado
        "time_zone": "America/Argentina/Buenos_Aires"
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
        SELECT id, first_name, last_name, phone_number, email, insurance_provider as obra_social, dni, created_at, status 
        FROM patients 
        WHERE status = 'active'
    """
    params = []
    
    if search:
        query += " AND (first_name ILIKE $1 OR last_name ILIKE $1 OR phone_number ILIKE $1 OR dni ILIKE $1)"
        params.append(f"%{search}%")
        query += " ORDER BY created_at DESC LIMIT $2"
        params.append(limit)
        rows = await db.pool.fetch(query, *params)
    else:
        query += " ORDER BY created_at DESC LIMIT $1"
        params.append(limit)
        rows = await db.pool.fetch(query, *params)
        
    return [dict(row) for row in rows]

@router.post("/professionals", dependencies=[Depends(verify_admin_token)])
async def create_professional(professional: ProfessionalCreate):
    """Crear un nuevo profesional."""
    try:
        # 1. Crear usuario asociado
        user_id = uuid.uuid4()
        # Generar un email dummy si no se provee, o usar el real
        email = professional.email or f"prof_{uuid.uuid4().hex[:8]}@dentalogic.local"
        
        await db.pool.execute("""
            INSERT INTO users (id, email, password_hash, role, first_name, status, created_at)
            VALUES ($1, $2, $3, 'professional', $4, 'active', NOW())
        """, user_id, email, "hash_placeholder", professional.name)

        # 2. Crear profesional
        await db.pool.execute("""
            INSERT INTO professionals (
                user_id, first_name, specialty, license_number, phone_number, 
                address, is_active, availability, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        """, user_id, professional.name, professional.specialty, professional.license_number,
             professional.phone, professional.address, professional.is_active,
             json.dumps(professional.availability))
             
        return {"status": "created", "user_id": str(user_id)}
    except Exception as e:
        logger.error(f"Error creating professional: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/professionals/{id}", dependencies=[Depends(verify_admin_token)])
async def update_professional(id: int, payload: ProfessionalUpdate):
    """Actualizar datos de un profesional por su ID numérico."""
    try:
        # Verificar existencia
        exists = await db.pool.fetchval("SELECT 1 FROM professionals WHERE id = $1", id)
        if not exists:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")

        # Actualizar datos básicos y disponibilidad
        await db.pool.execute("""
            UPDATE professionals SET
                first_name = $1,
                specialty = $2,
                license_number = $3,
                phone_number = $4,
                email = $5,
                is_active = $6,
                availability = $7::jsonb,
                updated_at = NOW()
            WHERE id = $8
        """, payload.name, payload.specialty, payload.license_number, 
             payload.phone, payload.email, payload.is_active, 
             json.dumps(payload.availability), id)
             
        return {"id": id, "status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating professional {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/patients/{id}", dependencies=[Depends(verify_admin_token)])
async def get_patient(id: int):
    """Obtener un paciente por ID."""
    row = await db.pool.fetchrow("""
        SELECT id, first_name, last_name, phone_number, email, insurance_provider as obra_social, dni, birth_date, created_at, status, notes
        FROM patients 
        WHERE id = $1
    """, id)
    
    if not row:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
    return dict(row)

@router.put("/patients/{id}", dependencies=[Depends(verify_admin_token)])
async def update_patient(id: int, p: PatientCreate):
    """Actualizar datos de un paciente."""
    try:
        await db.pool.execute("""
            UPDATE patients SET
                first_name = $1, last_name = $2, phone_number = $3, 
                email = $4, dni = $5, insurance_provider = $6,
                updated_at = NOW()
            WHERE id = $7
        """, p.first_name, p.last_name, p.phone_number, p.email, p.dni, p.insurance, id)
        
        return {"id": id, "status": "updated"}
    except Exception as e:
        logger.error(f"Error updating patient {id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/patients/{id}", dependencies=[Depends(verify_admin_token)])
async def delete_patient(id: int):
    """Marcar paciente como eliminado o desactivado."""
    try:
        # Por seguridad podemos hacer soft-delete
        await db.pool.execute("UPDATE patients SET status = 'deleted', updated_at = NOW() WHERE id = $1", id)
        return {"status": "deleted", "id": id}
    except Exception as e:
        logger.error(f"Error deleting patient {id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

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
async def list_appointments(start_date: str, end_date: str, professional_id: Optional[int] = None):
    """Obtener turnos para el calendario con filtro opcional por profesional."""
    query = """
        SELECT a.id, a.appointment_datetime, a.duration_minutes, a.status, a.urgency_level,
               a.source, a.appointment_type, a.notes,
               p.first_name, p.last_name, p.phone_number,
               prof.first_name as professional_name, prof.id as professional_id
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        LEFT JOIN professionals prof ON a.professional_id = prof.id
        WHERE a.appointment_datetime BETWEEN $1 AND $2
    """
    params = [datetime.fromisoformat(start_date), datetime.fromisoformat(end_date)]
    
    if professional_id:
        query += f" AND a.professional_id = ${len(params) + 1}"
        params.append(professional_id)
        
    query += " ORDER BY a.appointment_datetime ASC"
    
    rows = await db.pool.fetch(query, *params)
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
        tenant_id = 1 # Por defecto v1.0
        await db.pool.execute("""
            INSERT INTO appointments (
                id, tenant_id, patient_id, professional_id, appointment_datetime, 
                duration_minutes, appointment_type, status, urgency_level, source, created_at
            ) VALUES ($1, $2, $3, $4, $5, 60, $6, 'confirmed', 'normal', 'manual', NOW())
        """, new_id, tenant_id, pid, apt.professional_id, apt.datetime, apt.type)
        
        # 5. Sincronizar con Google Calendar
        try:
            # Obtener google_calendar_id del profesional
            google_calendar_id = await db.pool.fetchval(
                "SELECT google_calendar_id FROM professionals WHERE id = $1", 
                apt.professional_id
            )
            
            if google_calendar_id:
                summary = f"Cita Dental: {appointment_data['first_name']} {appointment_data['last_name'] or ''} - {apt.type}"
                start_time = apt.datetime.isoformat()
                end_time = (apt.datetime + timedelta(minutes=60)).isoformat()
                
                gcal_event = gcal_service.create_event(
                    calendar_id=google_calendar_id,
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
                # Need to fetch professional's calendar ID
                google_calendar_id = await db.pool.fetchval(
                    "SELECT google_calendar_id FROM professionals WHERE id = $1", 
                    appointment_data['professional_id']
                )
                
                if google_calendar_id:
                    gcal_service.delete_event(calendar_id=google_calendar_id, event_id=appointment_data['google_calendar_event_id'])
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
        return []
    
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
@router.get("/calendar/blocks", dependencies=[Depends(verify_admin_token)])
async def get_calendar_blocks(start_date: str, end_date: str, professional_id: Optional[int] = None):
    """Obtener bloques de Google Calendar para el período con filtro por profesional."""
    try:
        query = """
            SELECT id, google_event_id, title, description,
                   start_datetime, end_datetime, all_day,
                   professional_id, sync_status
            FROM google_calendar_blocks
            WHERE start_datetime < $2 AND end_datetime > $1
        """
        params = [datetime.fromisoformat(start_date.replace('Z', '+00:00')), 
                  datetime.fromisoformat(end_date.replace('Z', '+00:00'))]
        
        if professional_id:
            query += " AND professional_id = $3"
            params.append(professional_id)
            
        query += " ORDER BY start_datetime ASC"
        
        rows = await db.pool.fetch(query, *params)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching calendar blocks: {e}")
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
@router.post("/calendar/sync", dependencies=[Depends(verify_admin_token)])
async def trigger_sync():
    """
    Sincronización REAL con Google Calendar para todos los profesionales activos.
    Trae eventos de GCal que NO son appointments y los guarda como bloqueos.
    """
    try:
        # 0. Obtener tenant_id
        tenant_id = await db.pool.fetchval("SELECT id FROM tenants LIMIT 1") or 1

        # 1. Obtener todos los profesionales con calendario configurado
        professionals = await db.pool.fetch("""
            SELECT id, first_name, google_calendar_id 
            FROM professionals 
            WHERE is_active = true AND google_calendar_id IS NOT NULL
        """)

        if not professionals:
            return {"status": "warning", "message": "No hay profesionales con calendario configurado."}

        # 2. Obtener IDs de eventos que son APPOINTMENTS para no duplicarlos como "bloqueo"
        appointment_google_ids = await db.pool.fetch("SELECT google_calendar_event_id FROM appointments WHERE google_calendar_event_id IS NOT NULL")
        apt_ids_set = {row['google_calendar_event_id'] for row in appointment_google_ids}

        total_created = 0
        total_updated = 0
        total_processed = 0
        
        # Sync from yesterday to ensure we catch today's earlier events
        time_min = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace('+00:00', 'Z')
        time_max = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace('+00:00', 'Z')

        for prof in professionals:
            prof_id = prof['id']
            cal_id = prof['google_calendar_id']
            
            logger.info(f"🔄 Syncing GCal for {prof['first_name']} (ID: {prof_id}) on {cal_id}")
            logger.info(f"   Time Range: {time_min} to {time_max}")
            
            events = gcal_service.list_events(calendar_id=cal_id, time_min=time_min, time_max=time_max)
            logger.info(f"   Found {len(events)} events in GCal.")
            total_processed += len(events)
            
            # Obtener IDs ya existentes para este profesional
            existing_blocks = await db.pool.fetch("SELECT google_event_id FROM google_calendar_blocks WHERE professional_id = $1", prof_id)
            existing_ids_set = {row['google_event_id'] for row in existing_blocks}

            for event in events:
                g_id = event['id']
                summary = event.get('summary', 'Sin Título')
                
                # Ignorar si es un turno ya registrado
                if g_id in apt_ids_set:
                    logger.info(f"   Skipping event {g_id} ({summary}) - Already linked to appointment")
                    continue
                    
                description = event.get('description', '')
                start = event['start'].get('dateTime') or event['start'].get('date')
                end = event['end'].get('dateTime') or event['end'].get('date')
                all_day = 'date' in event['start']
                
                # Parsing dates with safety
                try:
                    dt_start = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    dt_end = datetime.fromisoformat(end.replace('Z', '+00:00'))
                except Exception as de:
                    logger.warning(f"   Error parsing date {start}/{end} for event {g_id}: {de}")
                    continue

                if g_id in existing_ids_set:
                    await db.pool.execute("""
                        UPDATE google_calendar_blocks SET
                            title = $1, description = $2, start_datetime = $3, end_datetime = $4,
                            all_day = $5, updated_at = NOW()
                        WHERE google_event_id = $6 AND professional_id = $7
                    """, summary, description, dt_start, dt_end, all_day, g_id, prof_id)
                    total_updated += 1
                else:
                    await db.pool.execute("""
                        INSERT INTO google_calendar_blocks (
                            tenant_id, google_event_id, title, description,
                            start_datetime, end_datetime, all_day, professional_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """, tenant_id, g_id, summary, description, dt_start, dt_end, all_day, prof_id)
                    total_created += 1
        
        # Registrar sync global en log
        await db.pool.execute("""
            INSERT INTO calendar_sync_log (
                tenant_id, sync_type, direction, events_processed, 
                events_created, events_updated, completed_at
            ) VALUES ($1, 'manual', 'inbound', $2, $3, $4, NOW())
        """, tenant_id, total_processed, total_created, total_updated)
        
        return {
            "status": "success",
            "professionals_synced": len(professionals),
            "events_processed": total_processed,
            "created": total_created,
            "updated": total_updated,
            "message": f"Sincronización completada para {len(professionals)} profesionales."
        }
    except Exception as e:
        logger.error(f"Error en trigger_sync: {e}")
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


@router.get('/treatment-types')
async def list_treatment_types():
    "Retorna la lista de tipos de tratamientos disponibles."
    query = "SELECT code, name, description, category FROM treatment_types WHERE is_active = true ORDER BY name"
    rows = await db.pool.fetch(query)
    return [dict(row) for row in rows]

# ==================== ENDPOINTS ANALYTICS ====================

@router.get("/analytics/professionals/summary")
async def get_professionals_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_data = Depends(verify_admin_token)
):
    """
    Retorna métricas estratégicas de los profesionales para el dashboard del CEO.
    """
    try:
        # Default to current month if not specified
        if not start_date or not end_date:
            today = datetime.now()
            start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            # End of month roughly
            if today.month == 12:
                 end = today.replace(year=today.year+1, month=1, day=1) - timedelta(days=1)
            else:
                 end = today.replace(month=today.month+1, day=1) - timedelta(days=1)
        else:
            start = datetime.fromisoformat(start_date)
            end = datetime.fromisoformat(end_date)
            
        data = await analytics_service.get_professionals_summary(start, end)
        return data
        
    except Exception as e:
        logger.error(f"Error in analytics endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
