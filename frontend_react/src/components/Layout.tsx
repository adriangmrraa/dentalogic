import React, { type ReactNode, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../api/axios';
import { AlertCircle, X } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);

  // Notification State
  const [notification, setNotification] = useState<{
    show: boolean;
    phone: string;
    reason: string;
  } | null>(null);

  // Global Socket Listener for Handoffs
  useEffect(() => {
    if (!user) return;

    // Conectar socket si no existe
    if (!socketRef.current) {
      socketRef.current = io(BACKEND_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        secure: true,
      });
    }

    // Listener
    // Listener
    const handleHandoff = (data: { phone_number: string; reason: string }) => {
      console.log('🔔 Global Handoff Notification:', data);

      // Mostrar notificación
      setNotification({
        show: true,
        phone: data.phone_number,
        reason: data.reason
      });

      // Auto-ocultar a los 5 segundos
      setTimeout(() => {
        setNotification(null);
      }, 5000);

      // Reproducir sonido (opcional, si el navegador lo permite)
      try {
        const audio = new Audio('/assets/notification.mp3');
        // Fallback or generic sound logic here if asset missing
        audio.play().catch(e => console.log('Audio play blocked', e));
      } catch (e) { }
    };

    socketRef.current.on('HUMAN_HANDOFF', handleHandoff);

    return () => {
      socketRef.current?.off('HUMAN_HANDOFF', handleHandoff);
      // No desconectamos el socket aquí porque Layout se monta/desmonta poco, 
      // pero si navegamos fuera de app (logout), el socket debería morir.
      // Ojo: ChatsView también crea socket. Idealmente debería ser un Context.
      // Por ahora para cumplir el requerimiento rápido, duplicamos la conexión (low cost).
    };
  }, [user]);

  const handleNotificationClick = () => {
    if (notification) {
      navigate('/chats');
      // Podríamos pasar el teléfono por estado para que ChatsView lo seleccione automático
      // navigate('/chats', { state: { selectPhone: notification.phone } });
      setNotification(null);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 relative">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <main
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'
          }`}
      >
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-medical-900">
              Sistema de Gestión Dental
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Tenant Selector */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm">
              <span className="text-gray-500">Sucursal:</span>
              <span className="font-medium text-medical-900">Principal</span>
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-medical-900">{user?.email?.split('@')[0]}</span>
                <span className="text-xs text-secondary uppercase">{user?.role}</span>
              </div>
              <div className="w-9 h-9 rounded-full bg-medical-600 flex items-center justify-center text-white font-semibold text-lg border-2 border-white shadow-sm">
                {user?.email?.[0].toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-gray-100 p-6">
          {children}
        </div>
      </main>

      {/* GLOBAL NOTIFICATION TOAST */}
      {notification && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-lg shadow-xl border-l-4 border-orange-500 p-4 transform transition-all duration-300 ease-in-out cursor-pointer hover:bg-gray-50"
          onClick={handleNotificationClick}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900">🔔 Derivación Humana</h3>
              <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                {notification.phone}: {notification.reason}
              </p>
              <div className="mt-2 text-xs text-orange-600 font-medium">
                Click para abrir chat
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setNotification(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
