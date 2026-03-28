import { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import PageHeader from '../components/PageHeader';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

/* ---------- types ---------- */
interface KPI {
  totalLeads: number;
  costPerLead: number;
  conversionRate: number;
  marketingROI: number;
}

interface Campaign {
  id: string;
  name: string;
  platform: 'Meta' | 'Google';
  status: 'active' | 'paused' | 'ended';
  budget: number;
  spent: number;
  leads: number;
  cpc: number;
  cpl: number;
}

interface DailyLeads {
  date: string;
  meta: number;
  google: number;
}

interface InvestmentByPlatform {
  platform: string;
  amount: number;
}

/* ---------- mock data ---------- */
const mockKPI: KPI = {
  totalLeads: 342,
  costPerLead: 18.5,
  conversionRate: 24.3,
  marketingROI: 312,
};

const mockCampaigns: Campaign[] = [
  { id: '1', name: 'Ortodoncia Invisible', platform: 'Meta', status: 'active', budget: 3000, spent: 2140, leads: 87, cpc: 1.24, cpl: 24.6 },
  { id: '2', name: 'Blanqueamiento Promo', platform: 'Google', status: 'active', budget: 2000, spent: 1560, leads: 64, cpc: 0.98, cpl: 24.4 },
  { id: '3', name: 'Implantes Premium', platform: 'Meta', status: 'paused', budget: 4000, spent: 3200, leads: 112, cpc: 1.45, cpl: 28.6 },
  { id: '4', name: 'Limpieza Dental', platform: 'Google', status: 'ended', budget: 1500, spent: 1500, leads: 79, cpc: 0.87, cpl: 19.0 },
];

const mockDailyLeads: DailyLeads[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  return {
    date: `${d.getDate()}/${d.getMonth() + 1}`,
    meta: Math.floor(Math.random() * 15) + 3,
    google: Math.floor(Math.random() * 12) + 2,
  };
});

const mockInvestment: InvestmentByPlatform[] = [
  { platform: 'Meta', amount: 5340 },
  { platform: 'Google', amount: 3060 },
];

/* ---------- helpers ---------- */
const platformBadge = (p: Campaign['platform']) =>
  p === 'Meta'
    ? 'bg-blue-500/10 text-blue-400'
    : 'bg-green-500/10 text-green-400';

const statusBadge = (s: Campaign['status']) => {
  if (s === 'active') return 'bg-emerald-500/10 text-emerald-400';
  if (s === 'paused') return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-white/[0.06] text-white/60';
};

const statusLabel = (s: Campaign['status']) =>
  s === 'active' ? 'Activa' : s === 'paused' ? 'Pausada' : 'Finalizada';

const fmt = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtCurrency = (n: number) =>
  `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/* ---------- dark tooltip ---------- */
const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg" style={{ background: '#0d1117' }}>
      <p className="text-white/60 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

/* ========== component ========== */
export default function MarketingHubView() {
  const [stats, setStats] = useState<KPI>(mockKPI);
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns);
  const [dailyLeads] = useState<DailyLeads[]>(mockDailyLeads);
  const [investment] = useState<InvestmentByPlatform[]>(mockInvestment);
  const [loading, setLoading] = useState(false);

  /* placeholder fetch — replace with real API calls */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // GET /admin/marketing/dashboard
        // const dashRes = await fetch('/admin/marketing/dashboard');
        // const dashData = await dashRes.json();
        // setStats(dashData.kpi);

        // GET /admin/marketing/campaigns
        // const campRes = await fetch('/admin/marketing/campaigns');
        // const campData = await campRes.json();
        // setCampaigns(campData);
      } catch (err) {
        console.error('Error fetching marketing data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /* ---------- KPI definitions ---------- */
  const kpis = [
    { label: 'Total Leads (mes)', value: fmt(stats.totalLeads), border: 'border-blue-400' },
    { label: 'Costo por Lead (CPL)', value: fmtCurrency(stats.costPerLead), border: 'border-cyan-400' },
    { label: 'Tasa de Conversión', value: `${stats.conversionRate}%`, border: 'border-emerald-400' },
    { label: 'ROI Marketing', value: `${stats.marketingROI}%`, border: 'border-purple-400' },
  ];

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Marketing Hub" subtitle="Campañas, leads y rendimiento publicitario" />

      <main className="flex-1 min-h-0 overflow-y-auto px-6 pb-8 space-y-8">
        {/* ---- KPI cards ---- */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <GlassCard key={k.label} className={`border-l-4 ${k.border} p-5`}>
              <p className="text-xs text-white/50 uppercase tracking-wide">{k.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{k.value}</p>
            </GlassCard>
          ))}
        </section>

        {/* ---- Campaign cards grid ---- */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Campañas</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {campaigns.map((c) => {
              const pct = Math.min((c.spent / c.budget) * 100, 100);
              return (
                <GlassCard key={c.id} className="p-5 space-y-3">
                  {/* header row */}
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium truncate mr-2">{c.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${platformBadge(c.platform)}`}>
                        {c.platform}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </div>
                  </div>

                  {/* budget progress */}
                  <div>
                    <div className="flex justify-between text-xs text-white/50 mb-1">
                      <span>Presupuesto</span>
                      <span>{fmtCurrency(c.spent)} / {fmtCurrency(c.budget)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* metrics row */}
                  <div className="flex items-center gap-6 text-xs text-white/70">
                    <span><strong className="text-white">{c.leads}</strong> leads</span>
                    <span>CPC <strong className="text-white">{fmtCurrency(c.cpc)}</strong></span>
                    <span>CPL <strong className="text-white">{fmtCurrency(c.cpl)}</strong></span>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </section>

        {/* ---- Charts ---- */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leads per day */}
          <GlassCard className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Leads por día (últimos 30 días)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailyLeads}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Line type="monotone" dataKey="meta" name="Meta" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="google" name="Google" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </GlassCard>

          {/* Investment by platform */}
          <GlassCard className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Inversión por plataforma</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={investment}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="platform" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="amount" name="Inversión" radius={[6, 6, 0, 0]} fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </section>

        {/* ---- Quick actions ---- */}
        <section className="flex flex-wrap gap-3">
          <button
            onClick={() => (window.location.href = '/templates')}
            className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-sm text-white transition"
          >
            Ir a Plantillas
          </button>
          <button
            onClick={() => (window.location.href = '/leads')}
            className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-sm text-white transition"
          >
            Ir a Leads
          </button>
          <button
            onClick={() => alert('Sincronizando campañas...')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm text-white font-medium transition"
          >
            Sincronizar campañas
          </button>
        </section>
      </main>
    </div>
  );
}
