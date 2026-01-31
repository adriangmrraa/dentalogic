import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { Calendar, X, User, Stethoscope, Clock, Phone, MessageCircle, AlertTriangle, Wifi, WifiOff, RefreshCw, Cloud, CloudOff, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../api/axios';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../api/axios';

// ==================== TYPE DEFINITIONS ====================
interface Appointment {
  id: string;
  patient_id: number;
  professional_id: number;
  appointment_datetime: string;
  end_datetime?: string;
  duration_minutes?: number;
  status: string;
  urgency_level?: string;
  source?: string;
  appointment_type: string;
  notes?: string;
  patient_name?: string;
  patient_phone?: string;
  professional_name?: string;
}

interface GoogleCalendarBlock {
  id: string;
  google_event_id: string;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  all_day?: boolean;
  professional_id?: number;
  sync_status?: string;
}

interface Professional {
  id: number;
  first_name: string;
  last_name?: string;
  name?: string;
  is_active: boolean;
}

interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
}

// ==================== SOURCE COLORS ====================
// Colors for appointment sources: AI (blue), Manual (green), GCalendar (gray)
const SOURCE_COLORS: Record<string, { hex: string; label: string; bgClass: string; textClass: string }> = {
  ai: { 
    hex: '#3b82f6', 
    label: 'AI',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800'
  },
  manual: { 
    hex: '#22c55e', 
    label: 'Manual',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800'
  },
  gcalendar: { 
    hex: '#6b7280', 
    label: 'GCalendar',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-800'
  },
};

// Mapeo de IDs de appointment_statuses a colores hexadecimales
// 1: scheduled, 2: confirmed, 3: in_progress, 4: completed, 5: cancelled, 6: no_show
const STATUS_COLORS: Record<number, { hex: string; label: string }> = {
  1: { hex: '#3b82f6', label: 'scheduled' },   // azul - Programado
  2: { hex: '#22c55e', label: 'confirmed' },   // verde - Confirmado
  3: { hex: '#eab308', label: 'in_progress' }, // amarillo - En progreso
  4: { hex: '#6b7280', label: 'completed' },   // gris - Completado
  5: { hex: '#ef4444', label: 'cancelled' },   // rojo - Cancelado
  6: { hex: '#f97316', label: 'no_show' },     // naranja - No asistido
};

// UI colors for buttons and badges
const STATUS_UI_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: 'bg-blue-100 text-blue-800 border-blue-300', text: 'text-blue-800', border: 'border-blue-500' },
  confirmed: { bg: 'bg-green-100 text-green-800 border-green-300', text: 'text-green-800', border: 'border-green-500' },
  in_progress: { bg: 'bg-yellow-100 text-yellow-800 border-yellow-300', text: 'text-yellow-800', border: 'border-yellow-500' },
  completed: { bg: 'bg-gray-100 text-gray-800 border-gray-300', text: 'text-gray-800', border: 'border-gray-500' },
  cancelled: { bg: 'bg-red-100 text-red-800 border-red-300', text: 'text-red-800', border: 'border-red-500' },
  no_show: { bg: 'bg-orange-100 text-orange-800 border-orange-300', text: 'text-orange-800', border: 'border-orange-500' },
};

// Reverse mapping for status string to ID
const STATUS_STRING_TO_ID: Record<string, number> = {
  scheduled: 1,
  confirmed: 2,
  in_progress: 3,
  completed: 4,
  cancelled: 5,
  no_show: 6,
};

// Get status ID from status string
const getStatusId = (status: string): number => STATUS_STRING_TO_ID[status] || 1;

// Get color hex from status (string or ID)
const getStatusColorHex = (status: string | number): string => {
  if (typeof status === 'number') {
    return STATUS_COLORS[status]?.hex || STATUS_COLORS[1].hex;
  }
  const statusId = getStatusId(status);
  return STATUS_COLORS[statusId]?.hex || STATUS_COLORS[1].hex;
};

// Get color based on appointment source (AI vs Manual)
const getSourceColor = (source: string | undefined): string => {
  if (!source) return SOURCE_COLORS.ai.hex; // Default to AI if no source
  return SOURCE_COLORS[source]?.hex || SOURCE_COLORS.ai.hex;
};

// Get source label
const getSourceLabel = (source: string | undefined): string => {
  if (!source) return 'AI';
  return SOURCE_COLORS[source]?.label || source.toUpperCase();
};

export default function AgendaView() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [googleBlocks, setGoogleBlocks] = useState<GoogleCalendarBlock[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Appointment | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ syncing: boolean; lastSync: Date | null; error: string | null }>({
    syncing: false,
    lastSync: null,
    error: null,
  });
  const [collisionWarning, setCollisionWarning] = useState<{ hasCollision: boolean; message: string } | null>(null);
  const [insuranceStatus, setInsuranceStatus] = useState<{
    status: string;
    requires_token: boolean;
    message: string;
    expiration_days: number | null;
    insurance_provider: string | null;
  } | null>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef<Appointment[]>([]);
  
  const [formData, setFormData] = useState({
    patient_id: '',
    professional_id: '',
    appointment_datetime: '',
    appointment_type: 'checkup',
    notes: '',
  });

  // Fetch Google Calendar blocks
  const fetchGoogleBlocks = useCallback(async (startDate: string, endDate: string) => {
    try {
      const response = await api.get('/admin/calendar/blocks', {
        params: { start_date: startDate, end_date: endDate },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching Google Calendar blocks:', error);
      return [];
    }
  }, []);

  // Trigger Google Calendar sync
  const handleSyncNow = async () => {
    try {
      setSyncStatus({ ...syncStatus, syncing: true, error: null });
      const response = await api.post('/admin/sync/calendar');
      setSyncStatus({
        syncing: false,
        lastSync: new Date(),
        error: null,
      });
      
      // Refresh calendar data after sync
      fetchData();
      alert(`Sincronización completada: ${response.data.events_processed} eventos procesados`);
    } catch (error: any) {
      console.error('Error syncing calendar:', error);
      setSyncStatus({
        ...syncStatus,
        syncing: false,
        error: error.response?.data?.message || 'Error en sincronización',
      });
      alert(`Error en sincronización: ${syncStatus.error}`);
    }
  };

  // Check for collisions before creating appointment
  const checkCollisions = useCallback(async (professionalId: string, datetimeStr: string): Promise<boolean> => {
    if (!professionalId || !datetimeStr) return false;
    
    try {
      const response = await api.get('/admin/appointments/check-collisions', {
        params: {
          professional_id: professionalId,
          datetime_str: datetimeStr,
          duration_minutes: 60,
        },
      });
      
      if (response.data.has_collisions) {
        const conflicts: string[] = [];
        
        if (response.data.conflicting_appointments?.length > 0) {
          conflicts.push('Turno existente en ese horario');
        }
        if (response.data.conflicting_blocks?.length > 0) {
          conflicts.push(`Bloqueo GCalendar: ${response.data.conflicting_blocks.map((b: any) => b.title).join(', ')}`);
        }
        
        setCollisionWarning({
          hasCollision: true,
          message: `⚠️ Hay conflictos: ${conflicts.join('; ')}`,
        });
        return true;
      } else {
        setCollisionWarning(null);
        return false;
      }
    } catch (error) {
      console.error('Error checking collisions:', error);
      return false;
    }
  }, []);

  // Check insurance status when patient is selected
  const checkInsuranceStatus = useCallback(async (patientId: string) => {
    if (!patientId) {
      setInsuranceStatus(null);
      return;
    }

    try {
      const response = await api.get(`/admin/patients/${patientId}/insurance-status`);
      setInsuranceStatus(response.data);
    } catch (error) {
      console.error('Error checking insurance status:', error);
      setInsuranceStatus(null);
    }
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current calendar date range
      let startDate = new Date();
      let endDate = new Date();
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        startDate = calendarApi.view.activeStart;
        endDate = calendarApi.view.activeEnd;
      }
      
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();
      
      const [appointmentsRes, professionalsRes, patientsRes, blocksRes] = await Promise.all([
        api.get('/admin/appointments', { params: { start_date: startDateStr, end_date: endDateStr } }),
        api.get('/admin/professionals'),
        api.get('/admin/patients'),
        fetchGoogleBlocks(startDateStr, endDateStr),
      ]);
      
      const newAppointments = appointmentsRes.data;
      setAppointments(newAppointments);
      eventsRef.current = newAppointments;
      setGoogleBlocks(blocksRes || []);
      setProfessionals(professionalsRes.data.filter((p: Professional) => p.is_active));
      setPatients(patientsRes.data);
      setLastUpdate(new Date());
      
      // Force calendar refetch if calendar instance exists
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.removeAllEvents();
        
        // Add appointment events
        const appointmentEvents = newAppointments.map((apt: Appointment) => ({
          id: apt.id,
          title: `${apt.patient_name} - ${apt.appointment_type}`,
          start: apt.appointment_datetime,
          end: apt.end_datetime || undefined,
          backgroundColor: getSourceColor(apt.source),
          borderColor: getSourceColor(apt.source),
          extendedProps: { ...apt, eventType: 'appointment' },
        }));
        
        // Add Google Calendar block events
        const blockEvents = (blocksRes || []).map((block: GoogleCalendarBlock) => ({
          id: block.id,
          title: `🔒 ${block.title}`,
          start: block.start_datetime,
          end: block.end_datetime,
          allDay: block.all_day || false,
          backgroundColor: SOURCE_COLORS.gcalendar.hex,
          borderColor: SOURCE_COLORS.gcalendar.hex,
          extendedProps: { ...block, eventType: 'gcalendar_block' },
        }));
        
        calendarApi.addEventSource([...appointmentEvents, ...blockEvents]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleBlocks]);

  // Setup WebSocket connection and listeners
  useEffect(() => {
    // Fetch initial data
    fetchData();
    
    // Setup WebSocket connection
    socketRef.current = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection status handlers
    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      setSocketConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setSocketConnected(false);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setSocketConnected(false);
    });

    // Listen for NEW_APPOINTMENT events - Real-time sync from AI bot
    socketRef.current.on('NEW_APPOINTMENT', (newAppointment: Appointment) => {
      console.log('📅 Nuevo turno recibido via WebSocket:', newAppointment);
      
      setAppointments(prevAppointments => {
        const updated = [...prevAppointments, newAppointment];
        eventsRef.current = updated;
        return updated;
      });
      
      setLastUpdate(new Date());
      
      // Add event directly to calendar without refetching
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        calendarApi.addEvent({
          id: newAppointment.id,
          title: `${newAppointment.patient_name} - ${newAppointment.appointment_type}`,
          start: newAppointment.appointment_datetime,
          end: newAppointment.end_datetime || undefined,
          backgroundColor: getSourceColor(newAppointment.source),
          borderColor: getSourceColor(newAppointment.source),
          extendedProps: { ...newAppointment, eventType: 'appointment' },
        });
      }
    });

    // Listen for APPOINTMENT_UPDATED events
    socketRef.current.on('APPOINTMENT_UPDATED', (updatedAppointment: Appointment) => {
      console.log('🔄 Turno actualizado via WebSocket:', updatedAppointment);
      
      setAppointments(prevAppointments => {
        const updated = prevAppointments.map(apt => 
          apt.id === updatedAppointment.id ? updatedAppointment : apt
        );
        eventsRef.current = updated;
        return updated;
      });
      
      setLastUpdate(new Date());
      
      // Update event in calendar
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        const existingEvent = calendarApi.getEventById(updatedAppointment.id);
        if (existingEvent) {
          existingEvent.setProp('title', `${updatedAppointment.patient_name} - ${updatedAppointment.appointment_type}`);
          existingEvent.setStart(updatedAppointment.appointment_datetime);
          if (updatedAppointment.end_datetime) {
            existingEvent.setEnd(updatedAppointment.end_datetime);
          }
          existingEvent.setProp('backgroundColor', getSourceColor(updatedAppointment.source));
          existingEvent.setProp('borderColor', getSourceColor(updatedAppointment.source));
          existingEvent.setExtendedProp('extendedProps', { ...updatedAppointment, eventType: 'appointment' });
        }
      }
    });

    // Listen for APPOINTMENT_DELETED events
    socketRef.current.on('APPOINTMENT_DELETED', (deletedAppointmentId: string) => {
      console.log('❌ Turno eliminado via WebSocket:', deletedAppointmentId);
      
      setAppointments(prevAppointments => {
        const updated = prevAppointments.filter(apt => apt.id !== deletedAppointmentId);
        eventsRef.current = updated;
        return updated;
      });
      
      setLastUpdate(new Date());
      
      // Remove event from calendar
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        const existingEvent = calendarApi.getEventById(deletedAppointmentId);
        if (existingEvent) {
          existingEvent.remove();
        }
      }
    });

    return () => {
      // Cleanup WebSocket connection
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [fetchData]);

  // Calendar events transformer
  const calendarEvents = [
    ...appointments.map((apt) => ({
      id: apt.id,
      title: `${apt.patient_name} - ${apt.appointment_type}`,
      start: apt.appointment_datetime,
      end: apt.end_datetime || undefined,
      backgroundColor: getSourceColor(apt.source),
      borderColor: getSourceColor(apt.source),
      extendedProps: { ...apt, eventType: 'appointment' },
    })),
    ...googleBlocks.map((block) => ({
      id: block.id,
      title: `🔒 ${block.title}`,
      start: block.start_datetime,
      end: block.end_datetime,
      allDay: block.all_day || false,
      backgroundColor: SOURCE_COLORS.gcalendar.hex,
      borderColor: SOURCE_COLORS.gcalendar.hex,
      extendedProps: { ...block, eventType: 'gcalendar_block' },
    })),
  ];

  const handleDateClick = (info: { date: Date }) => {
    setSelectedDate(info.date);
    setSelectedEvent(null);
    setCollisionWarning(null);
    setInsuranceStatus(null);
    setFormData({
      patient_id: '',
      professional_id: professionals[0]?.id?.toString() || '',
      appointment_datetime: info.date.toISOString().slice(0, 16),
      appointment_type: 'checkup',
      notes: '',
    });
    setShowModal(true);
  };

  const handleEventClick = (info: any) => {
    // Check if it's a Google Calendar block
    if (info.event.extendedProps.eventType === 'gcalendar_block') {
      alert(`Bloqueo de Google Calendar:\n\n${info.event.title}\n${new Date(info.event.start).toLocaleString()} - ${new Date(info.event.end).toLocaleString()}`);
      return;
    }
    
    setSelectedEvent(info.event.extendedProps);
    setSelectedDate(info.event.start);
    setShowModal(true);
  };

  const handleProfessionalChange = async (profId: string) => {
    setFormData({ ...formData, professional_id: profId });
    
    // Check for collisions when professional or datetime changes
    if (formData.appointment_datetime && profId) {
      await checkCollisions(profId, formData.appointment_datetime);
    }
  };

  const handleDateTimeChange = async (datetimeStr: string) => {
    setFormData({ ...formData, appointment_datetime: datetimeStr });
    
    // Check for collisions
    if (formData.professional_id && datetimeStr) {
      await checkCollisions(formData.professional_id, datetimeStr);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final collision check before submission
    if (collisionWarning?.hasCollision) {
      if (!confirm('Hay conflictos de horario. ¿Deseas agendar de todas formas?')) {
        return;
      }
    }
    
    try {
      if (selectedEvent) {
        // Update existing appointment
        await api.put(`/admin/appointments/${selectedEvent.id}`, {
          patient_id: parseInt(formData.patient_id),
          professional_id: parseInt(formData.professional_id),
          appointment_datetime: formData.appointment_datetime,
          appointment_type: formData.appointment_type,
          notes: formData.notes,
        });
      } else {
        // Create new appointment manually (source='manual')
        await api.post('/admin/appointments', {
          patient_id: parseInt(formData.patient_id),
          professional_id: parseInt(formData.professional_id),
          appointment_datetime: formData.appointment_datetime,
          appointment_type: formData.appointment_type,
          notes: formData.notes,
          status: 'confirmed',
          source: 'manual',
        });
      }
      fetchData();
      setShowModal(false);
      setCollisionWarning(null);
      setInsuranceStatus(null);
    } catch (error: any) {
      console.error('Error saving appointment:', error);
      if (error.response?.status === 409) {
        setCollisionWarning({
          hasCollision: true,
          message: `⚠️ ${error.response.data.detail}`,
        });
      } else {
        alert('Error al guardar turno');
      }
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedEvent) return;
    try {
      await api.put(`/admin/appointments/${selectedEvent.id}/status`, { status });
      fetchData();
      setShowModal(false);
    } catch (error) {
      console.error('Error changing status:', error);
      alert('Error al cambiar estado');
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent || !confirm('¿Cancelar este turno?')) return;
    try {
      await api.put(`/admin/appointments/${selectedEvent.id}/status`, { status: 'cancelled' });
      fetchData();
      setShowModal(false);
    } catch (error) {
      console.error('Error cancelling appointment:', error);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Agenda</h1>
          <p className="text-gray-500">Gestión de turnos y citas</p>
        </div>
        
        {/* Connection Status & Controls */}
        <div className="flex items-center gap-4">
          {/* Source Legend */}
          <div className="flex gap-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs text-gray-600 hidden sm:inline">AI</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-600 hidden sm:inline">Manual</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span className="text-xs text-gray-600 hidden sm:inline">GCal</span>
            </div>
          </div>
          
          {/* WebSocket Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full">
            {socketConnected ? (
              <>
                <Wifi size={16} className="text-green-500" />
                <span className="text-xs text-green-600 font-medium">Conectado</span>
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-red-500" />
                <span className="text-xs text-red-600 font-medium">Desconectado</span>
              </>
            )}
          </div>
          
          {/* Sync Status */}
          <div className="flex items-center gap-2">
            {syncStatus.syncing ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 rounded-full">
                <RefreshCw size={16} className="text-yellow-600 animate-spin" />
                <span className="text-xs text-yellow-600 font-medium">Sincronizando...</span>
              </div>
            ) : syncStatus.lastSync ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
                <Cloud size={16} className="text-green-600" />
                <span className="text-xs text-green-600 font-medium">Sincronizado</span>
              </div>
            ) : null}
          </div>
          
          {/* Sync Now Button */}
          <button
            onClick={handleSyncNow}
            disabled={syncStatus.syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              syncStatus.syncing 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="Sincronizar con Google Calendar"
          >
            <Cloud size={18} />
            <span className="hidden sm:inline">Sync Now</span>
          </button>
          
          {/* Last Update */}
          {lastUpdate && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <RefreshCw size={14} />
              <span>Actualizado: {lastUpdate.toLocaleTimeString()}</span>
            </div>
          )}
          
          {/* Manual Refresh */}
          <button
            onClick={fetchData}
            className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
            title="Actualizar agenda"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow p-4">
        {loading && appointments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4 mx-auto"></div>
            <p>Cargando agenda...</p>
          </div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            events={calendarEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            height="auto"
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              meridiem: 'short',
            }}
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            eventContent={(eventInfo) => (
              <div className="p-1 text-xs overflow-hidden">
                {eventInfo.event.extendedProps.eventType === 'gcalendar_block' ? (
                  <div className="font-medium truncate text-gray-700">
                    <CloudOff size={12} className="inline mr-1" />
                    {eventInfo.event.title.replace('🔒 ', '')}
                  </div>
                ) : (
                  <>
                    <div className="font-medium truncate">{eventInfo.event.title}</div>
                    {eventInfo.event.extendedProps.professional_name && (
                      <div className="text-xs opacity-75 truncate">
                        Dr. {eventInfo.event.extendedProps.professional_name}
                      </div>
                    )}
                    {/* Source badge */}
                    <div className={`inline-flex px-1 py-0.5 rounded text-[10px] mt-0.5 ${
                      SOURCE_COLORS[eventInfo.event.extendedProps.source || 'ai']?.bgClass || 'bg-blue-100'
                    } ${SOURCE_COLORS[eventInfo.event.extendedProps.source || 'ai']?.textClass || 'text-blue-800'}`}>
                      {getSourceLabel(eventInfo.event.extendedProps.source)}
                    </div>
                  </>
                )}
              </div>
            )}
            eventDidMount={(info) => {
              // Add tooltip with full details
              const { appointment_type, patient_phone, notes, source, professional_name, eventType } = info.event.extendedProps;
              
              if (eventType === 'gcalendar_block') {
                const startDate = info.event.start;
                if (startDate) {
                  info.el.title = `🔒 ${info.event.title}\n${startDate.toLocaleString()}`;
                }
              } else {
                const tooltipContent = `
                  ${info.event.title}
                  ${source ? `\n📍 Origen: ${getSourceLabel(source)}` : ''}
                  ${patient_phone ? `\n📞 ${patient_phone}` : ''}
                  ${professional_name ? `\n👨‍⚕️ Dr. ${professional_name}` : ''}
                  ${notes ? `\n📝 ${notes}` : ''}
                `.trim();
                info.el.title = tooltipContent;
              }
            }}
          />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white rounded-t-lg">
              <h2 className="text-xl font-bold">
                {selectedEvent ? `Turno: ${selectedEvent.patient_name}` : 'Nuevo Turno'}
              </h2>
              <button onClick={() => { setShowModal(false); setCollisionWarning(null); setInsuranceStatus(null); }} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            {/* Collision Warning */}
            {collisionWarning?.hasCollision && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="text-red-600" size={18} />
                  <span className="text-sm font-medium text-red-800">Conflicto de horario</span>
                </div>
                <p className="text-sm text-red-700">{collisionWarning.message}</p>
              </div>
            )}

            {/* Insurance Status Warning */}
            {insuranceStatus && (insuranceStatus.status === 'warning' || insuranceStatus.status === 'expired' || insuranceStatus.requires_token) && (
              <div className="m-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="text-yellow-600" size={18} />
                  <span className="text-sm font-medium text-yellow-800">
                    {insuranceStatus.status === 'expired' ? 'Credencial Vencida' : 
                     insuranceStatus.status === 'warning' ? 'Credencial Próxima a Vencer' : 
                     'Validación Requerida'}
                  </span>
                </div>
                <p className="text-sm text-yellow-700">{insuranceStatus.message}</p>
                {insuranceStatus.requires_token && (
                  <p className="text-xs text-yellow-600 mt-1">⚠️ Requiere validación de Token OSDE</p>
                )}
              </div>
            )}

            {selectedEvent ? (
              // View/Edit existing appointment
              <div className="p-4">
                {/* Source Badge */}
                <div className="mb-4">
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm ${
                    SOURCE_COLORS[selectedEvent.source || 'ai']?.bgClass || 'bg-blue-100'
                  } ${SOURCE_COLORS[selectedEvent.source || 'ai']?.textClass || 'text-blue-800'}`}>
                    Origen: {getSourceLabel(selectedEvent.source)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <User className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Paciente</p>
                      <span className="font-medium">{selectedEvent.patient_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Teléfono</p>
                      <span className="font-medium">{selectedEvent.patient_phone || 'No disponible'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Stethoscope className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Profesional</p>
                      <span className="font-medium">Dr. {selectedEvent.professional_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="text-gray-400" size={20} />
                    <div>
                      <p className="text-xs text-gray-500">Fecha y Hora</p>
                      <span className="font-medium">
                        {new Date(selectedEvent.appointment_datetime).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="text-gray-400" size={20} />
                  <div>
                    <p className="text-xs text-gray-500">Tipo de Turno</p>
                    <span className="font-medium capitalize">{selectedEvent.appointment_type}</span>
                  </div>
                </div>

                {selectedEvent.notes && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="text-yellow-600" size={16} />
                      <span className="text-sm font-medium text-yellow-800">Notas</span>
                    </div>
                    <p className="text-sm text-yellow-700">{selectedEvent.notes}</p>
                  </div>
                )}

                {/* Status Badge */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Estado Actual</p>
                  <div className={`inline-flex px-3 py-1 rounded-full text-sm capitalize ${
                    STATUS_UI_COLORS[selectedEvent.status]?.bg || STATUS_UI_COLORS.scheduled.bg
                  }`}>
                    {selectedEvent.status?.replace('_', ' ')}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Cambiar Estado:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(STATUS_UI_COLORS).map(([status, colors]) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`px-3 py-1 rounded-full text-sm capitalize border transition-all ${
                          selectedEvent.status === status 
                            ? `${colors.bg} ${colors.border} ring-2 ring-offset-2 ring-primary` 
                            : `${colors.bg} ${colors.border} hover:opacity-80`
                        }`}
                      >
                        {status.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 flex items-center gap-2"
                  >
                    <AlertTriangle size={18} />
                    Cancelar Turno
                  </button>
                  <button
                    onClick={() => { setShowModal(false); setCollisionWarning(null); setInsuranceStatus(null); }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              // Create new appointment
              <form onSubmit={handleSubmit} className="p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.appointment_datetime}
                    onChange={(e) => handleDateTimeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Paciente *</label>
                    <select
                      required
                      value={formData.patient_id}
                      onChange={(e) => {
                        setFormData({ ...formData, patient_id: e.target.value });
                        checkInsuranceStatus(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Seleccionar paciente</option>
                      {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {patient.first_name} {patient.last_name} ({patient.phone_number})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Profesional *</label>
                    <select
                      required
                      value={formData.professional_id}
                      onChange={(e) => handleProfessionalChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Seleccionar profesional</option>
                      {professionals.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          Dr. {prof.first_name} {prof.last_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Turno *</label>
                  <select
                    required
                    value={formData.appointment_type}
                    onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="checkup">Control/Checkup</option>
                    <option value="cleaning">Limpieza</option>
                    <option value="extraction">Extracción</option>
                    <option value="restoration">Restauración</option>
                    <option value="orthodontics">Ortodoncia</option>
                    <option value="emergency">Urgencia</option>
                    <option value="consultation">Consulta</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Observaciones del turno..."
                  />
                </div>

                {/* Source indicator for new appointment */}
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={18} />
                    <span className="text-sm font-medium text-green-800">Turno Manual</span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    Este turno será marcado como creado manualmente (verde)
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setCollisionWarning(null); }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 text-white rounded-lg hover:flex items-center gap-2 ${
                      collisionWarning?.hasCollision 
                        ? 'bg-yellow-600 hover:bg-yellow-700'
                        : 'bg-primary hover:bg-primary-dark'
                    }`}
                  >
                    <Calendar size={18} />
                    {collisionWarning?.hasCollision ? 'Agendar Igualmente' : 'Agendar Turno'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
