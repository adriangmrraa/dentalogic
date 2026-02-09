import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    UserCheck, UserX, Clock, ShieldCheck, Mail,
    AlertTriangle, User, Users, Lock, Unlock, X, Building2, Stethoscope, BarChart3, MessageSquare, Plus, Phone, Save
} from 'lucide-react';
import { Modal } from '../components/Modal';

interface StaffUser {
    id: string;
    email: string;
    role: string;
    status: 'pending' | 'active' | 'suspended';
    created_at: string;
    first_name?: string;
    last_name?: string;
}

const SPECIALTIES = [
  'Odontología General',
  'Ortodoncia',
  'Endodoncia',
  'Periodoncia',
  'Cirugía Oral',
  'Prótesis Dental',
  'Odontopediatría',
  'Implantología',
  'Estética Dental',
];

interface ProfessionalRow {
    id: number;
    tenant_id?: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    specialty?: string;
    is_active?: boolean;
}

const UserApprovalView: React.FC = () => {
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'requests' | 'staff'>('requests');
    const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
    const [staffDetailLoading, setStaffDetailLoading] = useState(false);
    const [professionalRows, setProfessionalRows] = useState<ProfessionalRow[]>([]);
    const [clinics, setClinics] = useState<{ id: number; clinic_name: string }[]>([]);
    const [showLinkForm, setShowLinkForm] = useState(false);
    const [linkFormData, setLinkFormData] = useState({ tenant_id: null as number | null, phone: '', specialty: '', license_number: '' });
    const [linkFormSubmitting, setLinkFormSubmitting] = useState(false);

    useEffect(() => {
        fetchAllUsers();
    }, []);

    useEffect(() => {
        api.get<{ id: number; clinic_name: string }[]>('/admin/chat/tenants').then((res) => {
            setClinics(res.data || []);
        }).catch(() => setClinics([]));
    }, []);

    useEffect(() => {
        if (!selectedStaff) {
            setProfessionalRows([]);
            return;
        }
        setStaffDetailLoading(true);
        api.get<ProfessionalRow[]>(`/admin/professionals/by-user/${selectedStaff.id}`)
            .then((res) => setProfessionalRows(res.data || []))
            .catch(() => setProfessionalRows([]))
            .finally(() => setStaffDetailLoading(false));
    }, [selectedStaff?.id]);

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
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, status: action } : u
            ));
        } catch (err: any) {
            alert("Error al procesar la solicitud.");
        }
    };

    const closeStaffModal = () => {
        setSelectedStaff(null);
        setShowLinkForm(false);
        setLinkFormData({ tenant_id: null, phone: '', specialty: '', license_number: '' });
    };

    const handleLinkToSedeSubmit = async (e: React.FormEvent) => {
        if (!selectedStaff) return;
        const tenant_id = linkFormData.tenant_id ?? clinics[0]?.id;
        if (!tenant_id) {
            alert('Seleccioná una sede.');
            return;
        }
        e.preventDefault();
        setLinkFormSubmitting(true);
        try {
            const name = `${selectedStaff.first_name || ''} ${selectedStaff.last_name || ''}`.trim() || 'Profesional';
            await api.post('/admin/professionals', {
                email: selectedStaff.email,
                tenant_id,
                name,
                phone: linkFormData.phone || undefined,
                specialty: linkFormData.specialty || undefined,
                license_number: linkFormData.license_number || undefined,
                is_active: true,
            });
            const res = await api.get<ProfessionalRow[]>(`/admin/professionals/by-user/${selectedStaff.id}`);
            setProfessionalRows(res.data || []);
            setShowLinkForm(false);
            setLinkFormData({ tenant_id: null, phone: '', specialty: '', license_number: '' });
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Error al vincular a sede.';
            alert(msg);
        } finally {
            setLinkFormSubmitting(false);
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
                                <UserCard
                                    key={user.id}
                                    user={user}
                                    onAction={handleAction}
                                    onCardClick={() => setSelectedStaff(user)}
                                />
                            ))
                        )
                    )}
                </div>
            )}

            {/* Modal: detalle del profesional (antes "página Profesionales") */}
            <Modal
                isOpen={!!selectedStaff}
                onClose={closeStaffModal}
                title={selectedStaff ? `${selectedStaff.first_name || 'Sin nombre'} ${selectedStaff.last_name || ''}` : 'Detalle'}
                size="xl"
            >
                {selectedStaff && (
                    <div className="space-y-6">
                        <div className="flex flex-wrap gap-4 items-start justify-between">
                            <div className="flex flex-wrap gap-4 items-start">
                                <div className="role-badge" data-role={selectedStaff.role}>
                                    {selectedStaff.role.toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 flex items-center gap-2">
                                        <Mail size={14} />
                                        {selectedStaff.email}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Miembro desde: {new Date(selectedStaff.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowLinkForm(true);
                                    setLinkFormData((p) => ({ ...p, tenant_id: clinics[0]?.id ?? null }));
                                }}
                                className="btn-vincular-sede"
                            >
                                <Plus size={18} />
                                {professionalRows.length > 0 ? 'Vincular a otra sede' : 'Vincular a sede'}
                            </button>
                        </div>

                        {showLinkForm && (
                            <form onSubmit={handleLinkToSedeSubmit} className="glass p-5 rounded-xl space-y-4">
                                <h3 className="text-sm font-semibold text-gray-800">Crear perfil en una sede</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Sede / Clínica</label>
                                        <select
                                            value={linkFormData.tenant_id ?? ''}
                                            onChange={(e) => setLinkFormData((p) => ({ ...p, tenant_id: e.target.value ? parseInt(e.target.value, 10) : null }))}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            required
                                        >
                                            <option value="">Elegir sede</option>
                                            {clinics.map((c) => (
                                                <option key={c.id} value={c.id}>{c.clinic_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Phone size={12} /> Teléfono</label>
                                        <input
                                            type="text"
                                            value={linkFormData.phone}
                                            onChange={(e) => setLinkFormData((p) => ({ ...p, phone: e.target.value }))}
                                            placeholder="Ej. +54 11 1234-5678"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Especialidad</label>
                                        <select
                                            value={linkFormData.specialty}
                                            onChange={(e) => setLinkFormData((p) => ({ ...p, specialty: e.target.value }))}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        >
                                            <option value="">Seleccionar (opcional)</option>
                                            {SPECIALTIES.map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Matrícula</label>
                                        <input
                                            type="text"
                                            value={linkFormData.license_number}
                                            onChange={(e) => setLinkFormData((p) => ({ ...p, license_number: e.target.value }))}
                                            placeholder="Opcional"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" disabled={linkFormSubmitting} className="btn-icon-labeled success">
                                        <Save size={18} />
                                        {linkFormSubmitting ? 'Guardando...' : 'Guardar y vincular'}
                                    </button>
                                    <button type="button" onClick={() => { setShowLinkForm(false); setLinkFormData({ tenant_id: null, phone: '', specialty: '', license_number: '' }); }} className="btn-icon-labeled">
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        )}

                        {staffDetailLoading ? (
                            <p className="text-gray-500">Cargando datos de sedes...</p>
                        ) : professionalRows.length > 0 ? (
                            <>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Building2 size={16} />
                                        Sedes asignadas
                                    </h3>
                                    <ul className="list-disc list-inside text-sm text-gray-600">
                                        {professionalRows.map((p) => (
                                            <li key={p.id}>
                                                {clinics.find((c) => c.id === p.tenant_id)?.clinic_name || `Sede ${p.tenant_id}`}
                                                {p.specialty && ` · ${p.specialty}`}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                                    <div className="glass p-4 rounded-xl">
                                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                            <Stethoscope size={16} />
                                            Sus pacientes
                                        </h4>
                                        <p className="text-xs text-gray-500">Resumen y métricas por paciente (próximamente).</p>
                                    </div>
                                    <div className="glass p-4 rounded-xl">
                                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                            <BarChart3 size={16} />
                                            Uso de la plataforma
                                        </h4>
                                        <p className="text-xs text-gray-500">Tiempo de uso, interacciones, análisis IA (próximamente).</p>
                                    </div>
                                </div>
                                <div className="glass p-4 rounded-xl">
                                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                        <MessageSquare size={16} />
                                        Mensajes e interacciones
                                    </h4>
                                    <p className="text-xs text-gray-500">Enlace con chats de pacientes habituales (próximamente).</p>
                                </div>
                            </>
                        ) : (
                            <div className="glass p-4 rounded-xl text-center text-gray-500 text-sm">
                                Aún no está vinculado a ninguna sede. Usá el botón <strong>Vincular a sede</strong> arriba para elegir una clínica y guardar sus datos de contacto; así podrá usar la agenda y la plataforma.
                            </div>
                        )}
                    </div>
                )}
            </Modal>

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
        .btn-vincular-sede {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          border: none;
          background: #2563eb;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .btn-vincular-sede:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
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
    onCardClick?: () => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onAction, isRequest, onCardClick }) => (
    <div className="glass p-5 flex items-center justify-between animate-fadeIn">
        <div
            className={`flex items-center gap-4 flex-1 min-w-0 ${onCardClick ? 'cursor-pointer hover:opacity-90' : ''}`}
            onClick={onCardClick}
            role={onCardClick ? 'button' : undefined}
        >
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

        <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
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
