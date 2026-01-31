import { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, Edit2, Save, X, Zap, Shield, Heart, Activity, Stethoscope } from 'lucide-react';
import api from '../api/axios';

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

// Complexity colors
const complexityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  high: { bg: 'bg-red-100', text: 'text-red-800' },
  emergency: { bg: 'bg-orange-100', text: 'text-orange-800' },
};

export default function TreatmentsView() {
  const [treatments, setTreatments] = useState<TreatmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TreatmentType>>({});
  const [saving, setSaving] = useState(false);

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
      await api.put(`/admin/treatment-types/${code}`, {
        name: editForm.name,
        description: editForm.description,
        default_duration_minutes: editForm.default_duration_minutes,
        min_duration_minutes: editForm.min_duration_minutes,
        max_duration_minutes: editForm.max_duration_minutes,
        complexity_level: editForm.complexity_level,
        category: editForm.category,
        requires_multiple_sessions: editForm.requires_multiple_sessions,
        session_gap_days: editForm.session_gap_days,
        is_active: editForm.is_active,
        is_available_for_booking: editForm.is_available_for_booking,
        internal_notes: editForm.internal_notes,
      });
      
      await fetchTreatments();
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error saving treatment:', error);
      alert('Error al guardar cambios');
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
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Configuración de Tratamientos</h1>
        <p className="text-gray-500">Definir duraciones y complejidad para agENDAMIENTO inteligente</p>
      </div>

      {/* Quick Reference */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">📋 Duraciones Recomendadas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-blue-600" />
            <span className="text-blue-700">Consulta Urgente: <strong>15 min</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-green-600" />
            <span className="text-green-700">Limpieza: <strong>30 min</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-red-600" />
            <span className="text-red-700">Endodoncia: <strong>60 min</strong></span>
          </div>
        </div>
      </div>

      {/* Treatments by Category */}
      {loading ? (
        <div className="p-8 text-center text-gray-500">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4 mx-auto"></div>
          <p>Cargando configuraciones...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTreatments).map(([category, categoryTreatments]) => (
            <div key={category} className="bg-white rounded-lg shadow">
              <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
                {categoryIcons[category] || <Stethoscope size={16} className="text-gray-600" />}
                <h2 className="font-semibold text-gray-700 capitalize">{category}</h2>
                <span className="text-sm text-gray-500">({categoryTreatments.length} tratamientos)</span>
              </div>
              
              <div className="divide-y">
                {categoryTreatments.map((treatment) => (
                  <div key={treatment.id} className="p-4">
                    {editingId === treatment.id ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                            <input
                              type="text"
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                            <input
                              type="text"
                              value={editForm.code || ''}
                              disabled
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                          <textarea
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>

                        {/* Duration Settings */}
                        <div className="p-4 bg-yellow-50 rounded-lg">
                          <h4 className="font-medium text-yellow-800 mb-3 flex items-center gap-2">
                            <Clock size={16} />
                            Configuración de Duración (minutos)
                          </h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs text-yellow-700 mb-1">Mínima</label>
                              <input
                                type="number"
                                value={editForm.min_duration_minutes || ''}
                                onChange={(e) => handleDurationChange('min', e.target.value)}
                                className="w-full px-3 py-2 border border-yellow-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-yellow-700 mb-1 font-medium">Por Defecto</label>
                              <input
                                type="number"
                                value={editForm.default_duration_minutes || ''}
                                onChange={(e) => handleDurationChange('default', e.target.value)}
                                className="w-full px-3 py-2 border border-yellow-400 rounded-lg font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-yellow-700 mb-1">Máxima</label>
                              <input
                                type="number"
                                value={editForm.max_duration_minutes || ''}
                                onChange={(e) => handleDurationChange('max', e.target.value)}
                                className="w-full px-3 py-2 border border-yellow-300 rounded-lg"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Complejidad</label>
                            <select
                              value={editForm.complexity_level || 'medium'}
                              onChange={(e) => setEditForm({ ...editForm, complexity_level: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <option value="low">Baja</option>
                              <option value="medium">Media</option>
                              <option value="high">Alta</option>
                              <option value="emergency">Urgencia</option>
                            </select>
                          </div>
                          <div className="flex items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.requires_multiple_sessions || false}
                                onChange={(e) => setEditForm({ ...editForm, requires_multiple_sessions: e.target.checked })}
                                className="w-4 h-4 text-primary border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">Requiere múltiples sesiones</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.is_active || false}
                                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                                className="w-4 h-4 text-primary border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">Activo</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.is_available_for_booking || false}
                                onChange={(e) => setEditForm({ ...editForm, is_available_for_booking: e.target.checked })}
                                className="w-4 h-4 text-primary border-gray-300 rounded"
                              />
                              <span className="text-sm text-gray-700">Disponible</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex justify-end gap-3">
                          <button
                            onClick={handleCancel}
                            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                          >
                            <X size={18} />
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleSave(treatment.code)}
                            disabled={saving}
                            className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-dark flex items-center gap-2"
                          >
                            <Save size={18} />
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-medium text-gray-800">{treatment.name}</h3>
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${complexityColors[treatment.complexity_level]?.bg} ${complexityColors[treatment.complexity_level]?.text}`}>
                              {treatment.complexity_level}
                            </span>
                            {treatment.requires_multiple_sessions && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">
                                <CheckCircle size={12} />
                                Múltiples sesiones
                              </span>
                            )}
                          </div>
                          
                          {treatment.description && (
                            <p className="text-sm text-gray-600 mb-3">{treatment.description}</p>
                          )}
                          
                          <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-gray-400" />
                              <span className="text-gray-600">
                                <strong>{treatment.default_duration_minutes}</strong> min (por defecto)
                              </span>
                            </div>
                            <div className="text-gray-400">|</div>
                            <div className="text-gray-500">
                              Rango: {treatment.min_duration_minutes} - {treatment.max_duration_minutes} min
                            </div>
                            {treatment.session_gap_days > 0 && (
                              <>
                                <div className="text-gray-400">|</div>
                                <div className="text-gray-500">
                                  {treatment.session_gap_days} días entre sesiones
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 mt-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                              treatment.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {treatment.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                              treatment.is_available_for_booking ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {treatment.is_available_for_booking ? 'Disponible' : 'No disponible'}
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleEdit(treatment)}
                          className="p-2 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                          title="Editar configuración"
                        >
                          <Edit2 size={18} />
                        </button>
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
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg shadow">
          <AlertCircle size={48} className="mx-auto mb-4 text-gray-300" />
          <p>No hay configuraciones de tratamientos disponibles.</p>
          <p className="text-sm mt-2">Ejecuta la migración 006_treatment_config.sql para crear los tratamientos por defecto.</p>
        </div>
      )}
    </div>
  );
}
