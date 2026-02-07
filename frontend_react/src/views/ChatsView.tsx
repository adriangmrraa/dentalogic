import { useState, useEffect, useRef } from 'react';
import {
  MessageCircle, Send, Calendar, User, Activity,
  Pause, Play, AlertCircle, Clock, ChevronLeft,
  Search, XCircle, Bell, Volume2, VolumeX
} from 'lucide-react';
import api, { BACKEND_URL } from '../api/axios';
import { io, Socket } from 'socket.io-client';

// ============================================
// INTERFACES
// ============================================

interface ChatSession {
  phone_number: string;
  patient_id?: number;
  patient_name?: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
  status: 'active' | 'human_handling' | 'paused' | 'silenced';
  human_override_until?: string;
  urgency_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  last_derivhumano_at?: string;
  is_window_open?: boolean;
  last_user_message_time?: string;
}

interface ChatMessage {
  id: number;
  from_number: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  is_derivhumano?: boolean;
}

interface PatientContext {
  patient_id?: number;
  patient_name?: string;
  urgency_level?: 'normal' | 'high' | 'emergency' | 'low';
  urgency_reason?: string;
  last_appointment?: {
    date: string;
    type: string;
    professional_name: string;
  };
  upcoming_appointment?: {
    date: string;
    type: string;
    professional_name: string;
  };
  treatment_plan?: any;
  diagnosis?: string;
}

interface Toast {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
}

// ============================================

export default function ChatsView() {
  // Estados principales
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de UI
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showToast, setShowToast] = useState<Toast | null>(null);
  const [highlightedSession, setHighlightedSession] = useState<string | null>(null);
  const [showMobileContext, setShowMobileContext] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ============================================
  // WEBSOCKET - CONEXIÓN EN TIEMPO REAL
  // ============================================

  useEffect(() => {
    // Conectar al WebSocket
    socketRef.current = io(BACKEND_URL);

    // Evento: Nueva derivación humana (derivhumano)
    socketRef.current.on('HUMAN_HANDOFF', (data: { phone_number: string; reason: string }) => {
      setSessions(prev => prev.map(s =>
        s.phone_number === data.phone_number
          ? {
            ...s,
            status: 'human_handling' as const,
            human_override_until: new Date(Date.now() + 86400000).toISOString(),
            last_derivhumano_at: new Date().toISOString()
          }
          : s
      ));

      // Resaltar el chat en la lista
      setHighlightedSession(data.phone_number);
      setTimeout(() => setHighlightedSession(null), 5000);

      // Mostrar toast
      setShowToast({
        id: Date.now().toString(),
        type: 'warning',
        title: '🔔 Derivación Humana',
        message: `El bot derivó a ${data.phone_number}: ${data.reason}`,
      });

      // Reproducir sonido
      if (soundEnabled) {
        playNotificationSound();
      }
    });

    // Evento: Nuevo mensaje en chat
    socketRef.current.on('NEW_MESSAGE', (data: { phone_number: string; message: string; role: string }) => {
      setSessions(prev => {
        const updatedSessions = prev.map(s =>
          s.phone_number === data.phone_number
            ? {
              ...s,
              last_message: data.message,
              last_message_time: new Date().toISOString(),
              unread_count: s.phone_number === selectedSession?.phone_number ? 0 : s.unread_count + 1,
              is_window_open: data.role === 'user' ? true : s.is_window_open
            }
            : s
        );

        // Re-ordenar: último mensaje arriba
        const sortedSessions = [...updatedSessions].sort((a, b) => {
          const timeA = new Date(a.last_message_time || 0).getTime();
          const timeB = new Date(b.last_message_time || 0).getTime();
          return timeB - timeA;
        });

        // Si la sesión seleccionada recibió un mensaje, actualizarla para refrescar la UI (banner/input)
        if (data.phone_number === selectedSession?.phone_number) {
          const current = sortedSessions.find(s => s.phone_number === data.phone_number);
          if (current) {
            setSelectedSession(current);
          }
        }

        return sortedSessions;
      });

      // Si es del chat seleccionado, agregar mensaje si no existe
      if (data.phone_number === selectedSession?.phone_number) {
        setMessages(prev => {
          // Evitar duplicados (chequeo simple por contenido y timestamp reciente o id si viniera)
          const isDuplicate = prev.some(m =>
            m.role === data.role &&
            m.content === data.message &&
            new Date(m.created_at).getTime() > Date.now() - 5000
          );

          if (isDuplicate) return prev;

          return [...prev, {
            id: Date.now(), // ID temporal
            role: data.role as 'user' | 'assistant' | 'system',
            content: data.message,
            created_at: new Date().toISOString(),
            from_number: data.phone_number
          }];
        });
      }
    });

    // Evento: Estado de override cambiado
    socketRef.current.on('HUMAN_OVERRIDE_CHANGED', (data: { phone_number: string; enabled: boolean; until?: string }) => {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.phone_number === data.phone_number
            ? {
              ...s,
              status: data.enabled ? 'silenced' as const : 'active' as const,
              human_override_until: data.until
            }
            : s
        );

        // Sincronizar selectedSession si es el actual
        if (selectedSession?.phone_number === data.phone_number) {
          const current = updated.find(s => s.phone_number === data.phone_number);
          if (current) setSelectedSession(current);
        }

        return updated;
      });
    });

    // Evento: Chat seleccionado actualizado (para sincronización)
    socketRef.current.on('CHAT_UPDATED', (data: Partial<ChatSession> & { phone_number: string }) => {
      setSessions(prev => {
        const updated = prev.map(s =>
          s.phone_number === data.phone_number ? { ...s, ...data } : s
        );

        // Sincronizar selectedSession si es el actual
        if (selectedSession?.phone_number === data.phone_number) {
          const current = updated.find(s => s.phone_number === data.phone_number);
          if (current) setSelectedSession(current);
        }

        return updated;
      });
    });

    // Evento: Paciente actualizado (urgencia, etc)
    socketRef.current.on('PATIENT_UPDATED', (data: { phone_number: string; urgency_level: string }) => {
      if (selectedSession?.phone_number === data.phone_number) {
        fetchPatientContext(data.phone_number);
      }

      setSessions(prev => prev.map(s =>
        s.phone_number === data.phone_number
          ? { ...s, urgency_level: data.urgency_level as any }
          : s
      ));
    });

    // Evento: Nuevo turno agendado (refrescar contexto)
    socketRef.current.on('NEW_APPOINTMENT', (data: { phone_number: string }) => {
      if (selectedSession?.phone_number === data.phone_number) {
        fetchPatientContext(data.phone_number);
      }

      // Mostrar toast si el turno es nuevo
      setShowToast({
        id: Date.now().toString(),
        type: 'success',
        title: '📅 Nuevo Turno',
        message: `Se agendó un turno para ${data.phone_number}`,
      });
    });

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [selectedSession, soundEnabled]);

  // ============================================
  // DATOS - CARGAR SESIONES Y MENSAJES
  // ============================================

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.phone_number);
      fetchPatientContext(selectedSession.phone_number);
      // Marcar como leído
      markAsRead(selectedSession.phone_number);
    }
  }, [selectedSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ============================================
  // FUNCIONES DE DATOS
  // ============================================

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/chat/sessions');
      setSessions(response.data);

      // Deep Link Logic: Si venimos de notificación
      const navState = (window as any).history.state as { selectPhone?: string } | null;
      if (navState?.selectPhone) {
        const targetPhone = navState.selectPhone;
        const targetSession = response.data.find((s: ChatSession) => s.phone_number === targetPhone);
        if (targetSession) {
          setSelectedSession(targetSession);
          // Limpiar state para evitar re-selección futura
          window.history.replaceState({}, document.title);
        }
      }

    } catch (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
      setShowToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error de Conexión',
        message: 'No se pudieron cargar las conversaciones. Verificá la conexión con el servidor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (phone: string) => {
    try {
      const response = await api.get(`/admin/chat/messages/${phone}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    }
  };

  const fetchPatientContext = async (phone: string) => {
    try {
      const response = await api.get(`/admin/patients/phone/${phone}/context`);
      setPatientContext(response.data);
    } catch (error) {
      console.error('Error fetching patient context:', error);
      setPatientContext(null);
    }
  };

  const markAsRead = async (phone: string) => {
    try {
      await api.put(`/admin/chat/sessions/${phone}/read`);
      setSessions(prev => prev.map(s =>
        s.phone_number === phone ? { ...s, unread_count: 0 } : s
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // ============================================
  // ACCIONES
  // ============================================

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedSession) return;

    setSending(true);
    try {
      await api.post('/admin/chat/send', {
        phone: selectedSession.phone_number,
        message: newMessage,
      });
      setNewMessage('');
      fetchMessages(selectedSession.phone_number);

      // Emitir evento de mensaje manual
      socketRef.current?.emit('MANUAL_MESSAGE', {
        phone: selectedSession.phone_number,
        message: newMessage,
      });
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleToggleHumanMode = async () => {
    if (!selectedSession) return;

    const isCurrentlyHandled = selectedSession.status === 'human_handling' || selectedSession.status === 'silenced';
    const activate = !isCurrentlyHandled;

    try {
      await api.post('/admin/chat/human-intervention', {
        phone: selectedSession.phone_number,
        activate,
        duration: 24 * 60 * 60 * 1000, // 24 horas
      });

      // Actualización local inmediata para respuesta instantánea
      const until = activate ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;
      const updatedStatus = activate ? 'silenced' as const : 'active' as const;

      const updateFn = (s: ChatSession) => s.phone_number === selectedSession.phone_number
        ? { ...s, status: updatedStatus, human_override_until: until }
        : s;

      setSessions(prev => prev.map(updateFn));
      setSelectedSession(prev => prev ? updateFn(prev) : null);

      // El evento socket redundante HUMAN_OVERRIDE_TOGGLE ya es manejado por el backend emitiendo HUMAN_OVERRIDE_CHANGED
    } catch (error) {
      console.error('Error toggling human mode:', error);
    }
  };

  const handleRemoveSilence = async () => {
    if (!selectedSession || !selectedSession.human_override_until) return;

    try {
      await api.post('/admin/chat/remove-silence', {
        phone: selectedSession.phone_number,
      });

      // Actualización local inmediata
      const updateFn = (s: ChatSession) => s.phone_number === selectedSession.phone_number
        ? { ...s, status: 'active' as const, human_override_until: undefined, last_derivhumano_at: undefined }
        : s;

      setSessions(prev => prev.map(updateFn));
      setSelectedSession(prev => prev ? updateFn(prev) : null);
    } catch (error) {
      console.error('Error removing silence:', error);
    }
  };

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => { });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ============================================
  // UTILIDADES
  // ============================================

  const filteredSessions = sessions.filter(session =>
    session.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.phone_number.includes(searchTerm)
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString();
  };

  const getStatusConfig = (session: ChatSession) => {
    if (session.status === 'human_handling' || session.status === 'silenced') {
      return {
        badge: (
          <span className="flex items-center gap-1 text-xs font-medium">
            {session.status === 'silenced' ? (
              <VolumeX size={12} className="text-red-500" />
            ) : (
              <User size={12} className="text-orange-500" />
            )}
            {session.status === 'silenced' ? 'Silenciado' : 'Manual'}
          </span>
        ),
        avatarBg: session.urgency_level === 'HIGH' || session.urgency_level === 'CRITICAL'
          ? 'bg-red-500 animate-pulse'
          : 'bg-orange-500',
        cardBorder: session.last_derivhumano_at ? 'border-l-4 border-orange-500' : '',
      };
    }
    return {
      badge: (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Activity size={12} /> IA Activa
        </span>
      ),
      avatarBg: 'bg-primary',
      cardBorder: '',
    };
  };


  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="h-[calc(100vh-64px)] lg:h-[calc(100vh-100px)] flex relative overflow-hidden">
      {/* Audio para notificaciones */}
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* ======================================== */}
      {/* TOAST DE DERIVACIÓN HUMANA */}
      {/* ======================================== */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div className="bg-orange-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <Bell className="w-5 h-5" />
            <div>
              <p className="font-semibold">{showToast.title}</p>
              <p className="text-sm opacity-90">{showToast.message}</p>
            </div>
            <button
              onClick={() => setShowToast(null)}
              className="ml-4 hover:opacity-80"
            >
              <XCircle size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Chat List */}
      <div className={`
        ${selectedSession ? 'hidden lg:flex' : 'flex'} 
        w-full lg:w-80 border-r bg-white flex-col
      `}>
        <div className="p-4 border-b">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Conversaciones</h2>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg hover:bg-gray-100"
              title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Cargando...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No hay conversaciones</div>
          ) : (
            filteredSessions.map(session => {
              const { avatarBg } = getStatusConfig(session);
              const isHighlighted = highlightedSession === session.phone_number;
              const isSelected = selectedSession?.phone_number === session.phone_number;

              return (
                <div
                  key={session.phone_number}
                  onClick={() => setSelectedSession(session)}
                  className={`px-4 py-3 border-b cursor-pointer transition-all relative
                    ${isSelected ? 'bg-medical-50' : 'hover:bg-gray-50 active:bg-gray-100'}
                    ${isHighlighted ? 'bg-orange-50 animate-pulse' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar with Status Ring */}
                    <div className="relative shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm ${avatarBg}`}>
                        {(session.patient_name || session.phone_number).charAt(0)}
                      </div>
                      {session.status === 'human_handling' && (
                        <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-sm">
                          <User size={12} className="text-orange-500 fill-orange-500" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className={`font-semibold truncate ${isSelected ? 'text-medical-900' : 'text-gray-900'}`}>
                          {session.patient_name || session.phone_number}
                        </span>
                        <span className={`text-[11px] shrink-0 ml-2 ${session.unread_count > 0 ? 'text-medical-600 font-bold' : 'text-gray-400'}`}>
                          {formatTime(session.last_message_time)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <p className={`text-sm truncate pr-4 ${session.unread_count > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                          {session.last_message || 'Sin mensajes'}
                        </p>
                        {session.unread_count > 0 && (
                          <span className="bg-medical-600 text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
                            {session.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Floating Urgency Indicator for Mobile */}
                  <div className="absolute top-3 right-4 lg:hidden">
                    {session.urgency_level === 'CRITICAL' && (
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Detail */}
      {selectedSession ? (
        <>
          <div className="flex-1 flex flex-col min-w-0 bg-gray-50 h-full">
            {/* Messages */}
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="p-4 border-b bg-white flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => {
                      setSelectedSession(null);
                      setShowMobileContext(false);
                    }}
                    className="lg:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-600 active:bg-gray-200 transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <div
                    onClick={() => window.innerWidth < 1280 && setShowMobileContext(!showMobileContext)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 cursor-pointer ${selectedSession.status === 'human_handling' || selectedSession.status === 'silenced'
                      ? 'bg-orange-500'
                      : 'bg-medical-600'
                      }`}
                  >
                    {(selectedSession.patient_name || selectedSession.phone_number).charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => window.innerWidth < 1280 && setShowMobileContext(!showMobileContext)}>
                    <h3 className="font-bold text-gray-900 truncate leading-tight">
                      {selectedSession.patient_name || 'Sin nombre'}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">{selectedSession.phone_number}</p>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => setShowMobileContext(!showMobileContext)}
                    className="p-2 text-medical-600 hover:bg-medical-50 rounded-full lg:hidden transition-colors"
                    title="Ver ficha clínica"
                  >
                    <Activity size={20} />
                  </button>

                  <button
                    onClick={handleToggleHumanMode}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm
                      ${selectedSession.status === 'human_handling' || selectedSession.status === 'silenced'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200'
                      }`}
                  >
                    {selectedSession.status === 'human_handling' || selectedSession.status === 'silenced' ? (
                      <><Play size={14} className="fill-current" /> <span className="hidden sm:inline">Activar IA</span></>
                    ) : (
                      <><Pause size={14} className="fill-current" /> <span className="hidden sm:inline">Manual</span></>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Alert Banner para derivhumano */}
            {selectedSession.last_derivhumano_at ? (
              <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center gap-2">
                <AlertCircle size={16} className="text-orange-500" />
                <span className="text-sm text-orange-700">
                  ⚠️ Derivación Automática: El bot derivó este chat a las {new Date(selectedSession.last_derivhumano_at).toLocaleTimeString()}
                </span>
                <button
                  onClick={handleRemoveSilence}
                  className="ml-auto text-xs text-orange-600 hover:underline"
                >
                  Quitar silencio
                </button>
              </div>
            ) : (selectedSession.status === 'silenced' || selectedSession.status === 'human_handling') && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2">
                <Pause size={16} className="text-blue-500" />
                <span className="text-sm text-blue-700">
                  ✋ Modo Manual Activo. El asistente no responderá.
                </span>
                <button
                  onClick={handleToggleHumanMode}
                  className="ml-auto text-xs text-blue-600 hover:underline"
                >
                  Activar IA
                </button>
              </div>
            )}

            {/* Banner de Ventana de 24hs Cerrada */}
            {selectedSession.is_window_open === false && (
              <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2">
                <Clock size={16} className="text-yellow-600" />
                <span className="text-sm text-yellow-700">
                  ⏳ <strong>Ventana de 24hs cerrada:</strong> No puedes enviar mensajes manuales hasta que el paciente te escriba de nuevo.
                </span>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 ${message.role === 'user'
                      ? 'bg-white shadow-sm'
                      : message.is_derivhumano
                        ? 'bg-orange-100 border border-orange-300 shadow-sm text-gray-800'
                        : 'bg-blue-600 text-white shadow-sm'
                      }`}
                  >
                    {message.is_derivhumano && (
                      <div className="flex items-center gap-1 text-xs text-orange-600 mb-1">
                        <User size={12} />
                        <span className="font-medium">Derivación automática</span>
                      </div>
                    )}
                    <p className="text-sm">{message.content}</p>
                    <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-gray-400' : 'text-blue-200'
                      }`}>
                      {new Date(message.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={selectedSession.is_window_open === false ? "Ventana cerrada - Esperando paciente..." : "Escribe un mensaje..."}
                  disabled={selectedSession.is_window_open === false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e as any);
                    }
                  }}
                  className={`flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-500 bg-white text-gray-900 ${selectedSession.is_window_open === false ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim() || selectedSession.is_window_open === false}
                  className="p-2 bg-medical-600 text-white rounded-lg hover:bg-medical-700 disabled:opacity-50 flex items-center justify-center transition-colors min-w-[44px]"
                  title={selectedSession.is_window_open === false ? "Ventana de 24hs cerrada" : "Enviar mensaje"}
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>

          {/* Clinical Context Panel - WhatsApp Style Overlay on Mobile / Sidebar on Desktop */}
          <div className={`
            ${showMobileContext ? 'flex' : 'hidden'} 
            xl:flex flex-col
            fixed inset-0 z-40 bg-white 
            xl:relative xl:z-0 xl:w-80 xl:border-l xl:inset-auto
            animate-slide-in xl:animate-none
          `}>
            {/* Context Header (Mobile only) */}
            <div className="p-4 border-b flex justify-between items-center xl:hidden">
              <div className="flex items-center gap-2">
                <User className="text-medical-600" size={20} />
                <h3 className="font-bold">Perfil del Paciente</h3>
              </div>
              <button
                onClick={() => setShowMobileContext(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <ChevronLeft size={24} className="rotate-180" />
              </button>
            </div>

            {/* Desktop Context Header */}
            <div className="hidden xl:flex p-4 border-b items-center gap-2">
              <Activity size={18} className="text-primary" />
              <h3 className="font-medium">Contexto Clínico</h3>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* AI Status */}
              <div className={`p-3 rounded-lg ${selectedSession.status === 'human_handling' || selectedSession.status === 'silenced'
                ? 'bg-orange-50 border border-orange-200'
                : 'bg-green-50 border border-green-200'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  {selectedSession.status === 'human_handling' || selectedSession.status === 'silenced' ? (
                    <User size={16} className="text-orange-600" />
                  ) : (
                    <Activity size={16} className="text-green-600" />
                  )}
                  <span className="font-medium text-sm">
                    Estado del Bot
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {selectedSession.status === 'human_handling'
                    ? 'Atendido por persona'
                    : selectedSession.status === 'silenced'
                      ? 'Silenciado (24h override)'
                      : 'IA activa'}
                </p>
                {selectedSession.human_override_until && (
                  <p className="text-xs text-gray-500 mt-1">
                    Hasta: {new Date(selectedSession.human_override_until).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Patient Info */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500 mb-2">PACIENTE</h4>
                <p className="font-medium">{patientContext?.patient_name || selectedSession.patient_name}</p>
                <p className="text-sm text-gray-500">{selectedSession.phone_number}</p>
              </div>

              {/* Last Appointment */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <Calendar size={12} /> ÚLTIMA CITA
                </h4>
                {patientContext?.last_appointment ? (
                  <div>
                    <p className="text-sm">{patientContext.last_appointment.type}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(patientContext.last_appointment.date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      Dr. {patientContext.last_appointment.professional_name}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sin citas previas</p>
                )}
              </div>

              {/* Upcoming Appointment */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <Clock size={12} /> PRÓXIMA CITA
                </h4>
                {patientContext?.upcoming_appointment ? (
                  <div>
                    <p className="text-sm">{patientContext.upcoming_appointment.type}</p>
                    <p className="text-xs text-primary">
                      {new Date(patientContext.upcoming_appointment.date).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      Dr. {patientContext.upcoming_appointment.professional_name}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sin citas programadas</p>
                )}
              </div>

              {/* Treatment Plan */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-medium text-gray-500 mb-2">TRATAMIENTO ACTUAL</h4>
                {patientContext?.treatment_plan ? (
                  <div className="text-sm">
                    {typeof patientContext.treatment_plan === 'string'
                      ? patientContext.treatment_plan
                      : JSON.stringify(patientContext.treatment_plan, null, 2)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sin plan de tratamiento</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-gray-50 flex-col gap-4">
          <MessageCircle size={64} className="opacity-20" />
          <p className="text-lg font-medium text-gray-400">Selecciona una conversación</p>
          <p className="text-sm text-gray-400">para comenzar a chatear</p>
        </div>
      )}

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
