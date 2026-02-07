import { useState, useEffect } from 'react';
import {
  Plus, Edit, Clock, Calendar, Mail, Phone,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Save, X, ClipboardList
} from 'lucide-react';
import api from '../api/axios';

interface Professional {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
  license_number?: string;
  is_active: boolean;
  availability?: ProfessionalAvailability;
}

interface ProfessionalAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

interface TimeSlot {
  start: string;  // HH:mm
  end: string;    // HH:mm
}

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

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

export default function ProfessionalsView() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<number, string[]>>({});

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    license_number: '',
    is_active: true,
    availability: createEmptyAvailability(),
  });

  function createEmptyAvailability(): ProfessionalAvailability {
    const availability: ProfessionalAvailability = {} as ProfessionalAvailability;
    DAYS.forEach(day => {
      availability[day.key as keyof ProfessionalAvailability] = [];
    });
    return availability;
  }

  useEffect(() => {
    fetchProfessionals();
  }, []);

  const fetchProfessionals = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/professionals');
      // Map API response to Component State (handling first_name/last_name mismatch)
      const mappedData = response.data.map((p: any) => ({
        ...p,
        name: p.name || `${p.first_name} ${p.last_name || ''}`.trim()
      }));
      setProfessionals(mappedData);
    } catch (error) {
      console.error('Error fetching professionals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProfessional) {
        await api.put(`/admin/professionals/${editingProfessional.id}`, formData);
      } else {
        await api.post('/admin/professionals', formData);
      }
      fetchProfessionals();
      closeModal();
    } catch (error) {
      console.error('Error saving professional:', error);
      alert('Error al guardar profesional');
    }
  };

  const handleToggleActive = async (professional: Professional) => {
    try {
      await api.put(`/admin/professionals/${professional.id}`, {
        is_active: !professional.is_active,
      });
      fetchProfessionals();
    } catch (error) {
      console.error('Error toggling active status:', error);
    }
  };

  const openEditModal = (professional: Professional) => {
    setEditingProfessional(professional);
    setFormData({
      name: professional.name,
      email: professional.email || '',
      phone: professional.phone || '',
      specialty: professional.specialty || '',
      license_number: professional.license_number || '',
      is_active: professional.is_active,
      availability: professional.availability || createEmptyAvailability(),
    });
    setExpandedDays({});
  };

  const openCreateModal = () => {
    setEditingProfessional(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      specialty: '',
      license_number: '',
      is_active: true,
      availability: createEmptyAvailability(),
    });
    setExpandedDays({});
  };

  const closeModal = () => {
    setEditingProfessional(null);
  };

  const toggleDay = (professionalId: number, day: string) => {
    setExpandedDays((prev: Record<number, string[]>) => {
      const current = prev[professionalId] || [];
      if (current.includes(day)) {
        return { ...prev, [professionalId]: current.filter((d: string) => d !== day) };
      }
      return { ...prev, [professionalId]: [...current, day] };
    });
  };

  const addTimeSlot = (dayKey: string) => {
    setFormData((prev: any) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dayKey]: [
          ...(prev.availability[dayKey as keyof ProfessionalAvailability] || []),
          { start: '09:00', end: '17:00' }
        ],
      },
    }));
  };

  const removeTimeSlot = (dayKey: string, index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dayKey]: prev.availability[dayKey as keyof ProfessionalAvailability].filter((_: any, i: number) => i !== index),
      },
    }));
  };

  const updateTimeSlot = (dayKey: string, index: number, field: 'start' | 'end', value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dayKey]: prev.availability[dayKey as keyof ProfessionalAvailability].map((slot: TimeSlot, i: number) =>
          i === index ? { ...slot, [field]: value } : slot
        ),
      },
    }));
  };

  const getActiveProfessionals = () => professionals.filter((p: Professional) => p.is_active).length;

  const getTotalSlots = (availability?: ProfessionalAvailability) => {
    if (!availability) return 0;
    return DAYS.reduce((total, day) => {
      return total + (availability[day.key as keyof ProfessionalAvailability]?.length || 0);
    }, 0);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Profesionales</h1>
          <p className="text-sm text-gray-500">Gestión del staff médico y disponibilidad</p>
        </div>
        <button
          onClick={openCreateModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Plus size={20} />
          Nuevo Profesional
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-primary">
          <div className="text-xs text-gray-500 uppercase font-semibold">Total</div>
          <div className="text-2xl font-bold">{professionals.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-xs text-gray-500 uppercase font-semibold">Activos</div>
          <div className="text-2xl font-bold text-green-600">{getActiveProfessionals()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-300">
          <div className="text-xs text-gray-500 uppercase font-semibold">Inactivos</div>
          <div className="text-2xl font-bold text-gray-400">
            {professionals.length - getActiveProfessionals()}
          </div>
        </div>
      </div>

      {/* Professionals List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando profesionales...</div>
        ) : professionals.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay profesionales registrados
          </div>
        ) : (
          <div className="divide-y">
            {professionals.map((professional: Professional) => (
              <div key={professional.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 w-full">
                    <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-bold ${professional.is_active ? 'bg-primary' : 'bg-gray-400'
                      }`}>
                      {professional.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 truncate">
                          Dr. {professional.name}
                        </h3>
                        {professional.is_active ? (
                          <CheckCircle className="text-green-500 shrink-0" size={16} />
                        ) : (
                          <XCircle className="text-gray-400 shrink-0" size={16} />
                        )}
                      </div>
                      <div className="text-sm text-gray-500 font-medium truncate">
                        {professional.specialty || 'Sin especialidad'}
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1">
                        {professional.email && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-400 truncate">
                            <Mail size={12} className="shrink-0" /> {professional.email}
                          </span>
                        )}
                        {professional.phone && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Phone size={12} className="shrink-0" /> {professional.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-none border-gray-100">
                    <div className="text-left sm:text-right">
                      <div className="flex items-center gap-1 text-xs font-medium text-gray-500">
                        <Clock size={14} />
                        {getTotalSlots(professional.availability)} bloques
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(professional)}
                        className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 sm:border-none"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(professional)}
                        className={`p-2 rounded-lg transition-colors border sm:border-none ${professional.is_active
                          ? 'text-gray-600 hover:text-red-600 hover:bg-red-50 border-gray-200'
                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50 border-gray-200'
                          }`}
                      >
                        {professional.is_active ? <XCircle size={18} /> : <CheckCircle size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Availability Preview */}
                {professional.availability && getTotalSlots(professional.availability) > 0 && (
                  <div className="mt-3 sm:ml-16">
                    <button
                      onClick={() => toggleDay(professional.id, 'toggle')}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                    >
                      <Calendar size={14} />
                      Ver disponibilidad
                      {(expandedDays[professional.id] || []).includes('toggle') ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                    {(expandedDays[professional.id] || []).includes('toggle') && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DAYS.map(day => {
                          const slots = professional.availability?.[day.key as keyof ProfessionalAvailability];
                          if (slots && slots.length > 0) {
                            return (
                              <span key={day.key} className="text-xs bg-secondary text-primary px-2 py-1 rounded">
                                {day.label}: {slots.map((s: TimeSlot) => `${s.start}-${s.end}`).join(', ')}
                              </span>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal - Enhanced Nexus UI */}
      {editingProfessional !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-4 md:p-8 animate-in fade-in duration-300">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl w-full max-w-5xl shadow-2xl border border-white/20 overflow-hidden transform animate-in slide-in-from-bottom-4 duration-300 my-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  {editingProfessional.id ? <Edit size={24} /> : <Plus size={24} />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingProfessional.id ? `Editar Perfil: Dr. ${editingProfessional.name}` : 'Nuevo Profesional'}
                  </h2>
                  <p className="text-sm text-gray-500">Completa la información del staff médico</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Information Sections Column */}
                <div className="lg:col-span-7 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Basic Info Section */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <ClipboardList size={16} /> Datos Principales
                      </h3>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Nombre Completo <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                          placeholder="Ej: Juan Pérez"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Especialidad
                        </label>
                        <select
                          value={formData.specialty}
                          onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                        >
                          <option value="">Seleccionar...</option>
                          {SPECIALTIES.map(spec => (
                            <option key={spec} value={spec}>{spec}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Matrícula
                        </label>
                        <input
                          type="text"
                          value={formData.license_number}
                          onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                          placeholder="MN 12345"
                        />
                      </div>
                    </div>

                    {/* Contact Section */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Mail size={16} /> Contacto & Estado
                      </h3>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          E-mail
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                          placeholder="doctor@clinica.com"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-sm"
                          placeholder="+54 9..."
                        />
                      </div>

                      <div className="pt-2">
                        <label className="relative flex items-center p-3 border border-gray-100 rounded-xl bg-gray-50/50 cursor-pointer hover:bg-white transition-colors">
                          <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="w-4 h-4 text-primary rounded-lg border-gray-300 focus:ring-primary/20"
                          />
                          <div className="ml-2">
                            <span className="block text-xs font-bold text-gray-900">Activo</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Availability Section Column */}
                <div className="lg:col-span-5 h-full border-l lg:border-l border-gray-100 lg:pl-6">
                  <div className="sticky top-0 bg-white/90 backdrop-blur-sm pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock size={16} /> Disponibilidad
                      </h3>
                    </div>
                    <p className="text-[10px] text-gray-500 italic mb-4">
                      Intervalos para el bot de IA por WhatsApp.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {DAYS.map(day => (
                      <div key={day.key} className="group border border-gray-100 rounded-xl overflow-hidden hover:border-primary/30 transition-all bg-white">
                        <button
                          type="button"
                          onClick={() => toggleDay(-1, day.key)}
                          className={`w-full flex items-center justify-between p-2.5 transition-colors ${formData.availability[day.key as keyof ProfessionalAvailability]?.length > 0
                            ? 'bg-primary/5' : 'bg-gray-50/50'
                            }`}
                        >
                          <span className={`font-bold text-[11px] ${formData.availability[day.key as keyof ProfessionalAvailability]?.length > 0
                            ? 'text-primary' : 'text-gray-600'
                            }`}>{day.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-medium">
                              {formData.availability[day.key as keyof ProfessionalAvailability]?.length || 0} slots
                            </span>
                            <ChevronDown size={12} className="text-gray-400 group-hover:text-primary" />
                          </div>
                        </button>

                        {(expandedDays[-1] || []).includes(day.key) && (
                          <div className="p-2 space-y-1.5 bg-white animate-in slide-in-from-top-1 duration-200">
                            {formData.availability[day.key as keyof ProfessionalAvailability]?.map((slot: TimeSlot, index: number) => (
                              <div key={index} className="flex items-center gap-1.5 group/slot">
                                <div className="flex-1 flex gap-1">
                                  <input
                                    type="time"
                                    value={slot.start}
                                    onChange={(e) => updateTimeSlot(day.key, index, 'start', e.target.value)}
                                    className="flex-1 px-1.5 py-1 bg-gray-50 border-none rounded-lg text-[10px] font-semibold focus:ring-1 focus:ring-primary outline-none"
                                  />
                                  <span className="text-gray-300 self-center text-[10px]">-</span>
                                  <input
                                    type="time"
                                    value={slot.end}
                                    onChange={(e) => updateTimeSlot(day.key, index, 'end', e.target.value)}
                                    className="flex-1 px-1.5 py-1 bg-gray-50 border-none rounded-lg text-[10px] font-semibold focus:ring-1 focus:ring-primary outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeTimeSlot(day.key, index)}
                                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addTimeSlot(day.key)}
                              className="w-full py-1 border border-dashed border-gray-200 rounded-lg text-[10px] font-bold text-gray-400 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all mt-1"
                            >
                              + Slot
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-100 bg-white/50 sticky bottom-0">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-2 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2"
                >
                  <Save size={18} />
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
