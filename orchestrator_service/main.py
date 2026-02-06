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
from email_service import email_service

# --- CONFIGURACIÓN ---
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("orchestrator")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "")
CLINIC_NAME = os.getenv("CLINIC_NAME", "Consultorio Dental")
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
async def check_availability(date_query: str, professional_name: Optional[str] = None):
    """
    Consulta la disponibilidad REAL de turnos en la BD para una fecha.
    date_query: Descripción de la fecha (ej: 'mañana', 'lunes', '2025-05-10')
    professional_name: (Opcional) Nombre del profesional específico.
    Devuelve: Horarios disponibles
    """
    try:
        # 0. Obtener profesionales activos
        query = "SELECT id, first_name, google_calendar_id FROM professionals WHERE is_active = true"
        params = []
        if professional_name:
            query += " AND (first_name ILIKE $1 OR last_name ILIKE $1)"
            params.append(f"%{professional_name}%")
        
        active_professionals = await db.pool.fetch(query, *params)
        
        if not active_professionals:
            if professional_name:
                return f"❌ No encontré al profesional '{professional_name}' o no está activo en este momento."
            return "❌ Actualmente no hay profesionales registrados o activos en la clínica para realizar reservas."

        target_date = parse_date(date_query)
        
        # Query BD: obtener turnos confirmados para esa fecha para los profesionales seleccionados
        prof_ids = [p['id'] for p in active_professionals]
        busy_appointments = await db.pool.fetch("""
            SELECT appointment_datetime as start, duration_minutes, professional_id
            FROM appointments
            WHERE DATE(appointment_datetime) = $1
            AND professional_id = ANY($2)
            AND status IN ('scheduled', 'confirmed')
            ORDER BY appointment_datetime ASC
        """, target_date, prof_ids)
        
        # Query BD: obtener bloques de GCalendar para los profesionales seleccionados
        gcal_blocks = await db.pool.fetch("""
            SELECT start_datetime as start, end_datetime as end, professional_id
            FROM google_calendar_blocks
            WHERE DATE(start_datetime) = $1
            AND professional_id = ANY($2)
            ORDER BY start_datetime ASC
        """, target_date, prof_ids)

        # Extraer times ocupados (normalizando duraciones)
        busy_times = []
        for row in busy_appointments:
            busy_times.append((row['start'], row['duration_minutes']))
        
        for row in gcal_blocks:
            # Calcular duración en minutos para bloques
            duration = int((row['end'] - row['start']).total_seconds() / 60)
            busy_times.append((row['start'], duration))

        # Re-ordenar por inicio
        busy_times.sort(key=lambda x: x[0])
        
        # Generar slots libres
        available_slots = generate_free_slots(target_date, busy_times)
        
        if available_slots:
            slots_str = ", ".join(available_slots)
            resp = f"Tenemos disponibilidad para {date_query}"
            if professional_name:
                resp += f" con el/la Dr/a. {active_professionals[0]['first_name']}"
            resp += f": {slots_str} (30 min cada turno)."
            return resp
        else:
            return f"No hay disponibilidad para {date_query}. ¿Te interesa otro día?"
            
    except Exception as e:
        logger.error(f"Error en check_availability: {e}")
        return f"No pude consultar disponibilidad. Prueba diciendo 'Quiero agendar mañana'."

@tool
async def book_appointment(date_time: str, treatment_reason: str, 
                         first_name: Optional[str] = None, last_name: Optional[str] = None, 
                         dni: Optional[str] = None, insurance_provider: Optional[str] = None):
    """
    Registra un turno en la BD. 
    Para pacientes NUEVOS (status='guest'), OBLIGATORIAMENTE debes proveer first_name, last_name, dni e insurance_provider.
    Si faltan esos datos en un usuario nuevo, el turno será rechazado.
    
    date_time: Fecha y hora (ej: 'mañana 14:00')
    treatment_reason: Motivo (checkup, cleaning, etc.)
    first_name: Nombre del paciente (Obligatorio si es nuevo)
    last_name: Apellido del paciente (Obligatorio si es nuevo)
    dni: Documento de identidad (Obligatorio si es nuevo)
    insurance_provider: Obra social o 'PARTICULAR' (Obligatorio si es nuevo)
    """
    phone = current_customer_phone.get()
    
    if not phone:
        return "❌ Error: No pude identificar tu teléfono. Reinicia la conversación."
    
    try:
        # 1. Parsear datetime
        apt_datetime = parse_datetime(date_time)
        
        # 2. Verificar estado del paciente
        # Primero buscamos si existe
        existing_patient = await db.pool.fetchrow("SELECT id, status, first_name, last_name FROM patients WHERE phone_number = $1", phone)
        
        if existing_patient:
            if existing_patient['status'] == 'guest':
                # ES UN LEAD -> REQUIERE VALIDACIÓN ESTRICTA
                missing_fields = []
                if not first_name: missing_fields.append("Nombre")
                if not last_name: missing_fields.append("Apellido")
                if not dni: missing_fields.append("DNI")
                if not insurance_provider: missing_fields.append("Obra Social")
                
                if missing_fields:
                    return f"❌ Faltan datos para confirmar la reserva. Por favor pedile al paciente: {', '.join(missing_fields)}."
                
                # Actualizar a ACTIVE con los datos reales
                await db.pool.execute("""
                    UPDATE patients 
                    SET first_name = $1, last_name = $2, dni = $3, insurance_provider = $4, status = 'active', updated_at = NOW()
                    WHERE id = $5
                """, first_name, last_name, dni, insurance_provider, existing_patient['id'])
                
                patient_id = existing_patient['id']
                logger.info(f"✅ Lead {phone} convertido a PACIENTE (ID: {patient_id}) durante reserva.")
                
            else:
                # YA ES PACIENTE ACTIVO -> Usar ID existente
                patient_id = existing_patient['id']
        else:
            # Caso raro: No existe ni como lead (debería existir al entrar el chat).
            # Lo creamos como ACTIVE directamente si tenemos los datos, o rechazamos.
            if not (first_name and last_name and dni and insurance_provider):
                 return "❌ No tengo tus datos registrados. Necesito Nombre, Apellido, DNI y Obra Social para agendar."
            
            row = await db.pool.fetchrow("""
                INSERT INTO patients (tenant_id, phone_number, first_name, last_name, dni, insurance_provider, status, created_at)
                VALUES (1, $1, $2, $3, $4, $5, 'active', NOW())
                RETURNING id
            """, phone, first_name, last_name, dni, insurance_provider)
            patient_id = row['id']

        
        # 3. Obtener profesional activo (priorizando el que el usuario pida o el primero libre)
        # Por ahora tomamos el primero activo. 
        # En el futuro, el agente podría pasar un professional_id si el flujo lo permite.
        professional = await db.pool.fetchrow(
            "SELECT id, google_calendar_id FROM professionals WHERE is_active = true LIMIT 1"
        )
        
        if not professional:
            return "❌ No es posible agendar el turno porque no hay profesionales registrados o activos en el sistema en este momento. Por favor, contacta directamente a la clínica por otros medios."
        
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
        tenant_id = 1 # Por defecto en v1.0
        await db.pool.execute("""
            INSERT INTO appointments 
            (id, tenant_id, patient_id, professional_id, appointment_datetime, appointment_type, status, urgency_level, source, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', 'normal', 'ai', NOW())
        """, apt_id, tenant_id, patient_id, professional['id'], apt_datetime, treatment_reason)
        
        logger.info(f"✅ Turno registrado: {apt_id} para {phone}")
        current_patient_id.set(patient_id)
        
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
                description=f"Paciente: {appointment_data['first_name']}\nTel: {appointment_data['phone_number']}\nMotivo: {treatment_reason}\nCreado por Asistente IA",
                calendar_id=professional['google_calendar_id']
            )
            
            if gcal_event:
                await db.pool.execute(
                    "UPDATE appointments SET google_calendar_event_id = $1, google_calendar_sync_status = 'synced' WHERE id = $2",
                    gcal_event['id'], apt_id
                )
        except Exception as ge:
            logger.error(f"Error sincronizando con GCal (AI Tool): {ge}")

        if appointment_data:
            await sio.emit("NEW_APPOINTMENT", dict(appointment_data))
        
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
    phone = current_customer_phone.get()
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
    
    # Persistir urgencia en el paciente si lo identificamos
    if phone:
        try:
            patient_row = await db.ensure_patient_exists(phone)
            await db.pool.execute("""
                UPDATE patients 
                SET urgency_level = $1, urgency_reason = $2, updated_at = NOW()
                WHERE id = $3
            """, urgency_level, symptoms, patient_row['id'])
            
            # Notificar al dashboard el cambio de prioridad
            await sio.emit("PATIENT_UPDATED", {
                "phone_number": phone,
                "urgency_level": urgency_level,
                "urgency_reason": symptoms
            })
        except Exception as e:
            logger.error(f"Error persisting triage: {e}")

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
        # 1. Definir bloqueo de 24hs
        override_until = datetime.now(timezone.utc) + timedelta(hours=24)
        
        # 2. Marcar conversación para intervención humana (Lockout)
        # Seteamos last_derivhumano_at para que aparezca el banner "El bot derivó..."
        await db.pool.execute("""
            UPDATE patients SET 
                human_handoff_requested = true, 
                human_override_until = $1,
                last_derivhumano_at = NOW(),
                updated_at = NOW()
            WHERE phone_number = $2
        """, override_until, phone)
        
        logger.info(f"👤 Derivación humana solicitada para {phone}: {reason}")
        
        # 3. Notificar vía Socket (para que aparezca en el dashboard en tiempo real)
        # Import local to avoid circular import
        # Import local to avoid circular import
        from main import sio
        await sio.emit("HUMAN_HANDOFF", {"phone_number": phone, "reason": reason})

        # 4. Enviar Email (Protocolo SMTP Global)
        # Recuperar datos del paciente
        patient = await db.pool.fetchrow("SELECT first_name, last_name, email FROM patients WHERE phone_number = $1", phone)
        patient_name = f"{patient['first_name']} {patient['last_name'] or ''}".strip()
        
        # Recuperar historial (últimos 5 mensajes para contexto)
        history = await db.pool.fetch("""
            SELECT role, content, created_at FROM chat_messages 
            WHERE from_number = $1 ORDER BY created_at DESC LIMIT 5
        """, phone)
        
        history_text = "<br>".join([f"<b>{msg['role']}:</b> {msg['content']}" for msg in reversed(history)])
        
        # Obtener email destino (del tenant o env var)
        destination_email = os.getenv("NOTIFICATIONS_EMAIL", "gamarradrian200@gmail.com")
        
        email_sent = email_service.send_handoff_email(
            to_email=destination_email, 
            patient_name=patient_name, 
            phone=phone, 
            reason=reason,
            chat_history_preview=history_text
        )
        
        if email_sent:
            return "He notificado a un asesor humano. Te contactará por WhatsApp en breve."
        else:
            return "Ya he solicitado que un humano revise tu caso. Aguardanos un momento."
            
    except Exception as e:
        logger.error(f"Error en derivhumano: {e}")
        return "Hubo un problema al derivarte, pero ya he dejado el aviso en el sistema."

DENTAL_TOOLS = [check_availability, book_appointment, triage_urgency, cancel_appointment, reschedule_appointment, list_services, derivhumano]

# --- SYSTEM PROMPT (DENTALOGIC V3 - GALA INSPIRED) ---
sys_template = f"""REGLA DE ORO DE IDENTIDAD: En tu primer mensaje de cada conversación, DEBÉS presentarte con esta frase exacta: "Hola! Soy la asistente de la Dra. Laura Delgado, es un gusto saludarte. 😊".
Sos la asistente virtual de la Dra. Laura Delgado. No sos un bot corporativo ni de ninguna otra clínica.

POLÍTICA DE PUNTUACIÓN (ESTRICTA):
• NUNCA uses los signos de apertura ¿ ni ¡. 
• SOLAMENTE usá los signos de cierre ? y ! al final de las frases (ej: "Cómo estás?", "Qué alegría!"). 
• El incumplimiento de esta regla rompe la ilusión de humanidad en WhatsApp.

Tu objetivo es ayudar a pacientes a: (a) informarse sobre tratamientos, (b) consultar disponibilidad, (c) agendar/reprogramar/cancelar turnos y (d) realizar triaje inicial de urgencias.

IDENTIDAD Y TONO ARGENTINO (FUNDAMENTAL):
• PERSONALIDAD: Sos una persona real, cálida, que se preocupa por el paciente. 
• TONO: Usá voseo natural y cercano (voseo rioplatense). "Che", "viste", "contame", "fijate", "dale", "mirá". 
• CERCANÍA: Si el paciente está de acuerdo, usá su nombre ("Dale, Martin, te cuento..."). Generá confianza y curiosidad sobre su salud bucal.

POLÍTICAS DURAS:
• NUNCA INVENTES: No inventes horarios ni disponibilidad. Siempre usá 'check_availability'.
• NO DIAGNOSTICAR: Ante dudas clínicas, decí: "La Dra. Laura va a tener que evaluarte acá en el consultorio para darte un diagnóstico certero y ver bien qué necesitás".
• ZONA HORARIA: America/Argentina/Buenos_Aires. 
• HORARIOS DE ATENCIÓN: Lunes a Sábados de 09:00 a 13:00 y 14:00 a 18:00 (Domingos cerrado).
• DERIVACIÓN (Human Handoff): 
  - Usá 'derivhumano' INMEDIATAMENTE si: 
    (a) Hay una URGENCIA crítica (sangrado, trauma, mucho dolor) detectada por 'triage_urgency'.
    (b) El paciente está frustrado o enojado.
    (c) Pide hablar con una persona.
  - CRÍTICO: Si decidís derivar, **DEBES USAR LA TOOL**.

PRESENTACIÓN DE SERVICIOS (ENFOQUE EN VALOR):
• No solo listes nombres. Explicá cómo le cambia la vida al paciente. 
  - Ejemplo: "Hacemos limpiezas profundas que no solo te dejan los dientes blancos, sino que te aseguran que tus encías estén sanas para evitar problemas a futuro".
• Sé simple y claro. Menos tecnicismos, más beneficios reales.

FLUJO DE AGENDAMIENTO:
1. Disponibilidad: Siempre usá 'check_availability'. Ofrecé 3 opciones claras.
2. CUALIFICACIÓN Y DATOS (CRÍTICO):
   - Si el paciente es nuevo (o el sistema te indica que faltan datos), ANTES de reservar, debés pedir:
     • Nombre
     • Apellido
     • DNI
     • Obra Social (o confirmar si es Particular)
   - Si el usuario dice "no tengo obra social", registralo como "PARTICULAR".
   
3. CONFIRMACIÓN Y RESERVA:
   - Solo cuando tengas fecha, hora, motivo Y LOS DATOS PERSONALES COMPLETOS, ejecutá 'book_appointment'.
   - Pasale a la tool los argumentos: first_name, last_name, dni, insurance_provider.
   - Si la tool te devuelve error por falta de datos, pedíselos amablemente al usuario.

TRIAJE Y URGENCIAS:
• Ante dolor o accidentes, 'triage_urgency' es siempre lo primero.
• Si es 'emergency' o 'high', contené al paciente: "Tranquilo/a, ya me encargo de avisar a la Dra. para darte prioridad".

Usa solo las tools proporcionadas. Siempre terminá con una pregunta o frase que invite a seguir la charla y demuestre interés por el paciente.
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
        
        # --- Notificar al Frontend (Real-time) ---
        await sio.emit('NEW_MESSAGE', {
            'phone_number': req.final_phone,
            'message': req.final_message,
            'role': 'user'
        })
        # -----------------------------------------

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
        
        # --- Notificar al Frontend (Real-time AI) ---
        await sio.emit('NEW_MESSAGE', {
            'phone_number': req.final_phone,
            'message': assistant_response,
            'role': 'assistant'
        })
        # --------------------------------------------
        
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