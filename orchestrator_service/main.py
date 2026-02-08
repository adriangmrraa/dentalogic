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
CLINIC_HOURS_START = os.getenv("CLINIC_HOURS_START", "08:00")
CLINIC_HOURS_END = os.getenv("CLINIC_HOURS_END", "19:00")
ARG_TZ = timezone(timedelta(hours=-3))

def get_now_arg():
    """Obtiene la fecha y hora actual garantizando zona horaria de Argentina."""
    return datetime.now(ARG_TZ)

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
        phone = self.phone or self.from_number or ""
        # Normalización E.164 básica para consistencia en BD (con +)
        clean = re.sub(r'\D', '', phone)
        if clean and not phone.startswith('+'):
            return '+' + clean
        return phone # Si ya tiene + o está vacío
    
    @property
    def final_name(self) -> str:
        return self.customer_name or self.name or "Paciente"

def to_json_safe(obj: Any) -> Any:
    """Helper para serializar objetos datetime/date para JSON/SocketIO."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj

# --- HELPERS PARA PARSING DE FECHAS ---

def get_next_weekday(target_weekday: int) -> date:
    """Obtiene el próximo día de la semana (0=lunes, 6=domingo)."""
    today = get_now_arg()
    days_ahead = target_weekday - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).date()

def parse_date(date_query: str) -> date:
    """Convierte 'mañana', 'lunes', '2025-02-05' a date."""
    query = date_query.lower().strip()
    
    # Palabras clave españolas/inglesas
    day_map = {
        'mañana': lambda: (get_now_arg() + timedelta(days=1)).date(),
        'tomorrow': lambda: (get_now_arg() + timedelta(days=1)).date(),
        'hoy': lambda: get_now_arg().date(),
        'today': lambda: get_now_arg().date(),
        'lunes': lambda: get_next_weekday(0),
        'monday': lambda: get_next_weekday(0),
        'martes': lambda: get_next_weekday(1),
        'tuesday': lambda: get_next_weekday(1),
        'miércoles': lambda: get_next_weekday(2),
        'miercoles': lambda: get_next_weekday(2),
        'wednesday': lambda: get_next_weekday(2),
        'jueves': lambda: get_next_weekday(3),
        'thursday': lambda: get_next_weekday(3),
        'viernes': lambda: get_next_weekday(4),
        'friday': lambda: get_next_weekday(4),
        'sábado': lambda: get_next_weekday(5),
        'sabado': lambda: get_next_weekday(5),
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
        return get_now_arg().date()

def parse_datetime(datetime_query: str) -> datetime:
    """Convierte 'lunes 15:30', 'mañana 14:00', '2025-02-05 14:30' a datetime localizado."""
    query = datetime_query.lower().strip()
    target_date = None
    target_time = (14, 0) # Default

    # 1. Extraer hora (HH:MM)
    time_match = re.search(r'(\d{1,2})[:h](\d{2})', query)
    if time_match:
        target_time = (int(time_match.group(1)), int(time_match.group(2)))
    
    # 2. Extraer fecha (usando la lógica de parse_date)
    # Buscamos palabras clave o fechas en la query
    words = query.split()
    for word in words:
        try:
            # Intentamos parsear la palabra individualmente como fecha (mañana, lunes, etc)
            d = parse_date(word)
            # Si no es hoy, o si la query explícitamente dice 'hoy', lo tomamos
            if d != get_now_arg().date() or 'hoy' in query or 'today' in query:
                target_date = d
                break
        except:
            continue

    # 3. Fallback a dateutil para formatos estándar (YYYY-MM-DD)
    if not target_date:
        try:
            dt = dateutil_parse(query, dayfirst=True)
            if dt.year > 2000: # Evitar años raros
                target_date = dt.date()
                if not time_match: target_time = (dt.hour, dt.minute)
        except:
            target_date = (get_now_arg() + timedelta(days=1)).date()

    return datetime.combine(target_date, datetime.min.time()).replace(
        hour=target_time[0], minute=target_time[1], second=0, microsecond=0, tzinfo=ARG_TZ
    )

def to_json_safe(data):
    """
    Convierte recursivamente UUIDs y datetimes a tipos serializables por JSON.
    """
    if isinstance(data, dict):
        return {k: to_json_safe(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [to_json_safe(i) for i in data]
    elif isinstance(data, uuid.UUID):
        return str(data)
    elif isinstance(data, (datetime, date)):
        return data.isoformat()
    return data

def is_time_in_working_hours(time_str: str, day_config: Dict[str, Any]) -> bool:
    """Verifica si un HH:MM está dentro de los slots habilitados del día."""
    if not day_config.get("enabled", False):
        return False
    
    # Normalizar time_str a minutos desde medianoche para comparación fácil
    try:
        th, tm = map(int, time_str.split(':'))
        current_m = th * 60 + tm
        
        for slot in day_config.get("slots", []):
            sh, sm = map(int, slot['start'].split(':'))
            eh, em = map(int, slot['end'].split(':'))
            start_m = sh * 60 + sm
            end_m = eh * 60 + em
            
            if start_m <= current_m < end_m:
                return True
    except:
        pass
    return False

def generate_free_slots(target_date: date, busy_intervals_by_prof: Dict[int, set], 
                        start_time_str="09:00", end_time_str="18:00", interval_minutes=30, 
                        duration_minutes=30, limit=20, time_preference: Optional[str] = None) -> List[str]:
    """Genera lista de horarios disponibles (si al menos un profesional tiene el hueco completo)."""
    slots = []
    
    # Parse start and end times
    try:
        sh, sm = map(int, start_time_str.split(':'))
        eh, em = map(int, end_time_str.split(':'))
    except:
        sh, sm = 9, 0
        eh, em = 18, 0

    current = datetime.combine(target_date, datetime.min.time()).replace(hour=sh, minute=sm, tzinfo=ARG_TZ)
    end_limit = datetime.combine(target_date, datetime.min.time()).replace(hour=eh, minute=em, tzinfo=ARG_TZ)
    
    now = get_now_arg()
    
    # Un horario está libre si AL MENOS UN profesional está libre durante toda la duración solicitada
    while current < end_limit:
        # No ofrecer turnos en el pasado (si es hoy)
        if target_date == now.date() and current <= now:
            current += timedelta(minutes=interval_minutes)
            continue

        # Filtro por preferencia de horario
        if time_preference == 'mañana' and current.hour >= 13:
            current += timedelta(minutes=interval_minutes)
            continue
        if time_preference == 'tarde' and current.hour < 13:
            current += timedelta(minutes=interval_minutes)
            continue

        # Saltar almuerzo (opcional)
        if current.hour >= 13 and current.hour < 14 and not time_preference:
            current += timedelta(minutes=interval_minutes)
            continue
        
        # Verificar si algún profesional tiene el hueco libre
        time_needed = current + timedelta(minutes=duration_minutes)
        if time_needed > end_limit: # No cabe al final del día
            current += timedelta(minutes=interval_minutes)
            continue

        any_prof_free = False
        for prof_id, busy_set in busy_intervals_by_prof.items():
            slot_free = True
            # Revisar cada intervalo de 30 min dentro de la duración
            check_time = current
            while check_time < time_needed:
                if check_time.strftime("%H:%M") in busy_set:
                    slot_free = False
                    break
                check_time += timedelta(minutes=30)
            
            if slot_free:
                any_prof_free = True
                break
        
        if any_prof_free:
            slots.append(current.strftime("%H:%M"))
        
        if len(slots) >= limit:
            break

        current += timedelta(minutes=interval_minutes)
    
    return slots

# --- TOOLS DENTALES ---

@tool
async def check_availability(date_query: str, professional_name: Optional[str] = None, 
                             treatment_name: Optional[str] = None, time_preference: Optional[str] = None):
    """
    Consulta la disponibilidad REAL de turnos en la BD para una fecha.
    date_query: Descripción de la fecha (ej: 'mañana', 'lunes', '2025-05-10')
    professional_name: (Opcional) Nombre del profesional específico.
    treatment_name: (Opcional) Nombre del tratamiento (limpieza, consulta, perno y corona, etc) para calcular la duración.
    time_preference: (Opcional) 'mañana', 'tarde' o 'todo'.
    Devuelve: Horarios disponibles
    """
    try:
        # 0. A) Limpiar nombre y obtener profesionales activos
        clean_name = professional_name
        if professional_name:
            # Remover títulos comunes y normalizar
            clean_name = re.sub(r'^(dr|dra|doctor|doctora)\.?\s+', '', professional_name, flags=re.IGNORECASE).strip()
        
        query = "SELECT id, first_name, last_name, google_calendar_id, working_hours FROM professionals WHERE is_active = true"
        params = []
        if clean_name:
            query += " AND (first_name ILIKE $1 OR last_name ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1)"
            params.append(f"%{clean_name}%")
        
        active_professionals = await db.pool.fetch(query, *params)
        if not active_professionals and professional_name:
            return f"❌ No encontré al profesional '{professional_name}'. ¿Querés consultar disponibilidad general?"

        target_date = parse_date(date_query)
        
        # 0. B) Validar contra Working Hours antes de GCal (Primer Filtro)
        # Usamos número de día (0=Monday, 6=Sunday) para evitar problemas de locale
        day_idx = target_date.weekday()
        days_en = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        day_name_en = days_en[day_idx]
        
        # Si se pidió un profesional específico, verificar si atiende ese día
        if clean_name and active_professionals:
            prof = active_professionals[0]
            wh = prof.get('working_hours') or {}
            day_config = wh.get(day_name_en, {"enabled": False, "slots": []})
            
            if not day_config.get("enabled"):
                return f"Lo siento, el/la Dr/a. {prof['first_name']} no atiende los {target_date.strftime('%A')}. ¿Querés que busquemos disponibilidad con otros profesionales?"

        if day_idx == 6:
            return f"Lo siento, el {date_query} es domingo y la clínica está cerrada. Atendemos Lunes a Sábados."

        # 0. B) Obtener duración del tratamiento
        duration = 30 # Default
        if treatment_name:
            t_data = await db.pool.fetchrow("""
                SELECT default_duration_minutes FROM treatment_types 
                WHERE (name ILIKE $1 OR code ILIKE $1) AND is_available_for_booking = true
                LIMIT 1
            """, f"%{treatment_name}%")
            if t_data:
                duration = t_data['default_duration_minutes']
        
        # --- JIT VALIDATION: Fetch Real-Time Events from Google ---
        # Obtener IDs de citas ya existentes para evitar duplicados como "bloques"
        existing_apt_gids = await db.pool.fetch("SELECT google_calendar_event_id FROM appointments WHERE google_calendar_event_id IS NOT NULL")
        apt_gids_set = {row['google_calendar_event_id'] for row in existing_apt_gids}

        for prof in active_professionals:
            prof_id = prof['id']
            cal_id = prof['google_calendar_id']
            if not cal_id: continue
                
            try:
                g_events = gcal_service.get_events_for_day(calendar_id=cal_id, date_obj=target_date)
                start_day = datetime.combine(target_date, datetime.min.time(), tzinfo=ARG_TZ)
                end_day = datetime.combine(target_date, datetime.max.time(), tzinfo=ARG_TZ)
                
                # Limpiar bloques viejos para este día y profesional antes de re-insertar
                await db.pool.execute("""
                    DELETE FROM google_calendar_blocks 
                    WHERE professional_id = $1 AND (start_datetime < $3 AND end_datetime > $2)
                """, prof_id, start_day, end_day)
                
                for event in g_events:
                    g_id = event['id']
                    if g_id in apt_gids_set:
                        continue # Ya es una cita controlada por nosotros
                        
                    summary = event.get('summary', 'Ocupado (GCal)')
                    description = event.get('description', '')
                    start = event['start'].get('dateTime') or event['start'].get('date')
                    end = event['end'].get('dateTime') or event['end'].get('date')
                    all_day = 'date' in event['start']
                    
                    try:
                        dt_start = datetime.fromisoformat(start.replace('Z', '+00:00'))
                        dt_end = datetime.fromisoformat(end.replace('Z', '+00:00'))
                        await db.pool.execute("""
                            INSERT INTO google_calendar_blocks (
                                tenant_id, google_event_id, title, description,
                                start_datetime, end_datetime, all_day, professional_id, sync_status
                            ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, 'synced')
                            ON CONFLICT (google_event_id) DO NOTHING
                        """, g_id, summary, description, dt_start, dt_end, all_day, prof_id)
                    except Exception as ins_err:
                        logger.error(f"Error inserting GCal block {g_id}: {ins_err}")
            except Exception as e:
                logger.error(f"JIT Fetch error for prof {prof_id}: {e}")

        # 2. Obtener ocupación agrupada por profesional
        prof_ids = [p['id'] for p in active_professionals]
        start_day = datetime.combine(target_date, datetime.min.time(), tzinfo=ARG_TZ)
        end_day = datetime.combine(target_date, datetime.max.time(), tzinfo=ARG_TZ)

        appointments = await db.pool.fetch("""
            SELECT professional_id, appointment_datetime as start, duration_minutes
            FROM appointments
            WHERE professional_id = ANY($1) AND status IN ('scheduled', 'confirmed')
            AND (appointment_datetime < $3 AND (appointment_datetime + interval '1 minute' * COALESCE(duration_minutes, 60)) > $2)
        """, prof_ids, start_day, end_day)

        gcal_blocks = await db.pool.fetch("""
            SELECT professional_id, start_datetime as start, end_datetime as end
            FROM google_calendar_blocks
            WHERE (professional_id = ANY($1) OR professional_id IS NULL)
            AND (start_datetime < $3 AND end_datetime > $2)
        """, prof_ids, start_day, end_day)

        # Mapear intervalos ocupados por profesional
        busy_map = {pid: set() for pid in prof_ids}
        
        # --- Pre-llenar busy_map con horarios NO LABORALES del profesional ---
        # Usamos el mismo day_name_en calculado arriba (basado en weekday())
        for prof in active_professionals:
            wh = prof.get('working_hours') or {}
            day_config = wh.get(day_name_en, {"enabled": False, "slots": []})
            
            prof_id = prof['id']
            # Iterar cada bloque de 30 min del día y marcar como ocupado si NO está en working_hours
            check_time = datetime.combine(target_date, datetime.min.time()).replace(hour=8, minute=0) # Desde las 8am
            for _ in range(24): # Hasta las 20hs aprox (12 horas * 2 slots/hora)
                h_m = check_time.strftime("%H:%M")
                if not is_time_in_working_hours(h_m, day_config):
                    busy_map[prof_id].add(h_m)
                check_time += timedelta(minutes=30)
                if check_time.hour >= 20: break

        # Agregar bloqueos de GCal
        global_busy = set()
        for b in gcal_blocks:
            it = b['start'].astimezone(ARG_TZ)
            while it < b['end'].astimezone(ARG_TZ):
                h_m = it.strftime("%H:%M")
                if b['professional_id']:
                    if b['professional_id'] in busy_map:
                        busy_map[b['professional_id']].add(h_m)
                else:
                    global_busy.add(h_m)
                it += timedelta(minutes=30)
        
        for appt in appointments:
            it = appt['start'].astimezone(ARG_TZ)
            end_it = it + timedelta(minutes=appt['duration_minutes'])
            while it < end_it:
                if appt['professional_id'] in busy_map:
                    busy_map[appt['professional_id']].add(it.strftime("%H:%M"))
                it += timedelta(minutes=30)
        
        # Unir globales a todos
        for pid in busy_map:
            busy_map[pid].update(global_busy)

        # 3. Generar slots libres
        available_slots = generate_free_slots(
            target_date, 
            busy_map, 
            duration_minutes=duration,
            start_time_str=CLINIC_HOURS_START, 
            end_time_str=CLINIC_HOURS_END,
            time_preference=time_preference,
            limit=50
        )
        
        if available_slots:
            slots_str = ", ".join(available_slots)
            resp = f"Para {date_query} ({duration} min), tenemos disponibilidad: {slots_str}. "
            if professional_name:
                resp += f"Consultando específicamente con Dr/a. {professional_name}."
            return resp
        else:
            return f"No encontré huecos libres de {duration} min para {date_query}. ¿Probamos otro día o momento?"
            
    except Exception as e:
        logger.error(f"Error en check_availability: {e}")
        return "No pude consultar la disponibilidad. ¿Probamos una fecha diferente?"

@tool
async def book_appointment(date_time: str, treatment_reason: str, 
                         first_name: Optional[str] = None, last_name: Optional[str] = None, 
                         dni: Optional[str] = None, insurance_provider: Optional[str] = None,
                         professional_name: Optional[str] = None):
    """
    Registra un turno en la BD. 
    Para pacientes NUEVOS (status='guest'), OBLIGATORIAMENTE debes proveer first_name, last_name, dni e insurance_provider.
    Si faltan esos datos en un usuario nuevo, el turno será rechazado.
    
    date_time: Fecha y hora (ej: 'mañana 14:00')
    treatment_reason: Motivo/Tratamiento (checkup, cleaning, extraction, root_canal, restoration, orthodontics, consultation)
    professional_name: (Opcional) Nombre del profesional específico.
    """
    phone = current_customer_phone.get()
    if not phone:
        return "❌ Error: No pude identificar tu teléfono. Reinicia la conversación."
    
    try:
        # 1. Parsear datetime y obtener duración
        apt_datetime = parse_datetime(date_time)
        first_name = first_name.strip() if first_name and first_name.strip() else None
        last_name = last_name.strip() if last_name and last_name.strip() else None
        dni = dni.strip() if dni and dni.strip() else None
        insurance_provider = insurance_provider.strip() if insurance_provider and insurance_provider.strip() else None

        # Búsqueda de duración por tratamiento
        t_data = await db.pool.fetchrow("""
            SELECT code, default_duration_minutes FROM treatment_types 
            WHERE (name ILIKE $1 OR code ILIKE $1) AND is_available_for_booking = true
            LIMIT 1
        """, f"%{treatment_reason}%")
        
        duration = t_data['default_duration_minutes'] if t_data else 30
        treatment_code = t_data['code'] if t_data else treatment_reason
        end_apt = apt_datetime + timedelta(minutes=duration)

        # 2. Verificar/Crear paciente
        existing_patient = await db.pool.fetchrow("SELECT id, status FROM patients WHERE phone_number = $1", phone)
        if existing_patient:
            await db.pool.execute("""
                UPDATE patients 
                SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), 
                    dni = COALESCE($3, dni), insurance_provider = COALESCE($4, insurance_provider), 
                    status = 'active', updated_at = NOW()
                WHERE id = $5
            """, first_name, last_name, dni, insurance_provider, existing_patient['id'])
            patient_id = existing_patient['id']
        else:
            if not (first_name and last_name and dni and insurance_provider):
                 return "❌ Necesito Nombre, Apellido, DNI y Obra Social para agendar por primera vez."
            
            row = await db.pool.fetchrow("""
                INSERT INTO patients (tenant_id, phone_number, first_name, last_name, dni, insurance_provider, status, created_at)
                VALUES (1, $1, $2, $3, $4, $5, 'active', NOW())
                RETURNING id
            """, phone, first_name, last_name, dni, insurance_provider)
            patient_id = row['id']

        # 3. Encontrar profesional disponible
        clean_p_name = professional_name
        if professional_name:
            clean_p_name = re.sub(r'^(dr|dra|doctor|doctora)\.?\s+', '', professional_name, flags=re.IGNORECASE).strip()

        p_query = "SELECT id, first_name, last_name, google_calendar_id, working_hours FROM professionals WHERE is_active = true"
        p_params = []
        if clean_p_name:
            p_query += " AND (first_name ILIKE $1 OR last_name ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1)"
            p_params.append(f"%{clean_p_name}%")
        
        candidates = await db.pool.fetch(p_query, *p_params)
        if not candidates:
            return f"❌ No encontré al profesional '{professional_name or ''}' disponible. ¿Querés agendar con otro profesional?"

        # Obtener IDs de citas para evitar duplicados en el bloque JIT
        existing_apt_gids = await db.pool.fetch("SELECT google_calendar_event_id FROM appointments WHERE google_calendar_event_id IS NOT NULL")
        apt_gids_set = {row['google_calendar_event_id'] for row in existing_apt_gids}

        target_prof = None
        
        for cand in candidates:
            # --- Nuevo Filtro: Working Hours ---
            wh = cand.get('working_hours') or {}
            day_idx = apt_datetime.weekday()
            days_en = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            day_name_en = days_en[day_idx]
            day_config = wh.get(day_name_en, {"enabled": False, "slots": []})
            apt_time_str = apt_datetime.strftime("%H:%M")
            
            if not is_time_in_working_hours(apt_time_str, day_config):
                continue # Este profesional no atiende a esta hora
            # ----------------------------------

            # JIT Sync GCal for this prof/day before checking
            try:
                g_events = gcal_service.get_events_for_day(calendar_id=cand['google_calendar_id'], date_obj=apt_datetime.date())
                day_start = datetime.combine(apt_datetime.date(), datetime.min.time(), tzinfo=ARG_TZ)
                day_end = datetime.combine(apt_datetime.date(), datetime.max.time(), tzinfo=ARG_TZ)
                
                # Limpieza de bloques previos para este día/profesional
                await db.pool.execute("DELETE FROM google_calendar_blocks WHERE professional_id = $1 AND start_datetime < $3 AND end_datetime > $2", cand['id'], day_start, day_end)
                
                for event in g_events:
                    g_id = event['id']
                    if g_id in apt_gids_set:
                        continue # Ya es una cita controlada
                        
                    start = event['start'].get('dateTime') or event['start'].get('date')
                    end = event['end'].get('dateTime') or event['end'].get('date')
                    dt_start = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    dt_end = datetime.fromisoformat(end.replace('Z', '+00:00'))

                    await db.pool.execute("""
                        INSERT INTO google_calendar_blocks (tenant_id, google_event_id, title, start_datetime, end_datetime, professional_id, sync_status)
                        VALUES (1, $1, $2, $3, $4, $5, 'synced') 
                        ON CONFLICT (google_event_id) DO NOTHING
                    """, g_id, event.get('summary','Ocupado'), dt_start, dt_end, cand['id'])
            except Exception as jit_err:
                logger.error(f"JIT GCal error in booking: {jit_err}")

            # Verificación de colisión
            conflict = await db.pool.fetchval("""
                SELECT EXISTS(
                    SELECT 1 FROM appointments WHERE professional_id = $1 AND status IN ('scheduled', 'confirmed')
                    AND (appointment_datetime < $3 AND (appointment_datetime + interval '1 minute' * COALESCE(duration_minutes, 60)) > $2)
                    UNION ALL
                    SELECT 1 FROM google_calendar_blocks WHERE (professional_id = $1 OR professional_id IS NULL)
                    AND (start_datetime < $3 AND end_datetime > $2)
                )
            """, cand['id'], apt_datetime, end_apt)
            
            if not conflict:
                target_prof = cand
                break
        
        if not target_prof:
            return f"❌ Lo siento, no hay disponibilidad a las {apt_datetime.strftime('%H:%M')} para el tratamiento de {duration} min. ¿Probamos otro horario?"

        # 4. Insertar turno
        apt_id = str(uuid.uuid4())
        await db.pool.execute("""
            INSERT INTO appointments (id, tenant_id, patient_id, professional_id, appointment_datetime, duration_minutes, appointment_type, status, source, created_at)
            VALUES ($1, 1, $2, $3, $4, $5, $6, 'scheduled', 'ai', NOW())
        """, apt_id, patient_id, target_prof['id'], apt_datetime, duration, treatment_code)
        
        # 5. Sincronizar con GCal
        try:
            summary = f"Cita Dental AI: {first_name or 'Paciente'} - {treatment_code}"
            gcal_service.create_event(
                calendar_id=target_prof['google_calendar_id'],
                summary=summary,
                start_time=apt_datetime.isoformat(),
                end_time=end_apt.isoformat(),
                description=f"Paciente: {first_name} {last_name or ''}\nDNI: {dni}\nOS: {insurance_provider}\nMotivo: {treatment_reason}"
            )
        except Exception as ge: logger.error(f"GCal sync error: {ge}")

        # 6. Notificar Socket.IO si está disponible
        try:
            from main import sio # Ensure we have sio
            # Sanitizar para evitar errores de serialización
            safe_data = to_json_safe({
                "id": apt_id, 
                "patient_name": f"{first_name} {last_name or ''}",
                "appointment_datetime": apt_datetime.isoformat(),
                "professional_name": target_prof['first_name']
            })
            await sio.emit("NEW_APPOINTMENT", safe_data)
        except: pass

        return f"✅ ¡Turno confirmado con el/la Dr/a. {target_prof['first_name']}! Martes {apt_datetime.strftime('%d/%m')} a las {apt_datetime.strftime('%H:%M')} ({duration} min)."

    except Exception as e:
        logger.error(f"Error en book_appointment: {e}")
        return "⚠️ Tuve un problema al procesar la reserva. Por favor, intenta de nuevo indicando fecha y hora."

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
            await sio.emit("PATIENT_UPDATED", to_json_safe({
                "phone_number": phone,
                "urgency_level": urgency_level,
                "urgency_reason": symptoms
            }))
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
            # Fetch professional's calendar ID
            google_calendar_id = await db.pool.fetchval(
                "SELECT google_calendar_id FROM professionals WHERE id = (SELECT professional_id FROM appointments WHERE id = $1)", 
                apt['id']
            )
            if google_calendar_id:
                gcal_service.delete_event(calendar_id=google_calendar_id, event_id=apt['google_calendar_event_id'])
            
        # 2. Marcar como cancelado en BD
        await db.pool.execute("""
            UPDATE appointments SET status = 'cancelled', google_calendar_sync_status = 'cancelled'
            WHERE id = $1
        """, apt['id'])
        
        # 3. Notificar a la UI (Borrado visual)
        from main import sio
        await sio.emit("APPOINTMENT_DELETED", apt['id'])

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
        # Fetch professional's calendar ID
        google_calendar_id = await db.pool.fetchval(
            "SELECT google_calendar_id FROM professionals WHERE id = (SELECT professional_id FROM appointments WHERE id = $1)", 
            apt['id']
        )

        if apt['google_calendar_event_id'] and google_calendar_id:
            # Podríamos usar gcal_service.update_event si existiera, o delete/create
            # Para simplificar, borramos el viejo y creamos uno nuevo (o implementamos update en el service)
            gcal_service.delete_event(calendar_id=google_calendar_id, event_id=apt['google_calendar_event_id'])
            
        summary = f"Cita Dental AI (Reprogramada): {phone}"
        if google_calendar_id:
            new_gcal = gcal_service.create_event(
                calendar_id=google_calendar_id,
                summary=summary,
                start_time=new_dt.isoformat(),
                end_time=(new_dt + timedelta(minutes=60)).isoformat()
            )
        else:
            new_gcal = None
        
        # 4. Actualizar BD
        await db.pool.execute("""
            UPDATE appointments SET 
                appointment_datetime = $1, 
                google_calendar_event_id = $2,
                google_calendar_sync_status = 'synced',
                updated_at = NOW()
            WHERE id = $3
        """, new_dt, new_gcal['id'] if new_gcal else None, apt['id'])
        
        # 5. Emitir evento Socket.IO (Actualizar UI)
        try:
            # Obtener datos actualizados para el frontend
            updated_apt = await db.pool.fetchrow("""
                SELECT a.*, p.first_name, p.last_name, p.phone_number, prof.first_name as professional_name
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                JOIN professionals prof ON a.professional_id = prof.id
                WHERE a.id = $1
            """, apt['id'])
            if updated_apt:
                await sio.emit("APPOINTMENT_UPDATED", to_json_safe(dict(updated_apt)))
        except Exception as se:
            logger.error(f"Error emitiendo APPOINTMENT_UPDATED via Socket: {se}")

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
        from main import sio
        await sio.emit("HUMAN_HANDOFF", to_json_safe({"phone_number": phone, "reason": reason}))

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
• HORARIOS SAGRADOS: Los horarios de los profesionales son sagrados. Si un profesional no atiende el día solicitado, debés informarlo claramente al paciente ("Mirá, el Dr. Juan no atiende los Miércoles") y ofrecerle alternativas:
  a) Buscar disponibilidad en otro día con el mismo profesional.
  b) Buscar disponibilidad general (otros profesionales) para el día solicitado.
• NO DIAGNOSTICAR: Ante dudas clínicas, decí: "La Dra. Laura va a tener que evaluarte acá en el consultorio para darte un diagnóstico certero y ver bien qué necesitás".
• ZONA HORARIA: America/Argentina/Buenos_Aires (GMT-3). 
• TIEMPO ACTUAL: {{current_time}}
• HORARIOS DE ATENCIÓN GENERAL: Lunes a Sábados de {CLINIC_HOURS_START} a {CLINIC_HOURS_END} (Domingos cerrado). Sin embargo, recordá que cada profesional tiene su propio horario específico que 'check_availability' conoce.
• REGLA ANTI-PASADO: No podés agendar turnos para horarios que ya pasaron. Si un paciente pide hoy a las 15:00 y son las 15:30, informale amablemente que ese horario ya pasó y ofrecele los siguientes disponibles.
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

FLUJO DE AGENDAMIENTO (PROTOCOLO OBLIGATORIO):
1. INDAGACIÓN DE SERVICIO (ETAPA 1):
   - Tras saludar, DEBÉS preguntar qué tratamiento busca el paciente antes de pedir sus datos personales.
   - Si el usuario dice "quiero un turno", preguntá: "¿Qué te gustaría hacerte? Hacemos limpiezas, controles generales, ortodoncia, entre otros. Contame un poco qué necesitás?".
   - SIEMPRE debés tener claro el tratamiento para que 'check_availability' use la duración correcta (ej: limpieza 30m, endodoncia 60m).

2. CONSULTA DE DISPONIBILIDAD (ETAPA 2):
   - Una vez definido el tratamiento, usá 'check_availability'. 
   - Ofrecé 3 opciones de horarios claros.

3. CUALIFICACIÓN Y DATOS (ETAPA 3):
   - SOLO cuando el paciente haya elegido un horario o esté decidido a agendar, pedí los datos en este orden:
     a) Nombre completo (Nombre + Apellido)
     b) DNI
     c) Obra Social o PARTICULAR

4. CONFIRMACIÓN Y RESERVA (ETAPA 4):
   - No llames a 'book_appointment' hasta tener los 4 datos y el horario confirmado.
   - **SOLO** cuando tengas fecha, hora, motivo **Y LOS 4 DATOS PERSONALES COMPLETOS**, ejecutá 'book_appointment'.
   - Pasale a la tool: first_name, last_name, dni, insurance_provider.
   - Si la tool te devuelve "❌ Faltan datos...", NO digas que hubo un problema genérico. 
     En su lugar, pedile al paciente exactamente lo que indica el mensaje de error.

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
        await sio.emit('NEW_MESSAGE', to_json_safe({
            'phone_number': req.final_phone,
            'message': req.final_message,
            'role': 'user'
        }))
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
        now = get_now_arg()
        dias_semana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        nombre_dia = dias_semana[now.weekday()]
        
        response = await agent_executor.ainvoke({
            "input": req.final_message,
            "chat_history": messages,
            "current_time": f"{nombre_dia} {now.strftime('%d/%m/%Y %H:%M')}"
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
        await sio.emit('NEW_MESSAGE', to_json_safe({
            'phone_number': req.final_phone,
            'message': assistant_response,
            'role': 'assistant'
        }))
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