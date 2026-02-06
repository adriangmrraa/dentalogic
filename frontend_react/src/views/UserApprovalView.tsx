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
            <div className="flex gap-4 mb-6 border-b border-gray-200 pb-px">
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`pb-3 px-6 font-semibold transition-all relative rounded-t-xl ${activeTab === 'requests'
                            ? 'text-medical-600'
                            : 'text-gray-500 hover:text-medical-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        Solicitudes
                        {requests.length > 0 && (
                            <span className="bg-danger text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm">
                                {requests.length}
                            </span>
                        )}
                    </div>
                    {activeTab === 'requests' && (
                        <>
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-medical-600" />
                            <div className="absolute inset-0 bg-medical-400/10 blur-xl rounded-full -z-10 shadow-[0_0_20px_rgba(0,102,204,0.15)]" />
                        </>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('staff')}
                    className={`pb-3 px-6 font-semibold transition-all relative rounded-t-xl ${activeTab === 'staff'
                            ? 'text-medical-600'
                            : 'text-gray-500 hover:text-medical-700'
                        }`}
                >
                    Personal Activo
                    {activeTab === 'staff' && (
                        <>
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-medical-600" />
                            <div className="absolute inset-0 bg-medical-400/10 blur-xl rounded-full -z-10 shadow-[0_0_20px_rgba(0,102,204,0.15)]" />
                        </>
                    )}
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
        .glass {
          background: white;
          border: 1px solid var(--white-300);
          border-radius: 16px;
          box-shadow: var(--shadow-card);
          transition: all 0.3s ease;
        }
        .glass:hover {
          box-shadow: var(--shadow-soft);
          border-color: var(--medical-300);
        }
        
        .role-badge {
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 700;
          background: #f8f9fa;
          letter-spacing: 0.5px;
          border: 1px solid rgba(0,0,0,0.05);
        }
        .role-badge[data-role='ceo'] { color: #856404; background: #fff3cd; border-color: #ffeeba; }
        .role-badge[data-role='professional'] { color: #004085; background: #cce5ff; border-color: #b8daff; }
        .role-badge[data-role='secretary'] { color: #155724; background: #d4edda; border-color: #c3e6cb; }

        .btn-icon-labeled {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 500;
          border: 1px solid #dee2e6;
          background: #fff;
          transition: all 0.3s;
          color: #495057;
        }
        .btn-icon-labeled:hover {
          background: #f8f9fa;
          border-color: #adb5bd;
          transform: translateY(-1px);
        }
        .btn-icon-labeled.success {
          border-color: #c3e6cb;
          background: #d4edda;
          color: #155724;
        }
        .btn-icon-labeled.success:hover {
          background: #c3e6cb;
          border-color: #155724;
        }
        .btn-icon-labeled.danger {
          border-color: #f5c6cb;
          background: #f8d7da;
          color: #721c24;
        }
        .btn-icon-labeled.danger:hover {
          background: #f5c6cb;
          border-color: #721c24;
        }
        .btn-icon-labeled.warning {
          border-color: #ffeeba;
          background: #fff3cd;
          color: #856404;
        }
        .btn-icon-labeled.warning:hover {
          background: #ffeeba;
          border-color: #856404;
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
