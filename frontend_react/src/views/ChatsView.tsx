import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Send, Phone, Calendar, User, Activity,
  Pause, Play, AlertCircle, Clock, ChevronLeft, MoreVertical,
  Search, CheckCircle, XCircle, Bell, Volume2, VolumeX
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
  last_appointment?: {
    date: string;
    type: string;
    professional: string;
  };
  upcoming_appointment?: {
    date: string;
    type: string;
    professional: string;
  };
  treatment_plan?: string;
  last_appointment_type?: string;
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
    socketRef.current.on('DERIVHUMANO_TRIGGERED', (data: { phone_number: string; reason: string }) => {
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
      setSessions(prev => prev.map(s =>
        s.phone_number === data.phone_number
          ? {
            ...s,
            last_message: data.message,
            last_message_time: new Date().toISOString(),
            unread_count: s.phone_number === selectedSession?.phone_number ? 0 : s.unread_count + 1
          }
          : s
      ));

      // Si es del chat seleccionado, actualizar mensajes
      if (data.phone_number === selectedSession?.phone_number && data.role === 'user') {
        fetchMessages(data.phone_number);
      }
    });

    // Evento: Estado de override cambiado
    socketRef.current.on('HUMAN_OVERRIDE_CHANGED', (data: { phone_number: string; enabled: boolean; until?: string }) => {
      setSessions(prev => prev.map(s =>
        s.phone_number === data.phone_number
          ? {
            ...s,
            status: data.enabled ? 'silenced' as const : 'active' as const,
            human_override_until: data.until
          }
          : s
      ));
    });

    // Evento: Chat seleccionado actualizado (para sincronización)
    socketRef.current.on('CHAT_UPDATED', (data: Partial<ChatSession> & { phone_number: string }) => {
      setSessions(prev => prev.map(s =>
        s.phone_number === data.phone_number ? { ...s, ...data } : s
      ));
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
      fetchSessions();

      // Emitir evento
      socketRef.current?.emit('HUMAN_OVERRIDE_TOGGLE', {
        phone: selectedSession.phone_number,
        activate,
      });
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
      fetchSessions();

      socketRef.current?.emit('HUMAN_OVERRIDE_TOGGLE', {
        phone: selectedSession.phone_number,
        activate: false,
      });
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

  const getUrgencyBadge = (level?: string) => {
    if (!level) return null;

    const colors = {
      LOW: 'bg-green-100 text-green-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      HIGH: 'bg-orange-100 text-orange-800',
      CRITICAL: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[level as keyof typeof colors]}`}>
        {level}
      </span>
    );
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="h-[calc(100vh-100px)] flex relative">
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
      <div className="w-80 border-r bg-white flex flex-col">
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
              const { badge, avatarBg, cardBorder } = getStatusConfig(session);
              const isHighlighted = highlightedSession === session.phone_number;

              return (
                <div
                  key={session.phone_number}
                  onClick={() => setSelectedSession(session)}
                  className={`p-4 border-b cursor-pointer transition-all ${selectedSession?.phone_number === session.phone_number
                    ? 'bg-primary-light'
                    : 'hover:bg-gray-50'
                    } ${isHighlighted ? 'bg-orange-50 animate-pulse' : ''} ${cardBorder}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${avatarBg}`}>
                      {(session.patient_name || session.phone_number).charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {session.patient_name || 'Sin nombre'}
                          </span>
                          {getUrgencyBadge(session.urgency_level)}
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(session.last_message_time)}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{session.last_message}</p>
                      {badge}
                    </div>
                    {session.unread_count > 0 && (
                      <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {session.unread_count}
                      </span>
                    )}
                    {session.last_derivhumano_at && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <AlertCircle size={16} className="text-orange-500" />
                      </div>
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
          {/* Messages */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b bg-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedSession(null)}
                  className="lg:hidden p-2 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${selectedSession.status === 'human_handling' || selectedSession.status === 'silenced'
                  ? 'bg-orange-500'
                  : 'bg-primary'
                  }`}>
                  {(selectedSession.patient_name || selectedSession.phone_number).charAt(0)}
                </div>
                <div>
                  <h3 className="font-medium">{selectedSession.patient_name || 'Sin nombre'}</h3>
                  <p className="text-sm text-gray-500">{selectedSession.phone_number}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Mostrar estado de silencio override */}
                {selectedSession.human_override_until && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 rounded-lg text-sm">
                    <VolumeX size={14} />
                    <span>
                      Silenciado hasta {new Date(selectedSession.human_override_until).toLocaleTimeString()}
                    </span>
                  </div>
                )}

                {/* Botón de control */}
                <button
                  onClick={handleToggleHumanMode}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedSession.status === 'human_handling' || selectedSession.status === 'silenced'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}
                >
                  {selectedSession.status === 'human_handling' || selectedSession.status === 'silenced' ? (
                    <><Play size={16} /> Activar IA</>
                  ) : (
                    <><Pause size={16} /> Modo Manual</>
                  )}
                </button>
              </div>
            </div>

            {/* Alert Banner para derivhumano */}
            {selectedSession.last_derivhumano_at && (
              <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center gap-2">
                <AlertCircle size={16} className="text-orange-500" />
                <span className="text-sm text-orange-700">
                  El bot derivó este chat a las {new Date(selectedSession.last_derivhumano_at).toLocaleTimeString()}
                </span>
                <button
                  onClick={handleRemoveSilence}
                  className="ml-auto text-xs text-orange-600 hover:underline"
                >
                  Quitar silencio
                </button>
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
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>

          {/* Clinical Context Panel */}
          <div className="w-80 border-l bg-white overflow-y-auto">
            <div className="p-4 border-b">
              <h3 className="font-medium flex items-center gap-2">
                <Activity size={18} className="text-primary" />
                Contexto Clínico
              </h3>
            </div>

            <div className="p-4 space-y-4">
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
                      Dr. {patientContext.last_appointment.professional}
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
                      Dr. {patientContext.upcoming_appointment.professional}
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
                  <p className="text-sm">{patientContext.treatment_plan}</p>
                ) : (
                  <p className="text-sm text-gray-400">Sin plan de tratamiento</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageCircle size={64} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Selecciona una conversación</p>
            <p className="text-sm mt-1">para ver los mensajes</p>
          </div>
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
