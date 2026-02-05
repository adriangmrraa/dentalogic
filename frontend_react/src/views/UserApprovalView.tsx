import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { UserCheck, UserX, Clock, ShieldCheck, Mail, AlertTriangle } from 'lucide-react';

interface PendingUser {
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
}

const UserApprovalView: React.FC = () => {
    const [users, setUsers] = useState<PendingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPendingUsers();
    }, []);

    const fetchPendingUsers = async () => {
        try {
            setLoading(true);
            // Backend should have an endpoint for this. Assuming /admin/users/pending
            const response = await api.get('/admin/users/pending');
            setUsers(response.data);
        } catch (err: any) {
            setError("No se pudieron cargar los usuarios pendientes. Asegúrese de tener permisos de CEO.");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (userId: string, action: 'active' | 'suspended') => {
        try {
            await api.post(`/admin/users/${userId}/status`, { status: action });
            setUsers(users.filter(u => u.id !== userId));
        } catch (err: any) {
            alert("Error al procesar la solicitud.");
        }
    };

    if (loading) return <div className="p-6">Cargando usuarios...</div>;

    return (
        <div className="view active p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="view-title flex items-center gap-3">
                        <ShieldCheck color="var(--accent)" />
                        Aprobación de Usuarios
                    </h1>
                    <p className="text-secondary">Gestione las solicitudes de acceso a la plataforma.</p>
                </div>
            </div>

            {error ? (
                <div className="glass p-6 text-center border-red-500/20">
                    <AlertTriangle color="#ff4d4d" size={48} className="mx-auto mb-4" />
                    <p className="text-red-400">{error}</p>
                </div>
            ) : users.length === 0 ? (
                <div className="glass p-12 text-center">
                    <Clock size={48} className="mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-medium mb-2">No hay solicitudes pendientes</h3>
                    <p className="text-secondary">Todos los usuarios han sido procesados.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {users.map(user => (
                        <div key={user.id} className="glass p-5 flex items-center justify-between animate-fadeIn">
                            <div className="flex items-center gap-4">
                                <div className="role-badge" data-role={user.role}>
                                    {user.role.toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium flex items-center gap-2">
                                        <Mail size={14} className="opacity-50" />
                                        {user.email}
                                    </div>
                                    <div className="text-sm text-secondary">
                                        Solicitado: {new Date(user.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleAction(user.id, 'active')}
                                    className="btn-icon-labeled success"
                                >
                                    <UserCheck size={18} />
                                    Aprobar
                                </button>
                                <button
                                    onClick={() => handleAction(user.id, 'suspended')}
                                    className="btn-icon-labeled danger"
                                >
                                    <UserX size={18} />
                                    Rechazar
                                </button>
                            </div>
                        </div>
                    ))}
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
        .btn-icon-labeled.success:hover {
          border-color: #4dff8c;
          color: #4dff8c;
          background: rgba(77,255,140,0.05);
        }
        .btn-icon-labeled.danger:hover {
          border-color: #ff4d4d;
          color: #ff4d4d;
          background: rgba(255,77,77,0.05);
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

export default UserApprovalView;
