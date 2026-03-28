import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, Calendar, Clock, MessageCircle,
  UserPlus, Send, Users, Tag, Globe, Megaphone, ExternalLink,
  CheckCircle2, XCircle, AlertCircle, ArrowRightCircle
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
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  notes?: string;
}

interface TimelineEvent {
  id: number;
  event_type: string;
  description: string;
  created_at: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
}

/* ───────── Config maps ───────── */

const SOURCE_CONFIG: Record<LeadSource, { label: string; color: string; icon: React.ReactNode }> = {
  meta_ads:   { label: 'Meta Ads',   color: 'bg-blue-500/15 text-blue-400 border-blue-500/25',       icon: <Megaphone size={13} /> },
  google_ads: { label: 'Google Ads', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', icon: <Globe size={13} /> },
  whatsapp:   { label: 'WhatsApp',   color: 'bg-green-500/15 text-green-400 border-green-500/25',     icon: <MessageCircle size={13} /> },
  instagram:  { label: 'Instagram',  color: 'bg-pink-500/15 text-pink-400 border-pink-500/25',        icon: <Globe size={13} /> },
  website:    { label: 'Website',    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',        icon: <Globe size={13} /> },
  referral:   { label: 'Referido',   color: 'bg-amber-500/15 text-amber-400 border-amber-500/25',     icon: <Users size={13} /> },
  manual:     { label: 'Manual',     color: 'bg-white/10 text-white/60 border-white/15',              icon: <Tag size={13} /> },
};

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:                    { label: 'Nuevo',       color: 'bg-violet-500/15 text-violet-400 border-violet-500/25' },
  contacted:              { label: 'Contactado',  color: 'bg-sky-500/15 text-sky-400 border-sky-500/25' },
  appointment_scheduled:  { label: 'Turno agendado', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  converted:              { label: 'Convertido',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  lost:                   { label: 'Perdido',     color: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  status_change: <ArrowRightCircle size={16} className="text-amber-400" />,
  contact:       <Phone size={16} className="text-sky-400" />,
  message:       <MessageCircle size={16} className="text-green-400" />,
  converted:     <CheckCircle2 size={16} className="text-emerald-400" />,
  lost:          <XCircle size={16} className="text-red-400" />,
  note:          <AlertCircle size={16} className="text-violet-400" />,
  assigned:      <Users size={16} className="text-blue-400" />,
};

/* ───────── Helpers ───────── */

function SourceBadge({ source }: { source: LeadSource }) {
  const cfg = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.manual;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ───────── Component ───────── */

export default function LeadDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [lead, setLead] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  /* Assign modal */
  const [showAssign, setShowAssign] = useState(false);
  const [professionals, setProfessionals] = useState<{ id: number; first_name: string; last_name?: string }[]>([]);
  const [assignId, setAssignId] = useState('');

  /* Message modal */
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState('');

  /* ── Fetch ── */

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [leadRes, timelineRes, profRes] = await Promise.all([
          api.get(`/admin/leads/${id}`),
          api.get(`/admin/leads/${id}/timeline`),
          api.get('/admin/professionals'),
        ]);
        setLead(leadRes.data);
        setTimeline(timelineRes.data ?? []);
        setProfessionals((profRes.data || []).filter((p: any) => p.is_active));
      } catch (err) {
        console.error('Error fetching lead detail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  /* ── Actions ── */

  const handleConvert = async () => {
    if (!lead || !confirm(`Convertir a "${lead.first_name} ${lead.last_name ?? ''}" en paciente?`)) return;
    try {
      await api.post(`/admin/leads/${lead.id}/convert`);
      const res = await api.get(`/admin/leads/${lead.id}`);
      setLead(res.data);
      const tlRes = await api.get(`/admin/leads/${lead.id}/timeline`);
      setTimeline(tlRes.data ?? []);
    } catch (err) {
      console.error('Error converting lead:', err);
    }
  };

  const handleAssign = async () => {
    if (!lead || !assignId) return;
    try {
      await api.put(`/admin/leads/${lead.id}`, { assigned_professional_id: parseInt(assignId) });
      const res = await api.get(`/admin/leads/${lead.id}`);
      setLead(res.data);
      setShowAssign(false);
      setAssignId('');
      const tlRes = await api.get(`/admin/leads/${lead.id}/timeline`);
      setTimeline(tlRes.data ?? []);
    } catch (err) {
      console.error('Error assigning professional:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!lead || !messageText.trim()) return;
    try {
      await api.post(`/admin/leads/${lead.id}/message`, { text: messageText });
      setMessageText('');
      setShowMessage(false);
      const tlRes = await api.get(`/admin/leads/${lead.id}/timeline`);
      setTimeline(tlRes.data ?? []);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  /* ── Loading / Not found ── */

  if (loading) {
    return (
      <div className="p-4 lg:p-6 h-full overflow-y-auto isolate flex items-center justify-center">
        <span className="text-white/40 text-sm">Cargando lead...</span>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-4 lg:p-6 h-full overflow-y-auto isolate flex flex-col items-center justify-center gap-4">
        <span className="text-white/40 text-sm">Lead no encontrado</span>
        <button onClick={() => navigate('/leads')} className="text-blue-400 text-sm hover:underline">Volver a leads</button>
      </div>
    );
  }

  const utmParams = [
    { key: 'utm_source', value: lead.utm_source },
    { key: 'utm_medium', value: lead.utm_medium },
    { key: 'utm_campaign', value: lead.utm_campaign },
    { key: 'utm_content', value: lead.utm_content },
    { key: 'utm_term', value: lead.utm_term },
  ].filter((u) => u.value);

  /* ── Render ── */

  return (
    <div className="p-4 lg:p-6 h-full overflow-y-auto isolate">
      {/* Back */}
      <button
        onClick={() => navigate('/leads')}
        className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Volver a leads
      </button>

      {/* ── Header ── */}
      <GlassCard className="mb-6" hover={false}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {lead.first_name} {lead.last_name ?? ''}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={lead.source} />
              <StatusBadge status={lead.status} />
              <span className="text-white/40 text-xs flex items-center gap-1">
                <Calendar size={12} /> {formatDate(lead.created_at)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.status !== 'converted' && (
              <button
                onClick={handleConvert}
                className="flex items-center gap-1.5 bg-white text-gray-900 px-4 py-2 rounded-xl text-sm font-medium hover:scale-105 active:scale-95 transition-transform shadow-lg"
              >
                <UserPlus size={15} /> Convertir a paciente
              </button>
            )}
            <button
              onClick={() => setShowMessage(true)}
              className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.1] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/[0.1] transition-colors"
            >
              <Send size={15} /> Enviar mensaje
            </button>
            <button
              onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.1] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/[0.1] transition-colors"
            >
              <Users size={15} /> Asignar
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Body grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Contact info */}
          <GlassCard hover={false}>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Contacto</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Phone size={15} className="text-white/30 shrink-0" />
                <span className="text-white/70 text-sm">{lead.phone || 'Sin telefono'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail size={15} className="text-white/30 shrink-0" />
                <span className="text-white/70 text-sm">{lead.email || 'Sin email'}</span>
              </div>
              {lead.assigned_professional_name && (
                <div className="flex items-center gap-3">
                  <Users size={15} className="text-white/30 shrink-0" />
                  <span className="text-white/70 text-sm">{lead.assigned_professional_name}</span>
                </div>
              )}
            </div>
            {lead.notes && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <h4 className="text-white/50 text-xs uppercase tracking-wider mb-2">Notas</h4>
                <p className="text-white/70 text-sm leading-relaxed">{lead.notes}</p>
              </div>
            )}
          </GlassCard>

          {/* Campaign origin */}
          {(lead.campaign_name || utmParams.length > 0) && (
            <GlassCard hover={false}>
              <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">Origen de campana</h3>
              {lead.campaign_name && (
                <div className="flex items-center gap-2 mb-3">
                  <Megaphone size={14} className="text-blue-400 shrink-0" />
                  <span className="text-white text-sm font-medium">{lead.campaign_name}</span>
                </div>
              )}
              {utmParams.length > 0 && (
                <div className="space-y-2">
                  {utmParams.map(({ key, value }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-mono">{key}</span>
                      <span className="text-white/70 text-xs bg-white/[0.04] px-2 py-0.5 rounded-md">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        {/* Right column: Timeline */}
        <div className="lg:col-span-2">
          <GlassCard hover={false} padding="none">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Timeline</h3>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-440px)] px-4 sm:px-6 pb-4 sm:pb-6 isolate">
              {timeline.length === 0 ? (
                <p className="text-white/40 text-sm py-8 text-center">Sin eventos registrados</p>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.06]" />

                  <div className="space-y-4">
                    {timeline.map((event) => (
                      <div key={event.id} className="relative flex gap-4 pl-1">
                        {/* Icon dot */}
                        <div className="shrink-0 w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center z-10">
                          {EVENT_ICONS[event.event_type] ?? <Clock size={16} className="text-white/40" />}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-white text-sm leading-relaxed">{event.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-white/40 text-xs">{formatDateTime(event.created_at)}</span>
                            {event.created_by && (
                              <span className="text-white/30 text-xs">por {event.created_by}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ── Assign Modal ── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-md" hover={false}>
            <h3 className="text-white font-semibold text-lg mb-1">Asignar Profesional</h3>
            <p className="text-white/50 text-sm mb-4">
              {lead.first_name} {lead.last_name ?? ''}
            </p>
            <select
              value={assignId}
              onChange={(e) => setAssignId(e.target.value)}
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
                onClick={() => { setShowAssign(false); setAssignId(''); }}
                className="px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignId}
                className="px-4 py-2 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
              >
                Asignar
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Message Modal ── */}
      {showMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-lg" hover={false}>
            <h3 className="text-white font-semibold text-lg mb-1">Enviar Mensaje</h3>
            <p className="text-white/50 text-sm mb-4">
              A {lead.first_name} {lead.last_name ?? ''} ({lead.phone || lead.email || 'sin contacto'})
            </p>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={4}
              placeholder="Escribe tu mensaje..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500/40 resize-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowMessage(false); setMessageText(''); }}
                className="px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim()}
                className="px-4 py-2 rounded-xl text-sm bg-white text-gray-900 font-medium hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
              >
                Enviar
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
