import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Download, Plus, Eye, RefreshCw,
  UserPlus, ChevronLeft, ChevronRight, Megaphone,
  Phone, Globe, Instagram, MessageCircle, Users, Edit2
} from 'lucide-react';
import api from '../api/axios';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

/* ───────── Types ───────── */

type LeadSource = 'meta_ads' | 'google_ads' | 'whatsapp' | 'instagram' | 'website' | 'referral' | 'manual';
type LeadStatus = 'new' | 'contacted' | 'appointment_scheduled' | 'converted' | 'lost';

interface Lead {
  id: number;
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  created_at: string;
  assigned_professional_id?: number;
  assigned_professional_name?: string;
  campaign_name?: string;
  notes?: string;
}

interface PaginatedResponse {
  items: Lead[];
  total: number;
  page: number;
  pages: number;
}

/* ───────── Badge helpers ───────── */

const SOURCE_CONFIG: Record<LeadSource, { label: string; color: string; icon: React.ReactNode }> = {
  meta_ads:   { label: 'Meta Ads',   color: 'bg-blue-500/15 text-blue-400 border-blue-500/25',       icon: <Megaphone size={12} /> },
  google_ads: { label: 'Google Ads', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', icon: <Globe size={12} /> },
  whatsapp:   { label: 'WhatsApp',   color: 'bg-green-500/15 text-green-400 border-green-500/25',     icon: <MessageCircle size={12} /> },
  instagram:  { label: 'Instagram',  color: 'bg-pink-500/15 text-pink-400 border-pink-500/25',        icon: <Instagram size={12} /> },
  website:    { label: 'Website',    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',        icon: <Globe size={12} /> },
  referral:   { label: 'Referido',   color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',     icon: <Users size={12} /> },
  manual:     { label: 'Manual',     color: 'bg-white/10 text-white/60 border-white/15',              icon: <Edit2 size={12} /> },
};

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:                    { label: 'Nuevo',       color: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  contacted:              { label: 'Contactado',  color: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  appointment_scheduled:  { label: 'Turno',       color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  converted:              { label: 'Convertido',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  lost:                   { label: 'Perdido',     color: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

function SourceBadge({ source }: { source: LeadSource }) {
  const cfg = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.manual;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

/* ───────── Component ───────── */

export default function LeadsManagementView() {
  const navigate = useNavigate();

  /* State */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  /* Filters */
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState<LeadSource | ''>('');
  const [filterStatus, setFilterStatus] = useState<LeadStatus | ''>('');
  const [filterDate, setFilterDate] = useState('');

  /* Status change modal */
  const [statusModal, setStatusModal] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [newStatus, setNewStatus] = useState<LeadStatus>('new');

  /* Assign modal */
  const [assignModal, setAssignModal] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [assignProfessionalId, setAssignProfessionalId] = useState('');
  const [professionals, setProfessionals] = useState<{ id: number; first_name: string; last_name?: string }[]>([]);

  /* ── Fetch ── */

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: 20 };
      if (searchTerm) params.search = searchTerm;
      if (filterSource) params.source = filterSource;
      if (filterStatus) params.status = filterStatus;
      if (filterDate) params.date_from = filterDate;
      const res = await api.get<PaginatedResponse>('/admin/leads', { params });
      setLeads(res.data.items ?? res.data as unknown as Lead[]);
      setTotalPages(res.data.pages ?? 1);
      setTotal(res.data.total ?? (res.data.items ?? res.data as unknown as Lead[]).length);
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, filterSource, filterStatus, filterDate]);

  const fetchProfessionals = async () => {
    try {
      const res = await api.get('/admin/professionals');
      setProfessionals((res.data || []).filter((p: any) => p.is_active));
    } catch (err) {
      console.error('Error fetching professionals:', err);
    }
  };

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchProfessionals(); }, []);

  /* ── Actions ── */

  const handleChangeStatus = async () => {
    if (!statusModal.lead) return;
    try {
      await api.put(`/admin/leads/${statusModal.lead.id}`, { status: newStatus });
      setStatusModal({ open: false, lead: null });
      fetchLeads();
    } catch (err) {
      console.error('Error changing status:', err);
    }
  };

  const handleAssign = async () => {
    if (!assignModal.lead || !assignProfessionalId) return;
    try {
      await api.put(`/admin/leads/${assignModal.lead.id}`, { assigned_professional_id: parseInt(assignProfessionalId) });
      setAssignModal({ open: false, lead: null });
      setAssignProfessionalId('');
      fetchLeads();
    } catch (err) {
      console.error('Error assigning professional:', err);
    }
  };

  const handleConvert = async (lead: Lead) => {
    if (!confirm(`Convertir a "${lead.first_name} ${lead.last_name ?? ''}" en paciente?`)) return;
    try {
      await api.post(`/admin/leads/${lead.id}/convert`);
      fetchLeads();
    } catch (err) {
      console.error('Error converting lead:', err);
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilterSource('');
    setFilterStatus('');
    setFilterDate('');
    setPage(1);
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  /* ── Render ── */

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto isolate">
      <PageHeader
        title="Leads"
        subtitle={`${total} leads en total`}
        icon={<Megaphone size={22} />}
        action={
          <button
            onClick={() => navigate('/leads/new')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-900 px-4 py-2.5 rounded-xl transition-all text-sm font-medium shadow-lg hover:scale-105 active:scale-95"
          >
            <Plus size={18} />
            Nuevo Lead
          </button>
        }
      />

      {/* ── Filters ── */}
      <GlassCard className="mb-6" hover={false}>
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar por nombre, telefono, email..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>

          {/* Source */}
          <select
            value={filterSource}
            onChange={(e) => { setFilterSource(e.target.value as LeadSource | ''); setPage(1); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="" className="bg-gray-900">Todas las fuentes</option>
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key} className="bg-gray-900">{cfg.label}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value as LeadStatus | ''); setPage(1); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="" className="bg-gray-900">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key} className="bg-gray-900">{cfg.label}</option>
            ))}
          </select>

          {/* Date */}
          <input
            type="date"
            value={filterDate}
            onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 transition-colors"
          />

          {/* Reset */}
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors px-3 py-2.5 rounded-xl hover:bg-white/[0.04]"
          >
            <RefreshCw size={14} /> Limpiar
          </button>
        </div>
      </GlassCard>

      {/* ── Table ── */}
      <GlassCard hover={false} padding="none">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-340px)] isolate">
          <table className="w-full min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Nombre</th>
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Telefono</th>
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Fuente</th>
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Profesional</th>
                <th className="text-right text-xs font-semibold text-white/50 uppercase tracking-wider px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-white/40 text-sm">Cargando leads...</td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-white/40 text-sm">No se encontraron leads</td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <span className="text-white font-medium text-sm">
                        {lead.first_name} {lead.last_name ?? ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/70 text-sm flex items-center gap-1.5">
                        <Phone size={13} className="text-white/30" />
                        {lead.phone || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/50 text-sm">{formatDate(lead.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/70 text-sm">
                        {lead.assigned_professional_name || <span className="text-white/30">Sin asignar</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          title="Ver detalle"
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-white transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => { setStatusModal({ open: true, lead }); setNewStatus(lead.status); }}
                          title="Cambiar estado"
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-amber-400 transition-colors"
                        >
                          <Filter size={15} />
                        </button>
                        <button
                          onClick={() => { setAssignModal({ open: true, lead }); setAssignProfessionalId(String(lead.assigned_professional_id ?? '')); }}
                          title="Asignar profesional"
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-blue-400 transition-colors"
                        >
                          <Users size={15} />
                        </button>
                        {lead.status !== 'converted' && (
                          <button
                            onClick={() => handleConvert(lead)}
                            title="Convertir a paciente"
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/60 hover:text-emerald-400 transition-colors"
                          >
                            <UserPlus size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
            <span className="text-white/40 text-sm">
              Pagina {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Change Status Modal ── */}
      {statusModal.open && statusModal.lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-md" hover={false}>
            <h3 className="text-white font-semibold text-lg mb-1">Cambiar Estado</h3>
            <p className="text-white/50 text-sm mb-4">
              {statusModal.lead.first_name} {statusModal.lead.last_name ?? ''}
            </p>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as LeadStatus)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 mb-4 appearance-none cursor-pointer"
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key} className="bg-gray-900">{cfg.label}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStatusModal({ open: false, lead: null })}
                className="px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeStatus}
                className="px-4 py-2 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform"
              >
                Guardar
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Assign Professional Modal ── */}
      {assignModal.open && assignModal.lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-md" hover={false}>
            <h3 className="text-white font-semibold text-lg mb-1">Asignar Profesional</h3>
            <p className="text-white/50 text-sm mb-4">
              {assignModal.lead.first_name} {assignModal.lead.last_name ?? ''}
            </p>
            <select
              value={assignProfessionalId}
              onChange={(e) => setAssignProfessionalId(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/40 mb-4 appearance-none cursor-pointer"
            >
              <option value="" className="bg-gray-900">Seleccionar profesional</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id} className="bg-gray-900">
                  {p.first_name} {p.last_name ?? ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAssignModal({ open: false, lead: null }); setAssignProfessionalId(''); }}
                className="px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignProfessionalId}
                className="px-4 py-2 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
              >
                Asignar
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
