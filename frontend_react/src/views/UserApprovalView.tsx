import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    UserCheck, UserX, Clock, ShieldCheck, Mail,
    AlertTriangle, User, Users, Lock, Unlock
} from 'lucide-react';

interface StaffUser {
    id: string;
    email: string;
    role: string;
    status: 'pending' | 'active' | 'suspended';
    created_at: string;
    first_name?: string;
    last_name?: string;
}

const UserApprovalView: React.FC = () => {
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'requests' | 'staff'>('requests');

    useEffect(() => {
        fetchAllUsers();
    }, []);

    const fetchAllUsers = async () => {
        try {
            setLoading(true);
            const response = await api.get('/admin/users');
            setUsers(response.data);
        } catch (err: any) {
            setError("No se pudieron cargar los usuarios. Asegúrese de tener permisos de CEO.");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (userId: string, action: 'active' | 'suspended') => {
        try {
            await api.post(`/admin/users/${userId}/status`, { status: action });
            // Actualizar estado localmente
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, status: action } : u
            ));
        } catch (err: any) {
            alert("Error al procesar la solicitud.");
        }
    };

    // Filtrar solicitudes (solo pendientes)
    const requests = users.filter(u => u.status === 'pending');

    // Filtrar personal (activos y suspendidos, excluyendo al CEO actual si se desea, 
    // pero aquí mostramos todos menos el rol 'ceo' para evitar auto-bloqueo accidental)
    const staff = users.filter(u => u.status !== 'pending' && u.role !== 'ceo');

    if (loading) return <div className="p-6">Cargando personal de clínica...</div>;

    return (
        <div className="view active p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="view-title flex items-center gap-3">
                        <ShieldCheck color="var(--accent)" />
                        Gestión de Usuarios y Personal
                    </h1>
                    <p className="text-secondary">Administre los accesos y el personal de la clínica.</p>
                </div>
            </div>

            {/* TABS */}
            <div className="flex gap-4 mb-6 border-b border-white/10 pb-px">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`pb-3 px-2 font-medium transition-all relative ${activeTab === 'requests'
                            ? 'text-white'
                            : 'text-secondary hover:text-white'
                        }`}
                >
                    Solicitudes {requests.length > 0 && (
                        <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            {requests.length}
                        </span>
                    )}
                    {activeTab === 'requests' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
                <button
                    onClick={() => setActiveTab('staff')}
                    className={`pb-3 px-2 font-medium transition-all relative ${activeTab === 'staff'
                            ? 'text-white'
                            : 'text-secondary hover:text-white'
                        }`}
                >
                    Personal Activo
                    {activeTab === 'staff' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
            </div>

            {error ? (
                <div className="glass p-6 text-center border-red-500/20">
                    <AlertTriangle color="#ff4d4d" size={48} className="mx-auto mb-4" />
                    <p className="text-red-400">{error}</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {activeTab === 'requests' ? (
                        requests.length === 0 ? (
                            <div className="glass p-12 text-center">
                                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                                <h3 className="text-xl font-medium mb-2">No hay solicitudes pendientes</h3>
                                <p className="text-secondary">Todas las solicitudes han sido procesadas.</p>
                            </div>
                        ) : (
                            requests.map(user => (
                                <UserCard key={user.id} user={user} onAction={handleAction} isRequest />
                            ))
                        )
                    ) : (
                        staff.length === 0 ? (
                            <div className="glass p-12 text-center">
                                <Users size={48} className="mx-auto mb-4 opacity-50" />
                                <h3 className="text-xl font-medium mb-2">No hay personal registrado</h3>
                                <p className="text-secondary">Registe profesionales o secretarias para verlos aquí.</p>
                            </div>
                        ) : (
                            staff.map(user => (
                                <UserCard key={user.id} user={user} onAction={handleAction} />
                            ))
                        )
                    )}
                </div>
            )}

            <style>{`
        .role-badge {
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 700;
          background: rgba(255,255,255,0.05);
          letter-spacing: 0.5px;
        }
        .role-badge[data-role='ceo'] { color: #ffc107; background: rgba(255,193,7,0.1); }
        .role-badge[data-role='professional'] { color: var(--accent); background: rgba(var(--accent-rgb), 0.1); }
        .role-badge[data-role='secretary'] { color: #4dff8c; background: rgba(77,255,140,0.1); }

        .btn-icon-labeled {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          transition: all 0.3s;
          color: white;
        }
        .btn-icon-labeled:hover {
          background: rgba(255,255,255,0.1);
          transform: translateY(-1px);
        }
        .btn-icon-labeled.success {
          border-color: rgba(77, 255, 140, 0.3);
          background: rgba(77, 255, 140, 0.1);
          color: #4dff8c;
        }
        .btn-icon-labeled.success:hover {
          background: rgba(77, 255, 140, 0.2);
          border-color: #4dff8c;
        }
        .btn-icon-labeled.danger {
          border-color: rgba(255, 77, 77, 0.3);
          background: rgba(255, 77, 77, 0.1);
          color: #ff4d4d;
        }
        .btn-icon-labeled.danger:hover {
          background: rgba(255, 77, 77, 0.2);
          border-color: #ff4d4d;
        }
        .btn-icon-labeled.warning {
          border-color: rgba(255, 193, 7, 0.3);
          background: rgba(255, 193, 7, 0.1);
          color: #ffc107;
        }
        .btn-icon-labeled.warning:hover {
          background: rgba(255, 193, 7, 0.2);
          border-color: #ffc107;
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};

interface UserCardProps {
    user: StaffUser;
    onAction: (id: string, action: 'active' | 'suspended') => void;
    isRequest?: boolean;
}

const UserCard: React.FC<UserCardProps> = ({ user, onAction, isRequest }) => (
    <div className="glass p-5 flex items-center justify-between animate-fadeIn">
        <div className="flex items-center gap-4">
            <div className={`role-badge ${user.status === 'suspended' ? 'opacity-40' : ''}`} data-role={user.role}>
                {user.role.toUpperCase()}
            </div>
            <div>
                <div className={`font-medium flex items-center gap-2 ${user.status === 'suspended' ? 'text-secondary line-through' : ''}`}>
                    <User size={14} className="opacity-50" />
                    {user.first_name || 'Sin Nombre'} {user.last_name || ''}
                    {user.status === 'suspended' && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full uppercase ml-2">Suspendido</span>
                    )}
                </div>
                <div className="text-sm flex items-center gap-2 opacity-70">
                    <Mail size={12} />
                    {user.email}
                </div>
                <div className="text-xs text-secondary mt-1">
                    {isRequest ? 'Solicitado: ' : 'Miembro desde: '} {new Date(user.created_at).toLocaleDateString()}
                </div>
            </div>
        </div>

        <div className="flex gap-2">
            {isRequest ? (
                <>
                    <button onClick={() => onAction(user.id, 'active')} className="btn-icon-labeled success">
                        <UserCheck size={18} /> Aprobar
                    </button>
                    <button onClick={() => onAction(user.id, 'suspended')} className="btn-icon-labeled danger">
                        <UserX size={18} /> Rechazar
                    </button>
                </>
            ) : (
                user.status === 'active' ? (
                    <button onClick={() => onAction(user.id, 'suspended')} className="btn-icon-labeled warning">
                        <Lock size={18} /> Suspender Acceso
                    </button>
                ) : (
                    <button onClick={() => onAction(user.id, 'active')} className="btn-icon-labeled success">
                        <Unlock size={18} /> Reactivar Acceso
                    </button>
                )
            )}
        </div>
    </div>
);

export default UserApprovalView;
