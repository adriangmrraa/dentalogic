import { useState, useEffect } from 'react';
import {
  Plus, Search, Edit2, Trash2, X, Eye, MessageSquare,
  CheckCircle2, Clock, XCircle, Filter
} from 'lucide-react';
import api from '../api/axios';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

/* ───────── Types ───────── */

type TemplateCategory = 'utility' | 'marketing' | 'authentication';
type TemplateStatus = 'approved' | 'pending' | 'rejected';

interface Template {
  id: number;
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  status: TemplateStatus;
  created_at: string;
  updated_at?: string;
}

/* ───────── Config ───────── */

const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; color: string }> = {
  utility:        { label: 'Utilidad',       color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  marketing:      { label: 'Marketing',      color: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  authentication: { label: 'Autenticacion',  color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
};

const STATUS_CONFIG: Record<TemplateStatus, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: 'Aprobado',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', icon: <CheckCircle2 size={12} /> },
  pending:  { label: 'Pendiente', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',       icon: <Clock size={12} /> },
  rejected: { label: 'Rechazado', color: 'bg-red-500/15 text-red-400 border-red-500/25',             icon: <XCircle size={12} /> },
};

/* ───────── Helpers ───────── */

/** Renders template body with {{variables}} highlighted in violet */
function TemplateBody({ body, className = '' }: { body: string; className?: string }) {
  const parts = body.split(/(\{\{[^}]+\}\})/g);
  return (
    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) =>
        /^\{\{[^}]+\}\}$/.test(part) ? (
          <span key={i} className="bg-violet-500/20 text-violet-300 px-1 py-0.5 rounded font-mono text-xs">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

/* ───────── Component ───────── */

export default function MetaTemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<TemplateCategory | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  /* Form modal */
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'utility' as TemplateCategory,
    language: 'es',
    body: '',
  });

  /* Preview modal */
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  /* ── Fetch ── */

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/templates');
      setTemplates(res.data ?? []);
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  /* ── Filtered list ── */

  const filtered = templates.filter((t) => {
    const matchCategory = !filterCategory || t.category === filterCategory;
    const s = searchTerm.toLowerCase();
    const matchSearch = !s || t.name.toLowerCase().includes(s) || t.body.toLowerCase().includes(s);
    return matchCategory && matchSearch;
  });

  /* ── CRUD ── */

  const openCreate = () => {
    setEditingTemplate(null);
    setFormData({ name: '', category: 'utility', language: 'es', body: '' });
    setShowForm(true);
  };

  const openEdit = (tpl: Template) => {
    setEditingTemplate(tpl);
    setFormData({
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      body: tpl.body,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await api.put(`/admin/templates/${editingTemplate.id}`, formData);
      } else {
        await api.post('/admin/templates', formData);
      }
      setShowForm(false);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Error al guardar template';
      alert(msg);
    }
  };

  const handleDelete = async (tpl: Template) => {
    if (!confirm(`Eliminar template "${tpl.name}"?`)) return;
    try {
      await api.delete(`/admin/templates/${tpl.id}`);
      fetchTemplates();
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  /* ── Render ── */

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto isolate">
      <PageHeader
        title="Templates de Mensajes"
        subtitle="WhatsApp / Meta Business templates"
        icon={<MessageSquare size={22} />}
        action={
          <button
            onClick={openCreate}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-900 px-4 py-2.5 rounded-xl transition-all text-sm font-medium shadow-lg hover:scale-105 active:scale-95"
          >
            <Plus size={18} />
            Nuevo Template
          </button>
        }
      />

      {/* ── Filters ── */}
      <GlassCard className="mb-6" hover={false}>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar por nombre o contenido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>

          {/* Category */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as TemplateCategory | '')}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="" className="bg-gray-900">Todas las categorias</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key} className="bg-gray-900">{cfg.label}</option>
            ))}
          </select>
        </div>
      </GlassCard>

      {/* ── Template grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-white/40 text-sm">Cargando templates...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-white/40 text-sm">No se encontraron templates</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((tpl) => {
            const catCfg = CATEGORY_CONFIG[tpl.category] ?? CATEGORY_CONFIG.utility;
            const stsCfg = STATUS_CONFIG[tpl.status] ?? STATUS_CONFIG.pending;
            return (
              <GlassCard key={tpl.id} hover={true} className="flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-white font-semibold text-sm truncate">{tpl.name}</h3>
                    <span className="text-white/40 text-xs">{tpl.language.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border ${stsCfg.color}`}>
                      {stsCfg.icon} {stsCfg.label}
                    </span>
                  </div>
                </div>

                {/* Category badge */}
                <div className="mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${catCfg.color}`}>
                    {catCfg.label}
                  </span>
                </div>

                {/* Body preview */}
                <div className="flex-1 mb-4 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                  <TemplateBody body={tpl.body.length > 180 ? tpl.body.slice(0, 180) + '...' : tpl.body} className="text-white/70" />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-2 border-t border-white/[0.06]">
                  <button
                    onClick={() => setPreviewTemplate(tpl)}
                    title="Vista previa"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Eye size={14} /> Preview
                  </button>
                  <button
                    onClick={() => openEdit(tpl)}
                    title="Editar"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-blue-400 hover:bg-white/[0.06] transition-colors"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(tpl)}
                    title="Eliminar"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-red-400 hover:bg-white/[0.06] transition-colors ml-auto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-xl max-h-[90vh] overflow-y-auto" hover={false}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg">
                {editingTemplate ? 'Editar Template' : 'Nuevo Template'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingTemplate(null); }}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-1.5">Nombre</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej: appointment_reminder"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 transition-colors"
                />
              </div>

              {/* Category + Language */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-1.5">Categoria</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as TemplateCategory })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer"
                  >
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key} className="bg-gray-900">{cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-1.5">Idioma</label>
                  <select
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 appearance-none cursor-pointer"
                  >
                    <option value="es" className="bg-gray-900">Espanol</option>
                    <option value="en" className="bg-gray-900">English</option>
                    <option value="pt" className="bg-gray-900">Portugues</option>
                  </select>
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wider mb-1.5">
                  Cuerpo del mensaje
                </label>
                <textarea
                  required
                  rows={6}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  placeholder={"Hola {{nombre}}, tu turno es el {{fecha}} a las {{hora}}.\nTe esperamos!"}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 resize-none transition-colors font-mono"
                />
                <p className="text-white/30 text-xs mt-1">
                  Usa {"{{variable}}"} para insertar campos dinamicos.
                </p>
              </div>

              {/* Live preview */}
              {formData.body && (
                <div>
                  <label className="block text-white/50 text-xs uppercase tracking-wider mb-1.5">Vista previa</label>
                  <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                    <TemplateBody body={formData.body} className="text-white/70" />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingTemplate(null); }}
                  className="px-4 py-2.5 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform shadow-lg"
                >
                  {editingTemplate ? 'Guardar cambios' : 'Crear Template'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* ── Preview Modal ── */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-lg" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold text-lg">{previewTemplate.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${CATEGORY_CONFIG[previewTemplate.category]?.color ?? ''}`}>
                    {CATEGORY_CONFIG[previewTemplate.category]?.label ?? previewTemplate.category}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${STATUS_CONFIG[previewTemplate.status]?.color ?? ''}`}>
                    {STATUS_CONFIG[previewTemplate.status]?.icon}
                    {STATUS_CONFIG[previewTemplate.status]?.label ?? previewTemplate.status}
                  </span>
                  <span className="text-white/40 text-xs">{previewTemplate.language.toUpperCase()}</span>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview body - simulated phone bubble */}
            <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/[0.04]">
              <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06] max-w-[85%]">
                <TemplateBody body={previewTemplate.body} className="text-white/80" />
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-white/30 text-[10px]">
                  {previewTemplate.updated_at
                    ? new Date(previewTemplate.updated_at).toLocaleString('es-AR')
                    : new Date(previewTemplate.created_at).toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setPreviewTemplate(null); openEdit(previewTemplate); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <Edit2 size={14} /> Editar
              </button>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform"
              >
                Cerrar
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
