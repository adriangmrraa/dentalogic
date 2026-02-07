import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  BarChart3,
  Home,
  Clock,
  ShieldCheck,
  LogOut,
  User,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onCloseMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} />, path: '/', roles: ['ceo', 'professional', 'secretary'] },
    { id: 'agenda', label: 'Agenda', icon: <Calendar size={20} />, path: '/agenda', roles: ['ceo', 'professional', 'secretary'] },
    { id: 'patients', label: 'Pacientes', icon: <Users size={20} />, path: '/pacientes', roles: ['ceo', 'professional', 'secretary'] },
    { id: 'chats', label: 'Conversaciones', icon: <MessageSquare size={20} />, path: '/chats', roles: ['ceo', 'professional', 'secretary'] },
    { id: 'approvals', label: 'Personal', icon: <ShieldCheck size={20} />, path: '/aprobaciones', roles: ['ceo'] },
    { id: 'professionals', label: 'Profesionales', icon: <Stethoscope size={20} />, path: '/profesionales', roles: ['ceo', 'secretary'] },
    { id: 'analytics', label: 'Estrategia', icon: <BarChart3 size={20} />, path: '/analytics/professionals', roles: ['ceo'] },
    { id: 'treatments', label: 'Tratamientos', icon: <Clock size={20} />, path: '/tratamientos', roles: ['ceo', 'secretary'] },
    { id: 'profile', label: 'Mi Perfil', icon: <User size={20} />, path: '/perfil', roles: ['ceo', 'professional', 'secretary'] },
    { id: 'settings', label: 'Configuración', icon: <Settings size={20} />, path: '/configuracion', roles: ['ceo'] },
  ];

  const filteredItems = menuItems.filter(item => user && item.roles.includes(user.role));

  const isActive = (path: string) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname === path;
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-medical-900 text-white transition-all duration-300 z-50 ${collapsed ? 'w-16' : 'w-64'
        }`}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center ${collapsed ? 'justify-center' : 'px-6'} border-b border-medical-800`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <Stethoscope size={18} className="text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-lg">Dental Clinic</span>
          )}
        </div>

        {/* Mobile Close Button */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-2 text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* Toggle Button (Desktop only) */}
      <button
        onClick={onToggle}
        className={`hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white rounded-full shadow-lg items-center justify-center text-medical-900 hover:bg-gray-100 transition-colors ${collapsed ? 'left-1/2 -translate-x-1/2' : ''
          }`}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Navigation */}
      <nav className={`py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              navigate(item.path);
              onCloseMobile?.();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mb-1 ${isActive(item.path)
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {(!collapsed || onCloseMobile) && <span className="font-medium text-sm">{item.label}</span>}
          </button>
        ))}

        <button
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-4 text-red-400 hover:bg-red-500/10`}
          title={collapsed ? 'Cerrar Sesión' : undefined}
        >
          <LogOut size={20} />
          {!collapsed && <span className="font-medium text-sm">Cerrar Sesión</span>}
        </button>
      </nav>

      {/* Tenant Info at Bottom */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-medical-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-medical-600 flex items-center justify-center text-xs font-medium uppercase">
              {user?.email?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-gray-400 truncate uppercase">{user?.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
