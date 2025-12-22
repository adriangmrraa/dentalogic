import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Settings,
    Store,
    ScrollText,
    BarChart2,
    Key,
    Smartphone,
    MessageCircle,
    Wrench
} from 'lucide-react';

export const Sidebar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        { id: 'overview', label: 'Panel General', icon: <LayoutDashboard size={20} />, path: '/' },
        { id: 'setup', label: 'Configuración', icon: <Settings size={20} />, path: '/setup' },
        { id: 'stores', label: 'Mis Tiendas', icon: <Store size={20} />, path: '/stores' },
        { id: 'logs', label: 'Live History', icon: <ScrollText size={20} />, path: '/logs' },
        { id: 'analytics', label: 'Métricas Avanzadas', icon: <BarChart2 size={20} />, path: '/analytics' },
        { id: 'credentials', label: 'Credenciales', icon: <Key size={20} />, path: '/credentials' },
        { id: 'ycloud', label: 'WhatsApp (YCloud)', icon: <Smartphone size={20} />, path: '/ycloud' },
        { id: 'whatsapp-meta', label: 'WhatsApp Meta API', icon: <MessageCircle size={20} />, path: '/whatsapp-meta' },
        { id: 'tools', label: 'Herramientas', icon: <Wrench size={20} />, path: '/tools' },
    ];

    return (
        <aside className="sidebar">
            <div className="logo">
                <span className="logo-icon">🩰</span>
                <span className="logo-text">POINTE COACH</span>
            </div>
            <nav>
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        onClick={() => navigate(item.path)}
                    >
                        <span className="icon">{item.icon}</span> {item.label}
                    </button>
                ))}
            </nav>
        </aside>
    );
};
