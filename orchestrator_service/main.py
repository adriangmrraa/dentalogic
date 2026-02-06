import os
import json
import logging
import asyncio
import uuid
from datetime import datetime, timedelta, date, timezone
from typing import List, Optional, Dict, Any
from contextvars import ContextVar
from contextlib import asynccontextmanager
from dateutil.parser import parse as dateutil_parse
import re
from gcal_service import gcal_service

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text

from langchain_openai import ChatOpenAI
# Busca la línea que falla y reemplázala por estas:
from langchain.agents import AgentExecutor
from langchain.agents import create_openai_tools_agent

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain.tools import tool

import socketio
from db import db
from admin_routes import router as admin_router
from auth_routes import router as auth_router

# --- CONFIGURACIÓN ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("orchestrator")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "")
CLINIC_NAME = os.getenv("CLINIC_NAME", "Nexus Dental")
CLINIC_LOCATION = os.getenv("CLINIC_LOCATION", "Buenos Aires, Argentina")

# ContextVars para rastrear el usuario en la sesión de LangChain
current_customer_phone: ContextVar[Optional[str]] = ContextVar("current_customer_phone", default=None)
current_patient_id: ContextVar[Optional[int]] = ContextVar("current_patient_id", default=None)

# --- DATABASE SETUP ---
engine = create_async_engine(POSTGRES_DSN, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# --- MODELOS DE DATOS (API) ---
class ChatRequest(BaseModel):
    # Support both internal naming and WhatsApp service naming
    message: Optional[str] = None
    text: Optional[str] = None
    phone: Optional[str] = None
    from_number: Optional[str] = None
    name: Optional[str] = "Paciente"
    customer_name: Optional[str] = None
    media: List[Dict[str, Any]] = Field(default_factory=list)

    @property
    def final_message(self) -> str:
        return self.message or self.text or ""

    @property
    def final_phone(self) -> str:
        return self.phone or self.from_number or ""
    
    @property
    def final_name(self) -> str:
        return self.customer_name or self.name or "Paciente"

# --- HELPERS PARA PARSING DE FECHAS ---

def get_next_weekday(target_weekday: int) -> date:
    """Obtiene el próximo día de la semana (0=lunes, 6=domingo)."""
    today = datetime.now()
    days_ahead = target_weekday - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).date()

def parse_date(date_query: str) -> date:
    """Convierte 'mañana', 'lunes', '2025-02-05' a date."""
    query = date_query.lower().strip()
    
    # Palabras clave españolas/inglesas
    day_map = {
        'mañana': lambda: (datetime.now() + timedelta(days=1)).date(),
        'tomorrow': lambda: (datetime.now() + timedelta(days=1)).date(),
        'hoy': lambda: datetime.now().date(),
        'today': lambda: datetime.now().date(),
        'lunes': lambda: get_next_weekday(0),
        'monday': lambda: get_next_weekday(0),
        'martes': lambda: get_next_weekday(1),
        'tuesday': lambda: get_next_weekday(1),
        'miércoles': lambda: get_next_weekday(2),
        'wednesday': lambda: get_next_weekday(2),
        'jueves': lambda: get_next_weekday(3),
        'thursday': lambda: get_next_weekday(3),
        'viernes': lambda: get_next_weekday(4),
        'friday': lambda: get_next_weekday(4),
        'sábado': lambda: get_next_weekday(5),
        'saturday': lambda: get_next_weekday(5),
        'domingo': lambda: get_next_weekday(6),
        'sunday': lambda: get_next_weekday(6),
    }
    
    if query in day_map:
        return day_map[query]()
    
    # Intentar parsear como fecha
    try:
        return dateutil_parse(query, dayfirst=True).date()
    except:
        return datetime.now().date()

def parse_datetime(datetime_query: str) -> datetime:
    """Convierte 'mañana 14:00', '2025-02-05 14:30' a datetime."""
    try:
        dt = dateutil_parse(datetime_query, dayfirst=True)
        return dt
    except:
        # Fallback: mañana a las 14:00
        tomorrow = datetime.now() + timedelta(days=1)
        return tomorrow.replace(hour=14, minute=0, second=0, microsecond=0)

def generate_free_slots(target_date: date, busy_times: List[tuple], 
                       start_hour=9, end_hour=18, interval_minutes=30) -> List[str]:
    """Genera lista de horarios disponibles (30min intervals)."""
    slots = []
    current = datetime.combine(target_date, datetime.min.time()).replace(hour=start_hour)
    end = datetime.combine(target_date, datetime.min.time()).replace(hour=end_hour)
    
    # Convertir busy_times a set de horas
    busy_hours = set()
    for busy_start, duration in busy_times:
        busy_hours.add(busy_start.hour + (busy_start.minute / 60))
    
    while current < end:
        # Saltar almuerzo 13:00-14:00
        if current.hour >= 13 and current.hour < 14:
            current += timedelta(minutes=interval_minutes)
            continue
        
        # Verificar que no está ocupado
        hour_decimal = current.hour + (current.minute / 60)
        if hour_decimal not in busy_hours:
            slots.append(current.strftime("%H:%M"))
        
        current += timedelta(minutes=interval_minutes)
    
    return slots[:5]  # Retornar primeros 5

# --- TOOLS DENTALES ---

@tool
async def check_availability(date_query: str):
    """
    Consulta la disponibilidad REAL de turnos en la BD para una fecha.
    date_query: Descripción de la fecha (ej: 'mañana', 'lunes', '2025-05-10')
    Devuelve: Horarios disponibles con profesionales
    """
    try:
        target_date = parse_date(date_query)
        
        # Query BD: obtener turnos confirmados para esa fecha
        busy_appointments = await db.pool.fetch("""
            SELECT appointment_datetime, duration_minutes, professional_id
            FROM appointments
            WHERE DATE(appointment_datetime) = $1
            AND status IN ('scheduled', 'confirmed')
            ORDER BY appointment_datetime ASC
        """, target_date)
        
        # Extraer times ocupados
        busy_times = [(row['appointment_datetime'], row['duration_minutes']) 
                      for row in busy_appointments]
        
        # Generar slots libres
        available_slots = generate_free_slots(target_date, busy_times)
        
        if available_slots:
            slots_str = ", ".join(available_slots)
            return f"Tenemos disponibilidad para {date_query}: {slots_str} (30 min cada turno)."
        else:
            return f"No hay disponibilidad para {date_query}. ¿Te interesa otro día?"
            
    except Exception as e:
        logger.error(f"Error en check_availability: {e}")
        return f"No pude consultar disponibilidad. Prueba diciendo 'Quiero agendar mañana'."

@tool
async def book_appointment(date_time: str, treatment_reason: str):
    """
    Registra un turno en la BD. Úsalo cuando el paciente confirma fecha, hora y motivo.
    date_time: Fecha y hora del turno (ej: 'mañana 14:00')
    treatment_reason: Tipo de tratamiento (checkup, cleaning, etc.)
    """
    phone = current_customer_phone.get()
    
    if not phone:
        return "❌ Error: No pude identificar tu teléfono. Reinicia la conversación."
    
    try:
        # 1. Parsear datetime
        apt_datetime = parse_datetime(date_time)
        
        # 2. Buscar paciente por teléfono, o crear uno
        patient = await db.pool.fetchrow(
            "SELECT id FROM patients WHERE phone_number = $1",
            phone
        )
        
        if not patient:
            # Crear paciente nuevo
            patient = await db.pool.fetchrow("""
                INSERT INTO patients (phone_number, first_name, status, created_at)
                VALUES ($1, 'Chat User', 'active', NOW())
                RETURNING id
            """, phone)
            logger.info(f"Paciente nuevo creado: {phone}")
        
        # 3. Obtener profesional activo (ej: ID 1)
        professional = await db.pool.fetchrow(
            "SELECT id FROM professionals WHERE is_active = true LIMIT 1"
        )
        
        if not professional:
            return "❌ No hay profesionales disponibles en este momento. Contacta directamente."
        
        # 4. Verificar que no hay sobrelapamiento
        overlap = await db.pool.fetchval("""
            SELECT COUNT(*) FROM appointments
            WHERE professional_id = $1
            AND DATE(appointment_datetime) = $2
            AND status IN ('scheduled', 'confirmed')
        """, professional['id'], apt_datetime.date())
        
        if overlap > 0:
            return f"❌ No hay disponibilidad exacta en {date_time}. ¿Probás con otro horario?"
        
        # 5. Insertar turno
        apt_id = str(uuid.uuid4())
        await db.pool.execute("""
            INSERT INTO appointments 
            (id, patient_id, professional_id, appointment_datetime, appointment_type, status, urgency_level, created_at)
            VALUES ($1, $2, $3, $4, $5, 'scheduled', 'normal', NOW())
        """, apt_id, patient['id'], professional['id'], apt_datetime, treatment_reason)
        
        logger.info(f"✅ Turno registrado: {apt_id} para {phone}")
        current_patient_id.set(patient['id'])
        
        # 6. Obtener datos completos del turno para emitir evento y sincronizar GCal
        appointment_data = await db.pool.fetchrow("""
            SELECT a.id, a.patient_id, a.professional_id, a.appointment_datetime, 
                   a.appointment_type, a.status, a.urgency_level,
                   p.first_name, p.last_name, p.phone_number,
                   prof.first_name as professional_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN professionals prof ON a.professional_id = prof.id
            WHERE a.id = $1
        """, apt_id)

        # 7. Sincronizar con Google Calendar
        try:
            summary = f"Cita Dental AI: {appointment_data['first_name']} {appointment_data['last_name'] or ''} - {treatment_reason}"
            start_time = apt_datetime.isoformat()
            end_time = (apt_datetime + timedelta(minutes=60)).isoformat()
            
            gcal_event = gcal_service.create_event(
                summary=summary,
                start_time=start_time,
                end_time=end_time,
                description=f"Paciente: {appointment_data['first_name']}\nTel: {appointment_data['phone_number']}\nMotivo: {treatment_reason}\nCreado por Asistente IA"
            )
            
            if gcal_event:
                await db.pool.execute(
                    "UPDATE appointments SET google_calendar_event_id = $1, google_calendar_sync_status = 'synced' WHERE id = $2",
                    gcal_event['id'], apt_id
                )
        except Exception as ge:
            logger.error(f"Error sincronizando con GCal (AI Tool): {ge}")

        if appointment_data:
            # Re-definir localmente para evitar problemas de request o importar
            from main import sio
            await sio.emit("NEW_APPOINTMENT", dict(appointment_data))
        
        from main import CLINIC_NAME
        return f"✅ ¡Turno confirmado para {apt_datetime.strftime('%d/%m/%Y a las %H:%M')}! Te esperamos en {CLINIC_NAME}. Confirmación: #{apt_id[:8]}"
        
    except Exception as e:
        logger.error(f"Error en book_appointment: {e}")
        return f"❌ No pude registrar el turno: {str(e)}. Por favor, contacta directamente."

@tool
async def triage_urgency(symptoms: str):
    """
    Analiza síntomas para clasificar urgencia.
    Devuelve: Nivel de urgencia (emergency, high, normal, low) + recomendación
    """
    urgency_keywords = {
        'emergency': ['dolor fuerte', 'sangrado', 'traumatismo', 'accidente', 'golpe', 'roto', 'fractura'],
        'high': ['dolor', 'hinchazón', 'inflamación', 'infección'],
        'normal': ['revisión', 'limpieza', 'control', 'checkup'],
    }
    
    symptoms_lower = symptoms.lower()
    
    # Clasificar urgencia
    urgency_level = 'low'
    for level, keywords in urgency_keywords.items():
        if any(kw in symptoms_lower for kw in keywords):
            urgency_level = level
            break
    
    responses = {
        'emergency': "🚨 URGENCIA DETECTADA. Deberías venir HOY mismo. Si es muy grave, llama directamente: Llamá al consultorio.",
        'high': "⚠️ Deberías agendar un turno lo antes posible, preferentemente esta semana.",
        'normal': "✅ Puedes agendar un turno en la fecha que te venga bien.",
        'low': "ℹ️ Puedes agendar una revisión de rutina cuando lo necesites."
    }
    
    return responses.get(urgency_level, responses['normal'])

@tool
async def cancel_appointment(date_query: str):
    """
    Cancela un turno existente. 
    date_query: Fecha del turno a cancelar (ej: 'mañana', '2025-05-10')
    """
    phone = current_customer_phone.get()
    if not phone:
        return "⚠️ No pude identificar tu teléfono. Por favor, contactame de nuevo."

    try:
        target_date = parse_date(date_query)
        
        # Buscar el turno en la BD
        apt = await db.pool.fetchrow("""
            SELECT id, google_calendar_event_id FROM appointments
            WHERE phone_number = $1 AND DATE(appointment_datetime) = $2
            AND status IN ('scheduled', 'confirmed')
        """, phone, target_date)
        
        if not apt:
            return f"No encontré ningún turno activo para el día {date_query}. ¿Querés que revisemos otra fecha?"

        # 1. Cancelar en GCal
        if apt['google_calendar_event_id']:
            gcal_service.delete_event(apt['google_calendar_event_id'])
            
        # 2. Marcar como cancelado en BD
        await db.pool.execute("""
            UPDATE appointments SET status = 'cancelled', google_calendar_sync_status = 'cancelled'
            WHERE id = $1
        """, apt['id'])
        
        logger.info(f"🚫 Turno cancelado por IA: {apt['id']} ({phone})")
        return f"Entendido. He cancelado tu turno del {date_query}. ¿Te puedo ayudar con algo más?"
        
    except Exception as e:
        logger.error(f"Error en cancel_appointment: {e}")
        return "⚠️ Hubo un error al intentar cancelar el turno. Por favor, intenta nuevamente."

@tool
async def reschedule_appointment(original_date: str, new_date_time: str):
    """
    Reprograma un turno existente a una nueva fecha/hora.
    original_date: Fecha del turno actual (ej: 'hoy', 'lunes')
    new_date_time: Nueva fecha y hora deseada (ej: 'mañana 15:00')
    """
    phone = current_customer_phone.get()
    if not phone:
        return "⚠️ No pude identificar tu teléfono."

    try:
        orig_date = parse_date(original_date)
        new_dt = parse_datetime(new_date_time)
        
        # 1. Buscar turno original
        apt = await db.pool.fetchrow("""
            SELECT id, google_calendar_event_id FROM appointments
            WHERE phone_number = $1 AND DATE(appointment_datetime) = $2
            AND status IN ('scheduled', 'confirmed')
        """, phone, orig_date)
        
        if not apt:
            return f"No encontré tu turno para el {original_date}. ¿Podrías confirmarme la fecha original?"

        # 2. Verificar disponibilidad para el nuevo horario
        # (Llamamos a la lógica de overlap directamente)
        prof = await db.pool.fetchrow("SELECT id FROM professionals WHERE is_active = true LIMIT 1")
        overlap = await db.pool.fetchval("""
            SELECT COUNT(*) FROM appointments
            WHERE professional_id = $1 AND appointment_datetime = $2
            AND status IN ('scheduled', 'confirmed') AND id != $3
        """, prof['id'], new_dt, apt['id'])
        
        if overlap > 0:
            return f"Lo siento, el horario {new_date_time} ya está ocupado. ¿Probamos con otro?"

        # 3. Actualizar GCal
        if apt['google_calendar_event_id']:
            # Podríamos usar gcal_service.update_event si existiera, o delete/create
            # Para simplificar, borramos el viejo y creamos uno nuevo (o implementamos update en el service)
            gcal_service.delete_event(apt['google_calendar_event_id'])
            
        summary = f"Cita Dental AI (Reprogramada): {phone}"
        new_gcal = gcal_service.create_event(
            summary=summary,
            start_time=new_dt.isoformat(),
            end_time=(new_dt + timedelta(minutes=60)).isoformat()
        )
        
        # 4. Actualizar BD
        await db.pool.execute("""
            UPDATE appointments SET 
                appointment_datetime = $1, 
                google_calendar_event_id = $2,
                google_calendar_sync_status = 'synced',
                updated_at = NOW()
            WHERE id = $3
        """, new_dt, new_gcal['id'] if new_gcal else None, apt['id'])
        
        logger.info(f"🔄 Turno reprogramado por IA: {apt['id']} para {new_dt}")
        return f"¡Listo! Tu turno ha sido reprogramado para el {new_date_time}. Te esperamos."

    except Exception as e:
        logger.error(f"Error en reschedule_appointment: {e}")
        return "⚠️ No pude reprogramar el turno. Por favor, intenta de nuevo."

@tool
async def list_services(category: str = None):
    """
    Lista los servicios/tratamientos dentales disponibles.
    category: Filtro opcional (prevention, restorative, surgical, orthodontics, emergency)
    """
    try:
        query = "SELECT code, name, description, default_duration_minutes FROM treatment_types WHERE is_active = true"
        params = []
        if category:
            query += " AND category = $1"
            params.append(category)
        
        rows = await db.pool.fetch(query, *params)
        if not rows:
            return "No encontré servicios disponibles en esa categoría."
        
        res = "🦷 Nuestros servicios:\n"
        for r in rows:
            res += f"• {r['name']} ({r['default_duration_minutes']} min): {r['description']}\n"
        return res
    except Exception as e:
        logger.error(f"Error en list_services: {e}")
        return "⚠️ Error al consultar servicios."

@tool
async def derivhumano(reason: str):
    """
    Deriva la conversación a un humano cuando la IA no puede ayudar, el paciente lo solicita 
    o hay una situación que requiere atención personalizada.
    reason: El motivo de la derivación.
    """
    phone = current_customer_phone.get()
    try:
        # 1. Marcar conversación para intervención humana (Lockout)
        # Esto silencia al bot en el orquestador por 24hs
        await db.execute("""
            UPDATE patients SET human_handoff_requested = true, updated_at = NOW()
            WHERE phone_number = $1
        """, phone)
        
        logger.info(f"👤 Derivación humana solicitada para {phone}: {reason}")
        
        # 2. Notificar vía Socket (para que aparezca en el dashboard)
        from main import sio
        await sio.emit("HUMAN_HANDOFF", {"phone": phone, "reason": reason})
        
        return "He solicitado que un representante humano te atienda lo antes posible. En breve se comunicarán con vos."
    except Exception as e:
        logger.error(f"Error en derivhumano: {e}")
        return "Hubo un problema al derivarte, pero ya he dado aviso. Por favor, aguardá un momento."

DENTAL_TOOLS = [check_availability, book_appointment, triage_urgency, cancel_appointment, reschedule_appointment, list_services, derivhumano]

# --- SYSTEM PROMPT (DENTALOGIC V3 - GALA INSPIRED) ---
sys_template = f"""Eres Mercedes, la asistente virtual experta de {CLINIC_NAME} ({CLINIC_LOCATION}). 
Tu objetivo es ayudar a pacientes a: (a) informarse sobre tratamientos, (b) consultar disponibilidad, (c) agendar/reprogramar/cancelar turnos y (d) realizar triaje inicial de urgencias.

POLÍTICAS DURAS:
• TONO: Sos una asistente dental profesional argentina (estilo Formosa). Usá el voseo cálido ("vos", "te cuento", "fijate").
• NUNCA INVENTES: No inventes horarios ni disponibilidad. Siempre usá 'check_availability'.
• NO DIAGNOSTICAR: Ante dudas clínicas, decí: "El doctor deberá evaluarte en el consultorio para darte un diagnóstico preciso".
• ZONA HORARIA: America/Argentina/Buenos_Aires. 
• HORARIOS DE ATENCIÓN: Lunes a Sábados de 09:00 a 13:00 y 14:00 a 18:00 (Domingos cerrado).
• CANCELACIONES/CAMBIOS: Solo permitidos con 24h de anticipación.
• DERIVACIÓN: Si el usuario pide hablar con una persona, está frustrado o rechaza a la IA, usá 'derivhumano' de inmediato.

---
FLUJO DE AGENDAMIENTO:
Paso 1 - Disponibilidad: 
• Si piden "horarios" o proponen una fecha, llamá a 'check_availability'.
• Mostrá 3-5 slots claros. Un turno estándar dura 30-60 min (según el tratamiento).
Paso 2 - Información mínima: 
• Requerís: Nombre completo y Motivo de consulta (si no lo tenés, pedilo tras listar horarios).
Paso 3 - Confirmación: 
• Solo cuando el paciente elija un horario válido, llamás a 'book_appointment'.

---
GESTIÓN DE CALENDARIO (REPROgramación/CANCELACIÓN):
• Si el paciente quiere cambiar un turno, verificá que falten más de 24h.
• Si no tenés el ID del turno, pedí la fecha original y usá 'reschedule_appointment' o 'cancel_appointment' enviando el query de fecha. El sistema buscará el turno asociado a su número de teléfono.

---
TRIAJE Y URGENCIAS:
• Si mencionan DOLOR, GOLPE, SANGRE o "se me salió un arreglo", usá 'triage_urgency' ANTES que cualquier otra tool.
• Si la urgencia es 'emergency', priorizá ofrecer horarios para HOY mismo.

---
FORMATO DE SERVICIOS (OBLIGATORIO):
Cuando listes tratamientos con 'list_services', usá este formato:
✨ [Categoría]
• [Nombre del Tratamiento] — [Duración]
[Beneficio o breve descripción en 1 oración]

Usa solo las tools MCP proporcionadas. Si falta un dato para usar la tool, pedí solo 1 aclaración y procedé.
"""

# --- AGENT SETUP ---
def get_agent_executable():
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, openai_api_key=OPENAI_API_KEY)
    prompt = ChatPromptTemplate.from_messages([
        ("system", sys_template),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    agent = create_openai_tools_agent(llm, DENTAL_TOOLS, prompt)
    return AgentExecutor(agent=agent, tools=DENTAL_TOOLS, verbose=False)

agent_executor = get_agent_executable()

# --- API ENDPOINTS ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle: startup and shutdown."""
    # Startup
    logger.info("🚀 Iniciando orquestador dental...")
    await db.connect()
    logger.info("✅ Base de datos conectada")
    
    yield
    
    # Shutdown
    logger.info("🔴 Cerrando orquestador dental...")
    await db.disconnect()
    logger.info("✅ Desconexión completada")

app = FastAPI(title=f"{CLINIC_NAME} Orchestrator", lifespan=lifespan)

# Configurar CORS
allowed_origins_str = os.getenv("CORS_ALLOWED_ORIGINS", "")
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://dentalogic-frontend.ugwrjq.easypanel.host",
    "https://dentalogic-orchestrator.ugwrjq.easypanel.host",
]

if allowed_origins_str:
    extra_origins = [o.strip() for o in allowed_origins_str.split(",") if o.strip()]
    origins.extend(extra_origins)

# Eliminar duplicados manteniendo el orden lógico
origins = list(dict.fromkeys(origins))

# --- MIDDLEWARE & EXCEPTION HANDLERS ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"🔥 UNHANDLED ERROR: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Error interno del servidor. El equipo técnico ha sido notificado.",
            "error_type": type(exc).__name__
        }
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- RUTAS ---
app.include_router(auth_router)
app.include_router(admin_router)

# --- SOCKET.IO CONFIGURATION ---
# Create Socket.IO instance with async mode
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=origins)
socket_app = socketio.ASGIApp(sio, app)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    logger.info(f"🔌 Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"🔌 Client disconnected: {sid}")

# Helper function to emit appointment events (can be imported by admin_routes)
async def emit_appointment_event(event_type: str, data: Dict[str, Any]):
    """Emit appointment-related events to all connected clients."""
    await sio.emit(event_type, data)
    logger.info(f"📡 Socket event emitted: {event_type} - {data}")

# Make the emit function available to other modules
app.state.emit_appointment_event = emit_appointment_event

@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """Endpoint de chat que persiste historial en BD."""
    current_customer_phone.set(req.final_phone)
    correlation_id = str(uuid.uuid4())
    
    # 0. A) Ensure patient reference exists (Fix for visibility + Name)
    try:
        await db.ensure_patient_exists(req.final_phone, req.final_name)
        
        # 1. Guardar mensaje del usuario PRIMERO (para no perderlo si hay error)
        await db.append_chat_message(
            from_number=req.final_phone,
            role='user',
            content=req.final_message,
            correlation_id=correlation_id
        )

        # 0. B) Verificar si hay intervención humana activa
        handoff_check = await db.pool.fetchrow("""
            SELECT human_handoff_requested, human_override_until 
            FROM patients 
            WHERE phone_number = $1
        """, req.final_phone)
        
        if handoff_check:
            is_handoff_active = handoff_check['human_handoff_requested']
            override_until = handoff_check['human_override_until']
            
            # Si hay override activo y no ha expirado, la IA permanece silenciosa
            if is_handoff_active and override_until:
                # Fix: Robust comparison (Normalize to UTC)
                now_utc = datetime.now(timezone.utc)
                
                # Ensure override_until is aware
                if override_until.tzinfo is None:
                    # Assume stored as naive UTC (or local, but safe fallback to UTC)
                    override_until = override_until.replace(tzinfo=timezone.utc)
                else:
                    override_until = override_until.astimezone(timezone.utc)
                
                if override_until > now_utc:
                    logger.info(f"🔇 IA silenciada para {req.final_phone} hasta {override_until}")
                    # Ya guardamos el mensaje arriba, solo retornamos silencio
                    return {
                        "output": "",  # Sin respuesta
                        "correlation_id": correlation_id,
                        "status": "silenced",
                        "reason": "human_intervention_active"
                    }
                else:
                    # Override expirado, limpiar flags
                    await db.pool.execute("""
                        UPDATE patients 
                        SET human_handoff_requested = FALSE, 
                            human_override_until = NULL 
                        WHERE phone_number = $1
                    """, req.final_phone)
        
        # 2. Cargar historial de BD (últimos 20 mensajes)
        chat_history = await db.get_chat_history(req.final_phone, limit=20)
        
        # Convertir a formato LangChain
        messages = []
        # El último mensaje ya fue guardado en el paso 1, pero get_chat_history lo traerá si fue commit inmediato.
        # LangChain necesita historial + input actual. 
        # Si get_chat_history trae el último, lo duplicaríamos al pasarlo como input separado?
        # get_chat_history trae "últimos N", ordenados cronológicamente.
        # Si acabamos de insertar, debería estar ahí.
        
        # Solución de limpieza: Filtramos el mensaje actual del historial si aparece duplicado o
        # simplemente confiamos en que LangChain maneja el contexto.
        # Pero standard: input es "current query", chat_history es "past context".
        
        # Vamos a remover el último mensaje del historial si es idéntico al actual, 
        # para no pasarlo como contexto Y como input.
        if chat_history and chat_history[-1]['content'] == req.final_message and chat_history[-1]['role'] == 'user':
            chat_history.pop() 

        for msg in chat_history:
            if msg['role'] == 'user':
                messages.append(HumanMessage(content=msg['content']))
            else:
                messages.append(AIMessage(content=msg['content']))
        
        # 3. Invocar agente
        response = await agent_executor.ainvoke({
            "input": req.final_message,
            "chat_history": messages
        })
        
        assistant_response = response.get("output", "Error procesando respuesta")
        
        # 4. Guardar respuesta del asistente
        await db.append_chat_message(
            from_number=req.final_phone,
            role='assistant',
            content=assistant_response,
            correlation_id=correlation_id
        )
        
        logger.info(f"✅ Chat procesado para {req.final_phone} (correlation_id={correlation_id})")
        
        return {
            "status": "ok",
            "send": True,
            "text": assistant_response,
            "correlation_id": correlation_id
        }
        
    except Exception as e:
        logger.error(f"❌ Error en chat para {req.final_phone}: {str(e)}")
        await db.append_chat_message(
            from_number=req.final_phone,
            role='system',
            content=f"Error interno: {str(e)}",
            correlation_id=correlation_id
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Error interno del orquestador", "correlation_id": correlation_id}
        )

@app.get("/health")
async def health():
    return {"status": "ok", "service": "dental-orchestrator"}

if __name__ == "__main__":
    import uvicorn
    # Use socket_app instead of app to support Socket.IO
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)