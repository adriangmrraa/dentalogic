import { useState, useEffect } from 'react';
import {
  User, Plus, Edit, Clock, Calendar, Mail, Phone,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Save, X
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
      setProfessionals(response.data);
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
    setExpandedDays(prev => {
      const current = prev[professionalId] || [];
      if (current.includes(day)) {
        return { ...prev, [professionalId]: current.filter(d => d !== day) };
      }
      return { ...prev, [professionalId]: [...current, day] };
    });
  };

  const addTimeSlot = (dayKey: string) => {
    setFormData(prev => ({
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
    setFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dayKey]: prev.availability[dayKey as keyof ProfessionalAvailability].filter((_, i) => i !== index),
      },
    }));
  };

  const updateTimeSlot = (dayKey: string, index: number, field: 'start' | 'end', value: string) => {
    setFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [dayKey]: prev.availability[dayKey as keyof ProfessionalAvailability].map((slot, i) =>
          i === index ? { ...slot, [field]: value } : slot
        ),
      },
    }));
  };

  const getActiveProfessionals = () => professionals.filter(p => p.is_active).length;

  const getTotalSlots = (availability?: ProfessionalAvailability) => {
    if (!availability) return 0;
    return DAYS.reduce((total, day) => {
      return total + (availability[day.key as keyof ProfessionalAvailability]?.length || 0);
    }, 0);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Profesionales</h1>
          <p className="text-gray-500">Gestión del staff médico y disponibilidad</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          Nuevo Profesional
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-2xl font-bold">{professionals.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Activos</div>
          <div className="text-2xl font-bold text-green-600">{getActiveProfessionals()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Inactivos</div>
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
            {professionals.map((professional) => (
              <div key={professional.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${
                      professional.is_active ? 'bg-primary' : 'bg-gray-400'
                    }`}>
                      {professional.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">
                          Dr. {professional.name}
                        </h3>
                        {professional.is_active ? (
                          <CheckCircle className="text-green-500" size={16} />
                        ) : (
                          <XCircle className="text-gray-400" size={16} />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {professional.specialty || 'Sin especialidad'}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-400">
                        {professional.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={12} /> {professional.email}
                          </span>
                        )}
                        {professional.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {professional.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock size={14} />
                        {getTotalSlots(professional.availability)} bloques
                      </div>
                    </div>
                    <button
                      onClick={() => openEditModal(professional)}
                      className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(professional)}
                      className={`p-2 rounded ${
                        professional.is_active
                          ? 'text-gray-600 hover:text-red-600 hover:bg-red-50'
                          : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {professional.is_active ? <XCircle size={18} /> : <CheckCircle size={18} />}
                    </button>
                  </div>
                </div>

                {/* Availability Preview */}
                {professional.availability && getTotalSlots(professional.availability) > 0 && (
                  <div className="mt-3 ml-16">
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
                                {day.label}: {slots.map(s => `${s.start}-${s.end}`).join(', ')}
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

      {/* Modal */}
      {editingProfessional !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-2xl mx-4 my-8">
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h2 className="text-xl font-bold">
                {editingProfessional ? `Editar: Dr. ${editingProfessional.name}` : 'Nuevo Profesional'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Especialidad
                  </label>
                  <select
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Seleccionar...</option>
                    {SPECIALTIES.map(spec => (
                      <option key={spec} value={spec}>{spec}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Matrícula
                  </label>
                  <input
                    type="text"
                    value={formData.license_number}
                    onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Profesional activo</span>
                  </label>
                </div>
              </div>

              {/* Availability */}
              <div className="mb-4">
                <h3 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Clock size={18} />
                  Disponibilidad para Agendamiento
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Define los horarios disponibles. El bot de IA usará esta información para ofrecer turnos.
                </p>

                <div className="space-y-2">
                  {DAYS.map(day => (
                    <div key={day.key} className="border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleDay(-1, day.key)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100"
                      >
                        <span className="font-medium text-sm">{day.label}</span>
                        <span className="text-xs text-gray-500">
                          {formData.availability[day.key as keyof ProfessionalAvailability]?.length || 0} bloques
                        </span>
                      </button>
                      <div className="p-3 bg-white">
                        {formData.availability[day.key as keyof ProfessionalAvailability]?.map((slot, index) => (
                          <div key={index} className="flex items-center gap-2 mb-2">
                            <input
                              type="time"
                              value={slot.start}
                              onChange={(e) => updateTimeSlot(day.key, index, 'start', e.target.value)}
                              className="px-2 py-1 border rounded text-sm"
                            />
                            <span className="text-gray-400">-</span>
                            <input
                              type="time"
                              value={slot.end}
                              onChange={(e) => updateTimeSlot(day.key, index, 'end', e.target.value)}
                              className="px-2 py-1 border rounded text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeTimeSlot(day.key, index)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addTimeSlot(day.key)}
                          className="text-xs text-primary hover:underline"
                        >
                          + Agregar bloque horario
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-dark flex items-center gap-2"
                >
                  <Save size={18} />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
