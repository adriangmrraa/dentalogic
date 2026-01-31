import os
import json
import logging
import asyncio
import uuid
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict, Any
from contextvars import ContextVar
from contextlib import asynccontextmanager
from dateutil.parser import parse as dateutil_parse
import re

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import create_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import text

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain.tools import tool

import socketio
from db import db
from admin_routes import router as admin_router

# --- CONFIGURACIÓN ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
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
    message: str
    phone: str
    name: Optional[str] = "Paciente"

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
        
        # 6. Emitir evento de Socket.IO para actualización en tiempo real
        # Obtener datos completos del turno para emitir
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
        
        if appointment_data:
            await emit_appointment_event("NEW_APPOINTMENT", dict(appointment_data))
        
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
async def derivhumano(reason: str = "Consulta general"):
    """
    Deriva a humano: silencia el bot y conecta con la secretaria.
    Bloquea el bot por 24h (human_override_until).
    """
    phone = current_customer_phone.get()
    
    if not phone:
        return "⚠️ No pude procesar tu solicitud. Intenta nuevamente."
    
    try:
        # Actualizar conversación para bloquear bot
        await db.pool.execute("""
            UPDATE chat_conversations
            SET status = 'human_handling',
                human_override_until = NOW() + INTERVAL '24 hours'
            WHERE phone_number = $1
        """, phone)
        
        logger.info(f"🤝 Derivación a humano: {phone} ({reason})")
        return "👋 Se ha solicitado la intervención de nuestra secretaria. En breve te contactaremos por WhatsApp. ¡Gracias!"
        
    except Exception as e:
        logger.error(f"Error en derivhumano: {e}")
        return "⚠️ Error al procesar la derivación. Intenta nuevamente."

DENTAL_TOOLS = [check_availability, book_appointment, triage_urgency, derivhumano]

# --- SYSTEM PROMPT ---
sys_template = f"""Eres el Asistente Virtual de {CLINIC_NAME}, ubicada en {CLINIC_LOCATION}.
Tu objetivo es ayudar a los pacientes a agendar turnos, resolver dudas sobre tratamientos y realizar un triaje inicial.

REGLAS DE ORO:
1. TONO: Sos una asistente dental profesional argentina. Usá el voseo ("vos", "te cuento", "fijate", "mirá") de forma cálida y educada.
2. AGENDAMIENTO: Antes de confirmar un turno, siempre consultá disponibilidad con la herramienta 'check_availability'.
3. TRIAJE: Si el paciente menciona DOLOR, MOLESTIA o un accidente, usá 'triage_urgency' inmediatamente.
4. NO DIAGNOSTICAR: Nunca digas qué tiene el paciente ni recetes medicación. Limitáte a decir "el doctor deberá evaluarte en el consultorio".
5. BREVEDAD: Respuestas cortas y al grano. Usá emojis de forma moderada (🦷, ✨).

Si el paciente se pone agresivo o pide hablar con una persona, usá 'derivhumano'.
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

# Include admin routes
app.include_router(admin_router)

# --- SOCKET.IO CONFIGURATION ---
# Create Socket.IO instance with async mode
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
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
    current_customer_phone.set(req.phone)
    correlation_id = str(uuid.uuid4())
    
    try:
        # 1. Cargar historial de BD (últimos 20 mensajes)
        chat_history = await db.get_chat_history(req.phone, limit=20)
        
        # Convertir a formato LangChain
        messages = []
        for msg in chat_history:
            if msg['role'] == 'user':
                messages.append(HumanMessage(content=msg['content']))
            else:
                messages.append(AIMessage(content=msg['content']))
        
        # 2. Guardar mensaje del usuario
        await db.append_chat_message(
            from_number=req.phone,
            role='user',
            content=req.message,
            correlation_id=correlation_id
        )
        
        # 3. Invocar agente
        response = await agent_executor.ainvoke({
            "input": req.message,
            "chat_history": messages
        })
        
        assistant_response = response.get("output", "Error procesando respuesta")
        
        # 4. Guardar respuesta del asistente
        await db.append_chat_message(
            from_number=req.phone,
            role='assistant',
            content=assistant_response,
            correlation_id=correlation_id
        )
        
        logger.info(f"✅ Chat procesado para {req.phone} (correlation_id={correlation_id})")
        
        return {
            "output": assistant_response,
            "correlation_id": correlation_id,
            "status": "ok"
        }
        
    except Exception as e:
        logger.error(f"❌ Error en chat para {req.phone}: {str(e)}")
        await db.append_chat_message(
            from_number=req.phone,
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