import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  FileText,
  BarChart3,
  Home,
  Clock
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} />, path: '/' },
    { id: 'agenda', label: 'Agenda', icon: <Calendar size={20} />, path: '/agenda' },
    { id: 'patients', label: 'Pacientes', icon: <Users size={20} />, path: '/patients' },
    { id: 'chats', label: 'Conversaciones', icon: <MessageSquare size={20} />, path: '/chats' },
    { id: 'professionals', label: 'Profesionales', icon: <Stethoscope size={20} />, path: '/professionals' },
    { id: 'treatments', label: 'Tratamientos', icon: <Clock size={20} />, path: '/treatments' },
    { id: 'logs', label: 'Historial', icon: <FileText size={20} />, path: '/logs' },
    { id: 'analytics', label: 'Reportes', icon: <BarChart3 size={20} />, path: '/analytics' },
    { id: 'settings', label: 'Configuración', icon: <Settings size={20} />, path: '/setup' },
  ];

  const isActive = (path: string) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname === path;
  };

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen bg-medical-900 text-white transition-all duration-300 z-50 ${
        collapsed ? 'w-16' : 'w-64'
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
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={`absolute -right-3 top-20 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center text-medical-900 hover:bg-gray-100 transition-colors ${
          collapsed ? 'left-1/2 -translate-x-1/2' : ''
        }`}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Navigation */}
      <nav className={`py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mb-1 ${
              isActive(item.path)
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
            title={collapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Tenant Info at Bottom */}
      {!collapsed && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-medical-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-medical-600 flex items-center justify-center text-xs font-medium">
              N
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Nexus Dental</p>
              <p className="text-xs text-gray-400 truncate">Plan Premium</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
