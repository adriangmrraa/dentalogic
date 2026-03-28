import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare,
  CalendarCheck,
  Activity,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowUpRight,
  User
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import api, { BACKEND_URL } from '../api/axios';
import { useTranslation } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

interface AnalyticsStats {
  ia_conversations: number;
  ia_appointments: number;
  active_urgencies: number;
  total_revenue: number;
  growth_data: { date: string; ia_referrals: number; completed_appointments: number }[];
}

interface UrgencyRecord {
  id: string;
  patient_name: string;
  phone: string;
  urgency_level: 'CRITICAL' | 'HIGH' | 'NORMAL';
  reason: string;
  timestamp: string;
}

const KPICard = ({ title, value, icon: Icon, color, trend }: any) => {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    'bg-blue-500': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-l-blue-500/40' },
    'bg-emerald-500': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-l-emerald-500/40' },
    'bg-rose-500': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-l-red-500/40' },
    'bg-amber-500': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-l-amber-500/40' },
  };
  const c = colorMap[color] || colorMap['bg-blue-500'];

  return (
    <GlassCard className={`border-l-4 ${c.border}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${c.bg} group-hover:scale-110 transition-transform`}>
          <Icon className={`w-6 h-6 ${c.text}`} />
        </div>
        {trend && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
            <TrendingUp size={12} /> {trend}
          </span>
        )}
      </div>
      <p className="text-white/50 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
    </GlassCard>
  );
};

const UrgencyBadge = ({ level }: { level: UrgencyRecord['urgency_level'] }) => {
  const styles = {
    CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
    HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    NORMAL: 'bg-green-500/10 text-green-400 border-green-500/20'
  };
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${styles[level]}`}>
      {level}
    </span>
  );
};

export default function DashboardView() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [urgencies, setUrgencies] = useState<UrgencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'weekly' | 'monthly'>('weekly');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('NEW_APPOINTMENT', () => {
      setStats(prev => {
        if (!prev) return prev;
        return { ...prev, ia_appointments: prev.ia_appointments + 1 };
      });
    });

    const loadDashboardData = async (range: string) => {
      try {
        setLoading(true);
        const [statsRes, urgenciesRes] = await Promise.all([
          api.get(`/admin/stats/summary?range=${range}`),
          api.get('/admin/chat/urgencies')
        ]);
        setStats(statsRes.data);
        setUrgencies(urgenciesRes.data);
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData(timeRange);

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [timeRange]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="p-4 sm:p-6 shrink-0 bg-white/[0.01] border-b border-white/[0.04]">
        <PageHeader
          title={t('dashboard.analytics_title')}
          subtitle={t('dashboard.analytics_subtitle')}
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setTimeRange('weekly')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  timeRange === 'weekly'
                    ? 'bg-white text-gray-900'
                    : 'bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.10]'
                }`}
              >
                {t('dashboard.weekly')}
              </button>
              <button
                onClick={() => setTimeRange('monthly')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  timeRange === 'monthly'
                    ? 'bg-white text-gray-900'
                    : 'bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.10]'
                }`}
              >
                {t('dashboard.monthly')}
              </button>
            </div>
          }
        />
      </header>

      {/* SCROLLABLE CONTENT */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 space-y-6 scroll-smooth">
        {/* KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title={t('dashboard.conversations')} value={stats?.ia_conversations} icon={MessageSquare} color="bg-blue-500" trend="+12%" />
          <KPICard title={t('dashboard.ia_appointments')} value={stats?.ia_appointments} icon={CalendarCheck} color="bg-emerald-500" trend="+5%" />
          <KPICard title={t('dashboard.urgencies')} value={stats?.active_urgencies} icon={Activity} color="bg-rose-500" />
          <KPICard title={t('dashboard.revenue')} value={`$${stats?.total_revenue?.toLocaleString()}`} icon={DollarSign} color="bg-amber-500" trend="+8%" />
        </div>

        {/* CHART */}
        <GlassCard>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white">{t('dashboard.chart_title')}</h2>
            <div className="hidden sm:flex gap-4 text-xs font-medium text-white/40">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> {t('dashboard.referrals')}</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> {t('dashboard.completed')}</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.growth_data}>
                <defs>
                  <linearGradient id="colorIA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: '#0d1117',
                    color: 'rgba(255,255,255,0.8)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                  }}
                />
                <Area type="monotone" dataKey="ia_referrals" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorIA)" />
                <Area type="monotone" dataKey="completed_appointments" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorDone)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* URGENCIES TABLE */}
        <GlassCard padding="none" className="overflow-hidden mb-4">
          <div className="p-6 border-b border-white/[0.04] flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">{t('dashboard.urgencies_recent')}</h2>
            <button className="text-blue-400 text-sm font-semibold hover:text-blue-300 px-3 py-2 rounded-lg hover:bg-blue-500/10 transition-colors">
              {t('dashboard.see_all')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">{t('dashboard.patient')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">{t('dashboard.reason')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">{t('dashboard.severity')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-wider">{t('dashboard.time')}</th>
                  <th className="px-6 py-4 text-xs font-bold text-white/40 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {urgencies.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 group-hover:bg-blue-500/10 group-hover:text-blue-400 transition-colors">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{u.patient_name}</p>
                          <p className="text-[11px] text-white/40 font-mono tracking-tighter">{u.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-white/60 font-medium">{u.reason}</td>
                    <td className="px-6 py-4"><UrgencyBadge level={u.urgency_level} /></td>
                    <td className="px-6 py-4 text-sm text-white/40">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-white/30" /> {u.timestamp}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-white/[0.06] rounded-xl border border-transparent hover:border-white/[0.08] text-white/30 hover:text-blue-400 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <ArrowUpRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
