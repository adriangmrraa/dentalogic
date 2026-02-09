import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import {
    UserCheck, UserX, Clock, ShieldCheck, Mail,
    AlertTriangle, User, Users, Lock, Unlock, X, Building2, Stethoscope, BarChart3, MessageSquare, Plus, Phone, Save, Settings, ChevronDown, ChevronUp, Edit
} from 'lucide-react';
import { Modal } from '../components/Modal';

interface DayConfig { enabled: boolean; slots: { start: string; end: string }[]; }
interface WorkingHours {
  monday: DayConfig; tuesday: DayConfig; wednesday: DayConfig; thursday: DayConfig;
  friday: DayConfig; saturday: DayConfig; sunday: DayConfig;
}
const DAYS_HORARIOS = [
  { key: 'monday' as const, label: 'Lunes' },
  { key: 'tuesday' as const, label: 'Martes' },
  { key: 'wednesday' as const, label: 'Miércoles' },
  { key: 'thursday' as const, label: 'Jueves' },
  { key: 'friday' as const, label: 'Viernes' },
  { key: 'saturday' as const, label: 'Sábado' },
  { key: 'sunday' as const, label: 'Domingo' },
];
function createDefaultWorkingHours(): WorkingHours {
  const wh: Record<string, DayConfig> = {};
  DAYS_HORARIOS.forEach(day => {
    wh[day.key] = {
      enabled: day.key !== 'sunday',
      slots: day.key !== 'sunday' ? [{ start: '09:00', end: '18:00' }] : [],
    };
  });
  return wh as WorkingHours;
}
function parseWorkingHours(raw: unknown): WorkingHours {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const base = createDefaultWorkingHours();
    (Object.keys(base) as (keyof WorkingHours)[]).forEach(k => {
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) {
        const d = o[k] as { enabled?: boolean; slots?: { start?: string; end?: string }[] };
        base[k] = {
          enabled: d.enabled ?? base[k].enabled,
          slots: Array.isArray(d.slots) ? d.slots.map(s => ({ start: s?.start ?? '09:00', end: s?.end ?? '18:00' })) : base[k].slots,
        };
      }
    });
    return base;
  }
  return createDefaultWorkingHours();
}

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
    working_hours?: unknown;
    phone_number?: string;
    registration_id?: string;
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
    const [editingProfessionalRow, setEditingProfessionalRow] = useState<ProfessionalRow | null>(null);
    const [staffForEditModal, setStaffForEditModal] = useState<StaffUser | null>(null);
    const [editFormData, setEditFormData] = useState<{
        name: string; email: string; phone: string; specialty: string; license_number: string;
        is_active: boolean; working_hours: WorkingHours;
    }>({ name: '', email: '', phone: '', specialty: '', license_number: '', is_active: true, working_hours: createDefaultWorkingHours() });
    const [editFormSubmitting, setEditFormSubmitting] = useState(false);
    const [expandedEditDays, setExpandedEditDays] = useState<string[]>([]);

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

    const handleConfigClick = async (user: StaffUser) => {
        try {
            const res = await api.get<ProfessionalRow[]>(`/admin/professionals/by-user/${user.id}`);
            const rows = res.data || [];
            if (rows.length === 0) {
                setSelectedStaff(user);
                setShowLinkForm(true);
                return;
            }
            const row = rows[0];
            setStaffForEditModal(user);
            setEditingProfessionalRow(row);
            const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email);
            setEditFormData({
                name,
                email: row.email || user.email || '',
                phone: row.phone_number || '',
                specialty: row.specialty || '',
                license_number: row.registration_id || '',
                is_active: row.is_active ?? true,
                working_hours: parseWorkingHours(row.working_hours),
            });
            setExpandedEditDays([]);
        } catch {
            alert('No se pudieron cargar los datos del profesional.');
        }
    };

    const closeEditProfileModal = () => {
        setEditingProfessionalRow(null);
        setStaffForEditModal(null);
    };

    const toggleEditDayEnabled = (dayKey: keyof WorkingHours) => {
        setEditFormData(prev => ({
            ...prev,
            working_hours: {
                ...prev.working_hours,
                [dayKey]: {
                    ...prev.working_hours[dayKey],
                    enabled: !prev.working_hours[dayKey].enabled,
                    slots: !prev.working_hours[dayKey].enabled && prev.working_hours[dayKey].slots.length === 0
                        ? [{ start: '09:00', end: '18:00' }] : prev.working_hours[dayKey].slots,
                },
            },
        }));
    };
    const addEditTimeSlot = (dayKey: keyof WorkingHours) => {
        setEditFormData(prev => ({
            ...prev,
            working_hours: {
                ...prev.working_hours,
                [dayKey]: {
                    ...prev.working_hours[dayKey],
                    slots: [...prev.working_hours[dayKey].slots, { start: '09:00', end: '18:00' }],
                },
            },
        }));
    };
    const removeEditTimeSlot = (dayKey: keyof WorkingHours, index: number) => {
        setEditFormData(prev => ({
            ...prev,
            working_hours: {
                ...prev.working_hours,
                [dayKey]: {
                    ...prev.working_hours[dayKey],
                    slots: prev.working_hours[dayKey].slots.filter((_, i) => i !== index),
                },
            },
        }));
    };
    const updateEditTimeSlot = (dayKey: keyof WorkingHours, index: number, field: 'start' | 'end', value: string) => {
        setEditFormData(prev => ({
            ...prev,
            working_hours: {
                ...prev.working_hours,
                [dayKey]: {
                    ...prev.working_hours[dayKey],
                    slots: prev.working_hours[dayKey].slots.map((slot, i) =>
                        i === index ? { ...slot, [field]: value } : slot
                    ),
                },
            },
        }));
    };

    const handleEditProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfessionalRow) return;
        setEditFormSubmitting(true);
        try {
            await api.put(`/admin/professionals/${editingProfessionalRow.id}`, {
                name: editFormData.name,
                email: editFormData.email,
                phone: editFormData.phone,
                specialty: editFormData.specialty || undefined,
                license_number: editFormData.license_number || undefined,
                is_active: editFormData.is_active,
                availability: {},
                working_hours: editFormData.working_hours,
            });
            closeEditProfileModal();
            if (selectedStaff?.id === staffForEditModal?.id) {
                const res = await api.get<ProfessionalRow[]>(`/admin/professionals/by-user/${selectedStaff.id}`);
                setProfessionalRows(res.data || []);
            }
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Error al guardar.');
        } finally {
            setEditFormSubmitting(false);
        }
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
                                    onConfigClick={() => handleConfigClick(user)}
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

            {/* Modal Editar Perfil (estilo captura: claro, grande, tres columnas) */}
            {editingProfessionalRow && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && closeEditProfileModal()}
                >
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                                    <Edit size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">
                                        Editar Perfil: {editFormData.name || (staffForEditModal?.first_name && staffForEditModal?.last_name ? `${staffForEditModal.first_name} ${staffForEditModal.last_name}` : staffForEditModal?.email) || 'Profesional'}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-0.5">Completa la información del staff médico.</p>
                                </div>
                            </div>
                            <button type="button" onClick={closeEditProfileModal} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleEditProfileSubmit} className="flex-1 overflow-y-auto min-h-0">
                            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-4 space-y-5">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Datos Principales</h3>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sede / Clínica</label>
                                        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium text-gray-800">
                                            {clinics.find((c) => c.id === editingProfessionalRow.tenant_id)?.clinic_name || `Sede ${editingProfessionalRow.tenant_id ?? '—'}`}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nombre completo <span className="text-red-500">*</span></label>
                                        <input type="text" value={editFormData.name} onChange={(e) => setEditFormData((p) => ({ ...p, name: e.target.value }))} className="edit-profile-input" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Especialidad</label>
                                        <select value={editFormData.specialty} onChange={(e) => setEditFormData((p) => ({ ...p, specialty: e.target.value }))} className="edit-profile-input">
                                            <option value="">Seleccionar...</option>
                                            {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Matrícula</label>
                                        <input type="text" value={editFormData.license_number} onChange={(e) => setEditFormData((p) => ({ ...p, license_number: e.target.value }))} className="edit-profile-input" placeholder="MN 12345" />
                                    </div>
                                </div>
                                <div className="lg:col-span-4 space-y-5">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Contacto & Estado</h3>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">E-mail</label>
                                        <input type="email" value={editFormData.email} onChange={(e) => setEditFormData((p) => ({ ...p, email: e.target.value }))} className="edit-profile-input" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                                        <input type="text" value={editFormData.phone} onChange={(e) => setEditFormData((p) => ({ ...p, phone: e.target.value }))} className="edit-profile-input" placeholder="+54 9..." />
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer mt-4">
                                        <input type="checkbox" checked={editFormData.is_active} onChange={(e) => setEditFormData((p) => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                        <span className="text-sm font-medium text-gray-700">Activo</span>
                                    </label>
                                </div>
                                <div className="lg:col-span-4 space-y-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Clock size={14} /> Disponibilidad</h3>
                                    <p className="text-xs text-gray-500">Intervalos para el bot de IA por WhatsApp.</p>
                                    <div className="space-y-2">
                                        {DAYS_HORARIOS.map((day) => {
                                            const dayKey = day.key;
                                            const config = editFormData.working_hours[dayKey];
                                            const isExpanded = expandedEditDays.includes(dayKey);
                                            return (
                                                <div key={day.key} className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                                                    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/80 transition-colors">
                                                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                                                            <input type="checkbox" checked={config.enabled} onChange={() => toggleEditDayEnabled(dayKey)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                                                            <span className="text-sm font-medium text-gray-800">{day.label}</span>
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500 tabular-nums">{config.slots.length} slots</span>
                                                            <button type="button" onClick={() => setExpandedEditDays((prev) => isExpanded ? prev.filter((d) => d !== dayKey) : [...prev, dayKey])} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                                                                <ChevronDown size={18} className={isExpanded ? 'rotate-180' : ''} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {isExpanded && config.enabled && (
                                                        <div className="px-4 pb-4 pt-1 space-y-3 bg-gray-50/50 border-t border-gray-100">
                                                            {config.slots.map((slot, idx) => (
                                                                <div key={idx} className="flex items-center gap-3">
                                                                    <input type="time" value={slot.start} onChange={(e) => updateEditTimeSlot(dayKey, idx, 'start', e.target.value)} className="edit-profile-input w-28" />
                                                                    <span className="text-gray-400">–</span>
                                                                    <input type="time" value={slot.end} onChange={(e) => updateEditTimeSlot(dayKey, idx, 'end', e.target.value)} className="edit-profile-input w-28" />
                                                                    <button type="button" onClick={() => removeEditTimeSlot(dayKey, idx)} className="text-sm text-red-500 hover:text-red-700">Quitar</button>
                                                                </div>
                                                            ))}
                                                            <button type="button" onClick={() => addEditTimeSlot(dayKey)} className="text-sm font-medium text-blue-600 hover:text-blue-800">+ Agregar horario</button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 md:px-8 py-5 border-t border-gray-100 bg-gray-50/50 flex gap-3 justify-end rounded-b-3xl">
                                <button type="button" onClick={closeEditProfileModal} className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={editFormSubmitting} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
                                    {editFormSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
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
        .btn-gear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid #dee2e6;
          background: #fff;
          color: #495057;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .btn-gear:hover {
          background: #f8f9fa;
          border-color: #adb5bd;
          color: #2563eb;
          transform: translateY(-1px);
        }
        .edit-profile-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          font-size: 0.875rem;
          color: #1f2937;
          background: #fff;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .edit-profile-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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
    onConfigClick?: () => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onAction, isRequest, onCardClick, onConfigClick }) => (
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

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {!isRequest && onConfigClick && (
                <button
                    type="button"
                    onClick={onConfigClick}
                    className="btn-gear"
                    title="Editar perfil y horarios"
                    aria-label="Editar perfil"
                >
                    <Settings size={20} />
                </button>
            )}
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
