import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit, Trash2, X, FileText, Brain, Calendar, User, Clock, Stethoscope } from 'lucide-react';
import api from '../api/axios';
import { useTranslation } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

interface Patient {
  id: number;
  first_name: string;
  last_name?: string;
  phone_number: string;
  email?: string;
  obra_social?: string;
  dni?: string;
  created_at: string;
  status?: string;
  health_conditions?: string[];
}

interface TreatmentType {
  code: string;
  name: string;
  description: string;
  category: string;
}

interface Professional {
  id: number;
  first_name: string;
  last_name?: string;
  specialty?: string;
  is_active: boolean;
}

export default function PatientsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [semanticSearchTerm, setSemanticSearchTerm] = useState('');
  const [semanticResults, setSemanticResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [treatments, setTreatments] = useState<TreatmentType[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  const [formData, setFormData] = useState({
    first_name: '', last_name: '', phone_number: '', email: '', obra_social: '', dni: '',
  });

  const [appointmentData, setAppointmentData] = useState({
    treatment_code: '', professional_id: '', date: '', time: ''
  });

  useEffect(() => { fetchPatients(); fetchResources(); }, []);

  useEffect(() => {
    const filtered = patients.filter((patient) => {
      const s = searchTerm.toLowerCase();
      return (
        (patient.first_name || '').toLowerCase().includes(s) ||
        (patient.last_name || '').toLowerCase().includes(s) ||
        (patient.phone_number || '').includes(searchTerm) ||
        (patient.dni || '').includes(searchTerm) ||
        (patient.email || '').toLowerCase().includes(s)
      );
    });
    setFilteredPatients(filtered);
  }, [searchTerm, patients]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/patients');
      setPatients(response.data);
      setFilteredPatients(response.data);
    } catch (error) { console.error('Error fetching patients:', error); }
    finally { setLoading(false); }
  };

  const fetchResources = async () => {
    try {
      const [treatResponse, profResponse] = await Promise.all([
        api.get('/admin/treatment-types'), api.get('/admin/professionals')
      ]);
      setTreatments(treatResponse.data);
      setProfessionals((profResponse.data || []).filter((p: Professional) => p.is_active));
    } catch (error) { console.error('Error fetching resources:', error); }
  };

  const handleSemanticSearch = async (value: string) => {
    setSemanticSearchTerm(value);
    if (!value.trim()) { setSemanticResults([]); setFilteredPatients(patients); return; }
    setSemanticLoading(true);
    try {
      const response = await api.get('/admin/patients/search-semantic', { params: { query: value } });
      setSemanticResults(response.data);
      if (response.data.length > 0) setFilteredPatients(response.data);
    } catch (error) { console.error('Error in semantic search:', error); setSemanticResults([]); setFilteredPatients(patients); }
    finally { setSemanticLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData, insurance: formData.obra_social };
      let patientId;
      if (editingPatient) {
        await api.put(`/admin/patients/${editingPatient.id}`, payload);
        patientId = editingPatient.id;
      } else {
        const res = await api.post('/admin/patients', payload);
        patientId = res.data.id;
      }
      if (!editingPatient && appointmentData.treatment_code && appointmentData.professional_id && appointmentData.date && appointmentData.time) {
        try {
          const aptDate = new Date(`${appointmentData.date}T${appointmentData.time}`);
          await api.post('/admin/appointments', {
            patient_id: patientId, professional_id: parseInt(appointmentData.professional_id),
            appointment_datetime: aptDate.toISOString(), appointment_type: appointmentData.treatment_code,
            notes: "Turno inicial (Alta manual)", check_collisions: true
          });
          alert(t('alerts.patient_and_appointment_ok'));
        } catch (aptError) { console.error("Error creating appointment:", aptError); alert(t('alerts.patient_ok_appointment_fail')); }
      }
      fetchPatients(); closeModal();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((x: any) => x?.msg || x).join(', ') : t('alerts.error_save_patient');
      alert(msg || t('alerts.error_save_patient'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('alerts.confirm_delete_patient'))) return;
    try { await api.delete(`/admin/patients/${id}`); fetchPatients(); }
    catch (error) { console.error('Error deleting patient:', error); alert(t('alerts.error_delete_patient')); }
  };

  const openEditModal = (patient: Patient) => {
    setEditingPatient(patient);
    setFormData({ first_name: patient.first_name || '', last_name: patient.last_name || '', phone_number: patient.phone_number || '', email: patient.email || '', obra_social: patient.obra_social || '', dni: patient.dni || '' });
    setAppointmentData({ treatment_code: '', professional_id: '', date: '', time: '' });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingPatient(null);
    setFormData({ first_name: '', last_name: '', phone_number: '', email: '', obra_social: '', dni: '' });
    setAppointmentData({ treatment_code: '', professional_id: '', date: '', time: '' });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingPatient(null); };

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto">
      <PageHeader
        title={t('patients.title')}
        subtitle={t('patients.subtitle')}
        icon={<User size={22} />}
        action={
          <button
            onClick={openCreateModal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-900 px-4 py-2.5 rounded-xl transition-all text-sm font-medium shadow-lg hover:scale-105 active:scale-95"
          >
            <Plus size={20} />
            {t('patients.new_patient')}
          </button>
        }
      />

      {/* Search */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30" size={18} />
          <input
            type="text"
            placeholder={t('patients.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20"
          />
        </div>
        <div className="relative">
          <Brain className="absolute left-3 top-1/2 transform -translate-y-1/2 text-violet-400" size={18} />
          <input
            type="text"
            placeholder={t('patients.search_semantic')}
            value={semanticSearchTerm}
            onChange={(e) => handleSemanticSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-violet-500/[0.04] border border-violet-500/20 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
          />
          {semanticLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <GlassCard padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-white/40">{t('patients.loading')}</div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-8 text-center text-white/40">{t('patients.no_patients_found')}</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Paciente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Contacto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">{t('patients.dni_obra_social')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">{t('patients.health')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">{t('patients.date_added')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">{t('patients.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-400 font-medium">
                            {patient.first_name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="ml-4">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-white">{patient.first_name} {patient.last_name}</div>
                              {semanticResults.some(r => r.id === patient.id) && <Brain size={16} className="text-violet-400" />}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white/70">{patient.phone_number}</div>
                        <div className="text-sm text-white/40">{patient.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white/70">{patient.dni || '-'}</div>
                        <div className="text-sm text-white/40">{patient.obra_social || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white/40">-</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white/40">
                        {new Date(patient.created_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => navigate(`/pacientes/${patient.id}`)} className="p-2 text-white/40 hover:text-blue-400 hover:bg-white/[0.04] rounded-xl transition-colors" title={t('patients.view_chart')}><FileText size={18} /></button>
                          <button onClick={() => openEditModal(patient)} className="p-2 text-white/40 hover:text-blue-400 hover:bg-white/[0.04] rounded-xl transition-colors" title={t('common.edit')}><Edit size={18} /></button>
                          <button onClick={() => handleDelete(patient.id)} className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors" title={t('common.delete')}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {filteredPatients.map((patient) => (
                <div key={patient.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-500/20 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-400 font-medium shrink-0">
                        {patient.first_name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white truncate">{patient.first_name} {patient.last_name}</h3>
                          {semanticResults.some(r => r.id === patient.id) && <Brain size={14} className="text-violet-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-white/40 truncate">DNI: {patient.dni || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/pacientes/${patient.id}`)} className="p-2 text-white/40 hover:text-blue-400 rounded-xl"><FileText size={18} /></button>
                      <button onClick={() => openEditModal(patient)} className="p-2 text-white/40 hover:text-blue-400 rounded-xl"><Edit size={18} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/50 mb-3 bg-white/[0.02] p-2 rounded-xl">
                    <div>
                      <span className="block text-[10px] text-white/30 uppercase font-semibold">{t('patients.phone_label')}</span>
                      {patient.phone_number}
                    </div>
                    <div>
                      <span className="block text-[10px] text-white/30 uppercase font-semibold">{t('patients.obra_social')}</span>
                      {patient.obra_social || '-'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] text-white/30">Cargado el {new Date(patient.created_at).toLocaleDateString('es-AR')}</span>
                    <button onClick={() => handleDelete(patient.id)} className="text-xs text-red-400 font-medium px-2 py-1 hover:bg-red-500/10 rounded-lg">{t('common.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </GlassCard>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-surface-2 border border-white/[0.08] rounded-2xl w-full max-w-2xl mx-4 my-8 animate-modal-in">
            <div className="flex justify-between items-center p-5 border-b border-white/[0.06] sticky top-0 bg-surface-2 z-10">
              <h2 className="text-lg font-bold text-white">
                {editingPatient ? t('patients.edit_patient') : t('patients.new_patient')}
              </h2>
              <button onClick={closeModal} className="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06]"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Personal Data */}
                <div>
                  <h3 className="text-base font-medium text-white mb-4 flex items-center gap-2">
                    <User size={18} className="text-blue-400" /> {t('patients.personal_data')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: t('patients.first_name_req'), key: 'first_name', required: true, type: 'text' },
                      { label: t('patients.last_name_req'), key: 'last_name', required: true, type: 'text' },
                      { label: t('patients.phone_req'), key: 'phone_number', required: true, type: 'tel' },
                      { label: t('patients.dni'), key: 'dni', required: false, type: 'text' },
                      { label: t('patients.email'), key: 'email', required: false, type: 'email' },
                      { label: t('patients.obra_social'), key: 'obra_social', required: false, type: 'text' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="block text-sm font-medium text-white/50 mb-1">{f.label}</label>
                        <input
                          type={f.type}
                          required={f.required}
                          value={(formData as any)[f.key]}
                          onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Appointment (new only) */}
                {!editingPatient && (
                  <div className="bg-white/[0.02] p-4 rounded-xl border border-white/[0.06]">
                    <h3 className="text-base font-medium text-white mb-4 flex items-center gap-2">
                      <Calendar size={18} className="text-emerald-400" /> {t('patients.schedule_first_appointment')}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-white/50 mb-1">{t('patients.treatment_service')}</label>
                        <select value={appointmentData.treatment_code} onChange={(e) => setAppointmentData({ ...appointmentData, treatment_code: e.target.value })} className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm">
                          <option value="">{t('patients.select_treatment')}</option>
                          {treatments.map(tt => <option key={tt.code} value={tt.code}>{tt.name} ({tt.category})</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-white/50 mb-1">{t('agenda.professional')}</label>
                        <select value={appointmentData.professional_id} onChange={(e) => setAppointmentData({ ...appointmentData, professional_id: e.target.value })} className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm">
                          <option value="">{t('patients.select_professional')}</option>
                          {professionals.map(p => <option key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/50 mb-1">{t('patients.date')}</label>
                        <input type="date" value={appointmentData.date} onChange={(e) => setAppointmentData({ ...appointmentData, date: e.target.value })} className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/50 mb-1">{t('patients.time')}</label>
                        <input type="time" value={appointmentData.time} onChange={(e) => setAppointmentData({ ...appointmentData, time: e.target.value })} className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={closeModal} className="px-4 py-2.5 text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.08] transition-colors text-sm">{t('common.cancel')}</button>
                <button type="submit" className="px-4 py-2.5 text-gray-900 bg-white rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-medium shadow-lg">{editingPatient ? t('common.save_changes') : t('patients.create_patient')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
