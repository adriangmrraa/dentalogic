import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, AlertCircle, CheckCircle,
  XCircle, Bell, BellOff, ShieldAlert,
  Users, Calendar, MessageSquare, TrendingUp, Clock, Plus
} from 'lucide-react';
import api, { BACKEND_URL } from '../api/axios';

// ============================================
// INTERFACES
// ============================================

interface TriageNotification {
  id: string;
  patient_id: number;
  patient_name: string;
  phone_number: string;
  urgency_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  symptoms: string[];
  message_preview: string;
  timestamp: string;
  read: boolean;
}

interface DashboardStats {
  today_appointments: number;
  pending_confirmations: number;
  high_urgency_alerts: number;
  total_patients: number;
  messages_today: number;
  completed_today: number;
}

interface Toast {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
}

interface TimeSlot {
  slot_start: string;
  slot_end: string;
  duration_minutes: number;
  professional_id: number;
  professional_name: string;
}

// ============================================

export default function DashboardView() {
  const navigate = useNavigate();

  // Estado de alertas de triaje
  const [notifications, setNotifications] = useState<TriageNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Estado de slots disponibles (Smart Availability Widget)
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);

  // Estado del bot
  const [botEnabled, setBotEnabled] = useState(true);
  const [botStatus, setBotStatus] = useState<'connected' | 'disconnected' | 'paused'>('connected');

  // Estado de estadísticas
  const [stats, setStats] = useState<DashboardStats>({
    today_appointments: 0,
    pending_confirmations: 0,
    high_urgency_alerts: 0,
    total_patients: 0,
    messages_today: 0,
    completed_today: 0,
  });

  // Estado de toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showToastContainer, setShowToastContainer] = useState(true);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const toastsRef = useRef<HTMLDivElement>(null);

  // ============================================
  // FUNCIONES DE TOAST
  // ============================================

  const addToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const newToast: Toast = {
      id: Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date(),
    };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after 8 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 8000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'warning':
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Activity className="w-5 h-5 text-blue-500" />;
    }
  };

  // ============================================
  // WEBSOCKET - CONEXIÓN DE TRIAGE
  // ============================================

  useEffect(() => {
    // Conectar al WebSocket
    socketRef.current = io(BACKEND_URL);

    // Evento: Nueva alerta de triaje de alta urgencia
    socketRef.current.on('HIGH_URGENCY_TRIAGE', (data: TriageNotification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Mostrar toast de urgencia alta
      addToast('warning', 'URGENCIA ALTA', `${data.patient_name}: ${data.symptoms.slice(0, 2).join(', ')}`);

      // Actualizar contador de alertas
      setStats(prev => ({ ...prev, high_urgency_alerts: prev.high_urgency_alerts + 1 }));
    });

    // Evento: Nueva alerta crítica
    socketRef.current.on('CRITICAL_TRIAGE', (data: TriageNotification) => {
      setNotifications(prev => [data, ...prev]);
      setUnreadCount(prev => prev + 1);

      // Mostrar toast crítico (más persistente)
      addToast('error', 'CRITICO', `${data.patient_name} requiere atención inmediata`);

      setStats(prev => ({ ...prev, high_urgency_alerts: prev.high_urgency_alerts + 1 }));
    });

    // Evento: Notificación general
    socketRef.current.on('NEW_APPOINTMENT', (data: any) => {
      addToast('info', 'Nuevo Turno', `Turno programado para ${data.patient_name}`);
    });

    // Evento: Estado del bot actualizado
    socketRef.current.on('BOT_STATUS_CHANGED', (data: { enabled: boolean; status: string }) => {
      setBotEnabled(data.enabled);
      setBotStatus(data.status as 'connected' | 'disconnected' | 'paused');
      addToast(
        data.enabled ? 'success' : 'warning',
        data.enabled ? 'Bot Activado' : 'Bot Pausado',
        data.enabled ? 'El agente de IA puede responder mensajes' : 'El bot esta pausado manualmente'
      );
    });

    // Limpieza al desmontar
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [addToast]);

  // ============================================
  // DATOS - CARGAR ESTADÍSTICAS
  // ============================================

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsRes, notificationsRes] = await Promise.all([
          api.get('/admin/dashboard/stats'),
          api.get('/admin/triage/notifications'),
        ]);

        if (statsRes.data) {
          setStats(prev => ({
            ...prev,
            ...statsRes.data,
            high_urgency_alerts: notificationsRes.data.filter((n: TriageNotification) =>
              n.urgency_level === 'HIGH' || n.urgency_level === 'CRITICAL'
            ).length,
          }));
        }

        if (notificationsRes.data) {
          setNotifications(notificationsRes.data);
          setUnreadCount(notificationsRes.data.filter((n: TriageNotification) => !n.read).length);
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        // Datos de prueba para desarrollo
        setStats({
          today_appointments: 12,
          pending_confirmations: 5,
          high_urgency_alerts: 2,
          total_patients: 156,
          messages_today: 47,
          completed_today: 8,
        });
      }
    };

    fetchStats();

    // Refresh cada 60 segundos
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // CONTROL DEL BOT
  // ============================================

  const toggleBot = async () => {
    const newState = !botEnabled;
    setBotEnabled(newState);

    try {
      await api.put('/admin/bot/toggle', { enabled: newState });
      setBotStatus(newState ? 'connected' : 'paused');
    } catch (error) {
      console.error('Error toggling bot:', error);
      // Revertir estado si falla
      setBotEnabled(!newState);
      addToast('error', 'Error', 'No se pudo cambiar el estado del bot');
    }
  };

  // ============================================
  // MARCAR NOTIFICACIÓN COMO LEÍDA
  // ============================================

  const markAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await api.put(`/admin/triage/notifications/${id}/read`);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // ============================================
  // SMART AVAILABILITY WIDGET
  // ============================================

  const fetchAvailableSlots = useCallback(async () => {
    try {
      setLoadingSlots(true);
      const response = await api.get('/admin/appointments/next-slots', {
        params: { days_ahead: 3, slot_duration_minutes: 20 }
      });
      setAvailableSlots(response.data || []);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableSlots();

    // Refresh slots every 2 minutes
    const interval = setInterval(fetchAvailableSlots, 120000);
    return () => clearInterval(interval);
  }, [fetchAvailableSlots]);

  const handleForceOverturn = () => {
    // Navigate to agenda with quick edit mode
    navigate('/agenda?mode=quick-edit&urgency=high');
  };

  const formatSlotTime = (slotStart: string) => {
    const date = new Date(slotStart);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short'
    });
  };

  const getRelativeTime = (slotStart: string) => {
    const date = new Date(slotStart);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 0) {
      return 'Pasado';
    } else if (diffMins < 60) {
      return `En ${diffMins} min`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `En ${hours}h`;
    } else {
      return date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
    }
  };

  // ============================================
  // OBTENER COLOR DE URGENCIA
  // ============================================

  const getUrgencyColor = (level: TriageNotification['urgency_level']) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-600 text-white';
      case 'HIGH':
        return 'bg-orange-500 text-white';
      case 'MEDIUM':
        return 'bg-yellow-500 text-black';
      default:
        return 'bg-green-500 text-white';
    }
  };

  const getUrgencyIcon = (level: TriageNotification['urgency_level']) => {
    switch (level) {
      case 'CRITICAL':
        return <ShieldAlert className="w-5 h-5" />;
      case 'HIGH':
        return <AlertTriangle className="w-5 h-5" />;
      case 'MEDIUM':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <CheckCircle className="w-5 h-5" />;
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 relative">
      {/* ======================================== */}
      {/* TOAST NOTIFICATIONS */}
      {/* ======================================== */}
      {showToastContainer && (
        <div
          ref={toastsRef}
          className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm"
        >
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`
                p-4 rounded-lg shadow-lg border-l-4 animate-slide-in
                ${getToastStyles(toast.type)}
              `}
            >
              <div className="flex items-start gap-3">
                {getToastIcon(toast.type)}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{toast.title}</p>
                  <p className="text-sm mt-1 opacity-90">{toast.message}</p>
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================== */}
      {/* HEADER */}
      {/* ======================================== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Panel de control en tiempo real</p>
        </div>

        {/* Bot Control Switch */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-4 bg-white px-4 py-3 rounded-xl shadow-sm border">
          <div className="flex items-center gap-3">
            <div className={`
              w-3 h-3 rounded-full transition-colors duration-300
              ${botEnabled ? 'bg-green-500' : 'bg-red-500'}
              ${botStatus === 'paused' ? 'animate-pulse' : ''}
            `}></div>
            <span className="font-medium text-gray-700">
              Bot IA: {botEnabled ? 'Activo' : 'Pausado'}
            </span>
          </div>

          <button
            onClick={toggleBot}
            className={`
              relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300
              ${botEnabled ? 'bg-green-500' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-300
                ${botEnabled ? 'translate-x-7' : 'translate-x-1'}
              `}
            />
          </button>

          <button
            onClick={() => setShowToastContainer(!showToastContainer)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title={showToastContainer ? 'Ocultar notificaciones' : 'Mostrar notificaciones'}
          >
            {showToastContainer ? <BellOff size={20} /> : <Bell size={20} />}
          </button>
        </div>
      </div>

      {/* ======================================== */}
      {/* STATS GRID */}
      {/* ======================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Turnos Hoy</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{stats.today_appointments}</p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500 opacity-20" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>+3 vs ayer</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-yellow-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Pendientes</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{stats.pending_confirmations}</p>
            </div>
            <Activity className="w-8 h-8 text-yellow-500 opacity-20" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <span>Confirmaciones esperando</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Urgencias</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{stats.high_urgency_alerts}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500 opacity-20" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
            <span>Alertas de alta prioridad</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Mensajes Hoy</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{stats.messages_today}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-green-500 opacity-20" />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>{stats.completed_today} resueltos</span>
          </div>
        </div>
      </div>

      {/* ======================================== */}
      {/* SMART AVAILABILITY WIDGET */}
      {/* ======================================== */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-lg p-6 mb-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-bold">Disponibilidad para Urgencias</h2>
              <p className="text-white/80 text-xs lg:text-sm">Próximos huecos de 15-20 min para triage</p>
            </div>
          </div>
          <button
            onClick={fetchAvailableSlots}
            disabled={loadingSlots}
            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
            title="Refrescar"
          >
            <Clock className={`w-5 h-5 ${loadingSlots ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingSlots ? (
          <div className="flex items-center gap-2 py-4">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Buscando huecos disponibles...</span>
          </div>
        ) : availableSlots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {availableSlots.slice(0, 3).map((slot, index) => (
              <button
                key={index}
                onClick={() => navigate(`/agenda?mode=quick-edit&slot=${encodeURIComponent(slot.slot_start)}`)}
                className="bg-white/10 hover:bg-white/20 rounded-lg p-4 text-left transition-all duration-200 hover:scale-[1.02] backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{formatSlotTime(slot.slot_start)}</p>
                    <p className="text-white/80 text-sm">{slot.professional_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs bg-white/20 px-2 py-1 rounded-full">
                      {getRelativeTime(slot.slot_start)}
                    </p>
                    <p className="text-xs text-white/60 mt-1">{slot.duration_minutes} min</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="bg-white/10 rounded-lg p-6 mb-4">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium mb-2">No hay huecos disponibles</p>
              <p className="text-white/70 text-sm mb-4">
                No se encontraron espacios de 15-20 min en los próximos días
              </p>
              <button
                onClick={handleForceOverturn}
                className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-5 h-5" />
                Forzar Sobreturno
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================== */}
      {/* TRIAGE ALERTS SECTION */}
      {/* ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Notificaciones de Triaje */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <h2 className="font-semibold text-gray-800 text-sm lg:text-base">Alertas de Triaje</h2>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setNotifications([])}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpiar
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                <p>No hay alertas pendientes</p>
                <p className="text-sm mt-1">Todo esta bajo control</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={`
                      p-4 cursor-pointer transition-all duration-200 hover:bg-gray-50
                      ${notification.read ? 'opacity-60' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`
                        p-2 rounded-lg shrink-0 ${getUrgencyColor(notification.urgency_level)}
                      `}>
                        {getUrgencyIcon(notification.urgency_level)}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{notification.patient_name}</p>
                            <p className="text-sm text-gray-500">{notification.phone_number}</p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(notification.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {notification.symptoms.slice(0, 3).map((symptom, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600"
                            >
                              {symptom}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-2 italic">
                          "{notification.message_preview}"
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resumen de Actividad */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Resumen de Actividad
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-400" />
                <span className="text-gray-700">Total Pacientes</span>
              </div>
              <span className="font-semibold text-gray-800">{stats.total_patients}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span className="text-gray-700">Turnos Confirmados</span>
              </div>
              <span className="font-semibold text-green-600">
                {stats.today_appointments - stats.pending_confirmations}
              </span>
            </div>

            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-gray-400" />
                <span className="text-gray-700">Tasa de Resolucion</span>
              </div>
              <span className="font-semibold text-blue-600">
                {stats.messages_today > 0
                  ? Math.round((stats.completed_today / stats.messages_today) * 100)
                  : 0}%
              </span>
            </div>
          </div>

          {/* Estado de Servicios */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium text-gray-700 mb-3">Estado de Servicios</h3>
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                WhatsApp: OK
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                AI: OK
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                DB: OK
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================== */}
      {/* CSS for animations */}
      {/* ======================================== */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
