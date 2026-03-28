import React, { useState, useEffect } from 'react';
import { ShieldAlert, Users, Phone, Zap, ChevronRight, Activity, Calendar, MousePointerClick } from 'lucide-react';
import api from '../api/axios';
import PageHeader from '../components/PageHeader';
import GlassCard, { CARD_IMAGES } from '../components/GlassCard';

interface DemoEvent {
  id: string;
  lead_id: number;
  event_type: string;
  event_data: any;
  created_at: string;
}

interface DemoLead {
  id: number;
  phone_number: string;
  email: string | null;
  source_ad: string | null;
  status: string;
  engagement_score: number;
  first_seen_at: string;
  last_seen_at: string;
}

export default function SuperAdminDashboard() {
  const [leads, setLeads] = useState<DemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/tracking/superadmin/leads');
      setLeads(data.leads);
    } catch (err) {
      console.error('Error loading demo leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLeadEvents = async (leadId: number) => {
    try {
      setSelectedLeadId(leadId);
      setLoadingEvents(true);
      const { data } = await api.get(`/tracking/superadmin/leads/${leadId}/events`);
      setEvents(data.events);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch(type) {
      case 'whatsapp_click': return <Phone className="w-4 h-4 text-green-400" />;
      case 'button_click': return <MousePointerClick className="w-4 h-4 text-blue-400" />;
      case 'scroll_depth_90':
      case 'scroll_depth_50': return <Activity className="w-4 h-4 text-purple-400" />;
      default: return <Zap className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="SuperAdmin Leads"
        subtitle="Tracking de prospectos de Dentalogic en tiempo real"
        icon={<ShieldAlert className="w-6 h-6 text-red-500" />}
      />

      <div className="px-6 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEADS LIST */}
          <div className="lg:col-span-2">
            <GlassCard image={CARD_IMAGES.leads} hoverScale={false}>
              <div className="p-6 border-b border-white/[0.06]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-400" /> 
                  Prospectos (Demo Leads)
                </h3>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <th className="px-4 py-3 text-xs text-white/40 uppercase">Contacto</th>
                      <th className="px-4 py-3 text-xs text-white/40 uppercase">Estado</th>
                      <th className="px-4 py-3 text-xs text-white/40 uppercase">Score</th>
                      <th className="px-4 py-3 text-xs text-white/40 uppercase">Última Vez</th>
                      <th className="px-4 py-3 text-xs text-white/40 uppercase">Origen</th>
                      <th className="px-4 py-3 text-xs"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {loading ? (
                       <tr><td colSpan={6} className="p-4 text-center text-white/40">Cargando leads...</td></tr>
                    ) : leads.length === 0 ? (
                       <tr><td colSpan={6} className="p-4 text-center text-white/40">No hay prospectos trackeados aún</td></tr>
                    ) : (
                      leads.map(lead => (
                        <tr key={lead.id} className={`hover:bg-white/[0.04] transition-colors cursor-pointer ${selectedLeadId === lead.id ? 'bg-white/[0.06]' : ''}`} onClick={() => loadLeadEvents(lead.id)}>
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{lead.phone_number}</div>
                            {lead.email && <div className="text-xs text-white/50">{lead.email}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full font-bold ${lead.status === 'contacted' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {lead.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-amber-400 font-bold flex items-center gap-1">
                              <Zap className="w-3 h-3" /> {lead.engagement_score}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/60">
                            {new Date(lead.last_seen_at).toLocaleString('es-AR')}
                          </td>
                          <td className="px-4 py-3 text-xs text-white/40">{lead.source_ad || 'Orgánico'}</td>
                          <td className="px-4 py-3 text-right">
                             <ChevronRight className="w-5 h-5 text-white/30" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>

          {/* EVENTS TIMELINE */}
          <div className="lg:col-span-1">
            <GlassCard className="h-full flex flex-col" hoverScale={false}>
              <div className="p-6 border-b border-white/[0.06]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-400" />
                  Timeline Eventos
                </h3>
              </div>
              <div className="p-6 flex-1 overflow-y-auto max-h-[600px]">
                {loadingEvents ? (
                  <div className="text-center text-white/40 py-8">Cargando eventos...</div>
                ) : !selectedLeadId ? (
                  <div className="text-center text-white/40 py-8">Selecciona un prospecto para ver su actividad</div>
                ) : events.length === 0 ? (
                  <div className="text-center text-white/40 py-8">No hay eventos registrados</div>
                ) : (
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/[0.08] before:to-transparent">
                    {events.map(event => (
                      <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white/20 bg-gray-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          {getEventIcon(event.event_type)}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white/[0.02] border border-white/[0.06] p-3 rounded-lg hover:bg-white/[0.04]">
                          <div className="font-bold text-white text-sm mb-1">{event.event_type.replace(/_/g, ' ').toUpperCase()}</div>
                          <div className="flex items-center gap-1 text-xs text-white/40 mb-2">
                             <Calendar className="w-3 h-3" /> {new Date(event.created_at).toLocaleString('es-AR')}
                          </div>
                          {Object.keys(event.event_data).length > 0 && (
                            <pre className="text-[10px] text-white/50 bg-black/40 p-2 rounded truncate">
                              {JSON.stringify(event.event_data)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

        </div>
      </div>
    </div>
  );
}
