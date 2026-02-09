import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, Edit2, Save, X, Zap, Shield, Heart, Activity, Stethoscope } from 'lucide-react';
import api from '../api/axios';
import { useTranslation } from '../context/LanguageContext';

interface TreatmentType {
  id: number;
  code: string;
  name: string;
  description: string;
  default_duration_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  complexity_level: string;
  category: string;
  requires_multiple_sessions: boolean;
  session_gap_days: number;
  is_active: boolean;
  is_available_for_booking: boolean;
  internal_notes: string;
}

// Category icons mapping
const categoryIcons: Record<string, React.ReactNode> = {
  prevention: <Heart size={16} className="text-green-600" />,
  restorative: <Activity size={16} className="text-blue-600" />,
  surgical: <Zap size={16} className="text-red-600" />,
  orthodontics: <Shield size={16} className="text-purple-600" />,
  emergency: <AlertCircle size={16} className="text-orange-600" />,
};

// Category icons mapping already defined

export default function TreatmentsView() {
  const { t } = useTranslation();
  const [treatments, setTreatments] = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TreatmentType>>({});
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newForm, setNewForm] = useState<Partial<TreatmentType>>({
    code: '',
    name: '',
    description: '',
    default_duration_minutes: 30,
    min_duration_minutes: 15,
    max_duration_minutes: 60,
    complexity_level: 'medium',
    category: 'restorative',
    requires_multiple_sessions: false,
    session_gap_days: 0,
    is_active: true,
    is_available_for_booking: true,
    internal_notes: ''
  });

  const fetchTreatments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/treatment-types');
      setTreatments(response.data);
    } catch (error) {
      console.error('Error fetching treatments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTreatments();
  }, []);

  const handleEdit = (treatment: TreatmentType) => {
    setEditingId(treatment.id);
    setEditForm({ ...treatment });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (code: string) => {
    if (!editForm.code) return;

    try {
      setSaving(true);
      await api.put(`/admin/treatment-types/${code}`, editForm);
      await fetchTreatments();
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error saving treatment:', error);
      alert(t('alerts.error_save_treatment'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newForm.code || !newForm.name) {
      alert(t('alerts.code_name_required'));
      return;
    }

    try {
      setSaving(true);
      await api.post('/admin/treatment-types', newForm);
      await fetchTreatments();
      setIsCreating(false);
      setNewForm({
        code: '',
        name: '',
        description: '',
        default_duration_minutes: 30,
        min_duration_minutes: 15,
        max_duration_minutes: 60,
        complexity_level: 'medium',
        category: 'restorative',
        requires_multiple_sessions: false,
        session_gap_days: 0,
        is_active: true,
        is_available_for_booking: true,
        internal_notes: ''
      });
    } catch (error: any) {
      console.error('Error creating treatment:', error);
      alert(error.response?.data?.detail || t('alerts.error_create_treatment'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(t('alerts.confirm_delete_treatment').replace('{{code}}', code))) return;

    try {
      setSaving(true);
      await api.delete(`/admin/treatment-types/${code}`);
      await fetchTreatments();
    } catch (error) {
      console.error('Error deleting treatment:', error);
      alert(t('alerts.error_delete_treatment'));
    } finally {
      setSaving(false);
    }
  };

  const handleDurationChange = (field: 'min' | 'default' | 'max', value: string) => {
    const numValue = parseInt(value) || 0;
    setEditForm(prev => ({
      ...prev,
      [field === 'min' ? 'min_duration_minutes' : field === 'default' ? 'default_duration_minutes' : 'max_duration_minutes']: numValue
    }));
  };

  // Group treatments by category
  const groupedTreatments = treatments.reduce((acc, treatment) => {
    if (!acc[treatment.category]) {
      acc[treatment.category] = [];
    }
    acc[treatment.category].push(treatment);
    return acc;
  }, {} as Record<string, TreatmentType[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent">
      {/* Scrollable Container Wrapper */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{t('treatments.title')}</h1>
            <p className="text-slate-500 font-medium">Configura la lógica de agendamiento inteligente</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-5 py-2.5 bg-medical-600 text-white rounded-xl hover:bg-medical-700 transition-all flex items-center gap-2 shadow-lg shadow-medical-900/20 active:scale-95"
          >
            <Zap size={18} fill="currentColor" />
            <span className="font-semibold text-sm">Nuevo Servicio</span>
          </button>
        </div>

        {/* Quick Reference */}
        <div className="mb-10 p-6 bg-white/40 backdrop-blur-xl border border-white/40 rounded-3xl shadow-soft">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Clock size={20} className="text-medical-600" />
            Duraciones Recomendadas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl border border-white/40 hover:border-medical-200 transition-colors">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <Clock size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Consulta Urgente</span>
                <span className="text-slate-900 font-bold text-lg">15 min</span>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl border border-white/40 hover:border-medical-200 transition-colors">
              <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                <Clock size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Limpieza Profunda</span>
                <span className="text-slate-900 font-bold text-lg">30 min</span>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl border border-white/40 hover:border-medical-200 transition-colors">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                <Clock size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Tratamiento Complejo</span>
                <span className="text-slate-900 font-bold text-lg">60 min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Create Form Section */}
        {isCreating && (
          <div className="mb-10 bg-white/70 backdrop-blur-2xl p-8 rounded-[2rem] shadow-elevated border border-white/60 animate-in fade-in slide-in-from-top-6 duration-500">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-medical-50 text-medical-600 rounded-2xl">
                  <Stethoscope size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">Crear Nuevo Tratamiento</h3>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="p-2 bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 ml-1">Nombre</label>
                <input
                  type="text"
                  value={newForm.name || ''}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="Ej: Limpieza Profunda"
                  className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all placeholder:text-slate-300 font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 ml-1">Código (Único)</label>
                <input
                  type="text"
                  value={newForm.code || ''}
                  onChange={(e) => setNewForm({ ...newForm, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="ej: limpieza_profunda"
                  className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all placeholder:text-slate-300 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 ml-1">Categoría</label>
                <div className="relative">
                  <select
                    value={newForm.category || 'restorative'}
                    onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all appearance-none cursor-pointer font-medium text-slate-700"
                  >
                    <option value="prevention">Prevención / Higiene</option>
                    <option value="restorative">Operatoria / Restauración</option>
                    <option value="surgical">Cirugía</option>
                    <option value="orthodontics">Ortodoncia</option>
                    <option value="emergency">Urgencia</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Activity size={18} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 ml-1">Descripción</label>
                <textarea
                  value={newForm.description || ''}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  placeholder="Describe brevemente el procedimiento..."
                  className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all placeholder:text-slate-300 resize-none font-medium h-[116px]"
                ></textarea>
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Duración (min)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newForm.default_duration_minutes || ''}
                      onChange={(e) => setNewForm({ ...newForm, default_duration_minutes: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all font-bold text-slate-700"
                    />
                    <Clock size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Complejidad</label>
                  <select
                    value={newForm.complexity_level || 'medium'}
                    onChange={(e) => setNewForm({ ...newForm, complexity_level: e.target.value })}
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all appearance-none cursor-pointer font-bold text-slate-700"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
                <div className="flex items-center pt-8">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={newForm.requires_multiple_sessions || false}
                        onChange={(e) => setNewForm({ ...newForm, requires_multiple_sessions: e.target.checked })}
                        className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white/50 transition-all checked:bg-medical-600 checked:border-medical-600 shadow-sm"
                      />
                      <CheckCircle className="absolute hidden h-4 w-4 text-white peer-checked:block left-1" />
                    </div>
                    <span className="text-xs font-bold text-slate-500 group-hover:text-medical-600 transition-colors">Sesiones Múltiples</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-4">
              <button
                onClick={() => setIsCreating(false)}
                className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-10 py-3 bg-medical-600 text-white rounded-2xl font-bold shadow-lg shadow-medical-900/20 hover:bg-medical-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : <Save size={20} />}
                {saving ? 'Guardando...' : 'Crear Tratamiento'}
              </button>
            </div>
          </div>
        )}

        {/* Treatments by Category */}
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-medical-100 border-t-medical-600 rounded-full animate-spin mb-6"></div>
            <p className="font-bold text-slate-400 text-lg">Sincronizando servicios médicos...</p>
          </div>
        ) : (
          <div className="space-y-12 pb-20">
            {Object.entries(groupedTreatments).map(([category, categoryTreatments]) => (
              <div key={category} className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] shadow-soft border border-white/40 overflow-hidden group">
                <div className="p-6 border-b border-white/20 bg-white/30 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md transition-colors group-hover:bg-white/50">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-white/60">
                      {categoryIcons[category] || <Stethoscope size={24} className="text-slate-600" />}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-800 text-xl capitalize tracking-tight">{category}</h2>
                      <span className="text-[10px] text-medical-600 font-bold uppercase tracking-widest">{categoryTreatments.length} Servicios Activos</span>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-white/20">
                  {categoryTreatments.map((treatment) => (
                    <div key={treatment.id} className="p-6 hover:bg-white/20 transition-all">
                      {editingId === treatment.id ? (
                        // Edit Mode
                        <div className="space-y-6 bg-white/60 p-6 rounded-3xl border border-medical-100 shadow-sm animate-in fade-in zoom-in-95 duration-300">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-slate-500 ml-1 uppercase">Nombre del Servicio</label>
                              <input
                                type="text"
                                value={editForm.name || ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all font-semibold"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-slate-500 ml-1 uppercase">Código de Referencia</label>
                              <input
                                type="text"
                                value={editForm.code || ''}
                                disabled
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 font-mono text-sm cursor-not-allowed"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-500 ml-1 uppercase">Descripción Clínica</label>
                            <textarea
                              value={editForm.description || ''}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={2}
                              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none transition-all resize-none font-medium text-slate-600"
                            />
                          </div>

                          {/* Duration Settings */}
                          <div className="p-6 bg-medical-50/50 rounded-2xl border border-medical-100/50">
                            <h4 className="text-xs font-bold text-medical-800 mb-4 flex items-center gap-2 uppercase tracking-widest">
                              <Clock size={14} />
                              Configuración de Tiempos (Minutos)
                            </h4>
                            <div className="grid grid-cols-3 gap-6">
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-medical-600 uppercase">Mínima</label>
                                <input
                                  type="number"
                                  value={editForm.min_duration_minutes || ''}
                                  onChange={(e) => handleDurationChange('min', e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-medical-100 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none font-bold text-medical-800 text-center"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-medical-700 uppercase">Default</label>
                                <input
                                  type="number"
                                  value={editForm.default_duration_minutes || ''}
                                  onChange={(e) => handleDurationChange('default', e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-medical-200 rounded-lg focus:ring-4 focus:ring-medical-400/20 outline-none font-bold text-medical-900 text-center text-lg shadow-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-medical-600 uppercase">Máxima</label>
                                <input
                                  type="number"
                                  value={editForm.max_duration_minutes || ''}
                                  onChange={(e) => handleDurationChange('max', e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-medical-100 rounded-lg focus:ring-2 focus:ring-medical-400 outline-none font-bold text-medical-800 text-center"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-slate-500 ml-1 uppercase">Nivel de Complejidad</label>
                              <select
                                value={editForm.complexity_level || 'medium'}
                                onChange={(e) => setEditForm({ ...editForm, complexity_level: e.target.value })}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-medical-500/10 focus:border-medical-500 outline-none appearance-none font-bold text-slate-700"
                              >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="emergency">Urgencia</option>
                              </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-6">
                              <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.requires_multiple_sessions || false}
                                    onChange={(e) => setEditForm({ ...editForm, requires_multiple_sessions: e.target.checked })}
                                    className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white transition-all checked:bg-purple-600 checked:border-purple-600 shadow-sm"
                                  />
                                  <CheckCircle className="absolute hidden h-4 w-4 text-white peer-checked:block left-1" />
                                </div>
                                <span className="text-sm font-bold text-slate-500 group-hover:text-purple-600 transition-colors">Sesiones Múltiples</span>
                              </label>

                              <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.is_active || false}
                                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                                    className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white transition-all checked:bg-green-600 checked:border-green-600 shadow-sm"
                                  />
                                  <CheckCircle className="absolute hidden h-4 w-4 text-white peer-checked:block left-1" />
                                </div>
                                <span className="text-sm font-bold text-slate-500 group-hover:text-green-600 transition-colors">Activo</span>
                              </label>

                              <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.is_available_for_booking || false}
                                    onChange={(e) => setEditForm({ ...editForm, is_available_for_booking: e.target.checked })}
                                    className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white transition-all checked:bg-blue-600 checked:border-blue-600 shadow-sm"
                                  />
                                  <CheckCircle className="absolute hidden h-4 w-4 text-white peer-checked:block left-1" />
                                </div>
                                <span className="text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors">En Catálogo</span>
                              </label>
                            </div>
                          </div>

                          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <button
                              onClick={handleCancel}
                              className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleSave(treatment.code)}
                              disabled={saving}
                              className="px-8 py-2.5 bg-medical-600 text-white rounded-xl font-bold shadow-lg shadow-medical-900/20 hover:bg-medical-700 transition-all active:scale-95 flex items-center gap-2"
                            >
                              {saving ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : <Save size={18} />}
                              {saving ? 'Sincronizando...' : 'Actualizar Servicio'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex items-start justify-between group/item">
                          <div className="flex-1">
                            <div className="flex items-center flex-wrap gap-3 mb-3">
                              <h3 className="font-bold text-slate-800 text-lg tracking-tight">{treatment.name}</h3>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${treatment.complexity_level === 'high' ? 'bg-red-50 text-red-600 border-red-100' :
                                treatment.complexity_level === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                  'bg-green-50 text-green-600 border-green-100'
                                }`}>
                                {treatment.complexity_level}
                              </span>
                              {treatment.requires_multiple_sessions && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-purple-50 text-purple-600 border border-purple-100">
                                  <CheckCircle size={10} />
                                  Múltiples Sesiones
                                </span>
                              )}
                              {!treatment.is_active && (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 border border-slate-200">
                                  Inactivo
                                </span>
                              )}
                            </div>

                            {treatment.description && (
                              <p className="text-slate-500 text-sm leading-relaxed mb-4 max-w-2xl font-medium">{treatment.description}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-y-2 gap-x-8">
                              <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-medical-50 text-medical-600 rounded-lg">
                                  <Clock size={14} />
                                </div>
                                <span className="text-slate-600 text-sm font-semibold">
                                  <strong className="text-slate-900 text-base">{treatment.default_duration_minutes}</strong> min <span className="text-slate-400 font-medium">estándar</span>
                                </span>
                              </div>
                              <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                              <div className="flex items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-tight">
                                <span>Min: <span className="text-slate-700">{treatment.min_duration_minutes}m</span></span>
                                <span>Max: <span className="text-slate-700">{treatment.max_duration_minutes}m</span></span>
                              </div>
                              {treatment.session_gap_days > 0 && (
                                <div className="flex items-center gap-2 text-xs font-bold text-purple-500 uppercase tracking-tight">
                                  <Activity size={12} />
                                  <span>{treatment.session_gap_days} días de gap</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 opacity-0 group-hover/item:opacity-100 transition-all translate-x-2 group-hover/item:translate-x-0">
                            <button
                              onClick={() => handleEdit(treatment)}
                              className="p-3 text-slate-400 hover:text-medical-600 hover:bg-medical-50 rounded-2xl transition-all shadow-sm bg-white/50 border border-white"
                              title="Editar"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(treatment.code)}
                              className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all shadow-sm bg-white/50 border border-white"
                              title="Eliminar"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && treatments.length === 0 && (
          <div className="p-20 text-center bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/40 shadow-soft animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-medical-50 text-medical-200 rounded-full flex items-center justify-center mx-auto mb-8">
              <Activity size={48} strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-3">No hay tratamientos definidos</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-8 font-medium">
              Comienza configurando tu primer servicio médico para habilitar el agendamiento inteligente.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-8 py-4 bg-medical-600 text-white rounded-2xl font-bold shadow-lg shadow-medical-900/20 hover:bg-medical-700 transition-all flex items-center gap-2 mx-auto active:scale-95"
            >
              <Zap size={20} fill="currentColor" />
              Configurar Primer Servicio
            </button>
            <div className="mt-12 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 inline-block text-blue-600 text-xs font-bold uppercase tracking-widest">
              Tip: Revisa la migración 006_treatment_config.sql
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
