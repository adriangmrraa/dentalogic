import { useState, useEffect } from 'react';
import { DollarSign, Users, CalendarCheck, UserCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import api from '../api/axios';
import { useTranslation } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

interface ExecutiveStats {
  monthly_revenue: number;
  previous_month_revenue: number;
  new_patients: number;
  attendance_rate: number;
  active_professionals: number;
  revenue_chart: { month: string; revenue: number }[];
  appointments_by_professional: { name: string; appointments: number }[];
}

interface ProfessionalPerformance {
  id: number;
  name: string;
  completed_appointments: number;
  cancellation_rate: number;
  revenue: number;
}

const darkTooltipStyle = {
  backgroundColor: '#0d1117',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '13px',
  padding: '10px 14px',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
}

function getTrendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export default function DashboardStatusView() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [performance, setPerformance] = useState<ProfessionalPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0],
    };
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
        const [statsRes, perfRes] = await Promise.all([
          api.get(`/admin/stats/executive?${params}`),
          api.get(`/admin/stats/professionals/performance?${params}`),
        ]);
        setStats(statsRes.data);
        setPerformance(perfRes.data);
      } catch (error) {
        console.error('Error loading executive dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateRange]);

  const revenueTrend = stats ? getTrendPercent(stats.monthly_revenue, stats.previous_month_revenue) : 0;
  const trendUp = revenueTrend >= 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="p-4 sm:p-6 shrink-0 bg-white/[0.01] border-b border-white/[0.04]">
        <PageHeader
          title={t('dashboard.executive_title') || 'Executive Dashboard'}
          subtitle={t('dashboard.executive_subtitle') || 'High-level clinic performance overview'}
          icon={<TrendingUp size={20} />}
          action={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  {t('analytics.from_date') || 'From'}
                </label>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                  className="border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  {t('analytics.to_date') || 'To'}
                </label>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                  className="border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
          }
        />
      </header>

      {/* SCROLLABLE CONTENT */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6 space-y-6 scroll-smooth">
        {/* KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Monthly Revenue */}
          <GlassCard className="border-l-4 border-l-emerald-500/40">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <span
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
                  trendUp
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}
              >
                {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(revenueTrend)}%
              </span>
            </div>
            <p className="text-white/50 text-sm font-medium">
              {t('dashboard.monthly_revenue') || 'Monthly Revenue'}
            </p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {formatCurrency(stats?.monthly_revenue ?? 0)}
            </h3>
            <p className="text-white/40 text-xs mt-1">
              {t('dashboard.vs_previous_month') || 'vs previous month'}
            </p>
          </GlassCard>

          {/* New Patients */}
          <GlassCard className="border-l-4 border-l-blue-500/40">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <p className="text-white/50 text-sm font-medium">
              {t('dashboard.new_patients') || 'New Patients'}
            </p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {stats?.new_patients ?? 0}
            </h3>
            <p className="text-white/40 text-xs mt-1">
              {t('dashboard.this_month') || 'This month'}
            </p>
          </GlassCard>

          {/* Attendance Rate */}
          <GlassCard className="border-l-4 border-l-amber-500/40">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-amber-500/10">
                <CalendarCheck className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <p className="text-white/50 text-sm font-medium">
              {t('dashboard.attendance_rate') || 'Attendance Rate'}
            </p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {stats?.attendance_rate ?? 0}%
            </h3>
            <p className="text-white/40 text-xs mt-1">
              {t('dashboard.completed_vs_scheduled') || 'Completed vs scheduled'}
            </p>
          </GlassCard>

          {/* Active Professionals */}
          <GlassCard className="border-l-4 border-l-purple-500/40">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-xl bg-purple-500/10">
                <UserCheck className="w-6 h-6 text-purple-400" />
              </div>
            </div>
            <p className="text-white/50 text-sm font-medium">
              {t('dashboard.active_professionals') || 'Active Professionals'}
            </p>
            <h3 className="text-2xl font-bold text-white mt-1">
              {stats?.active_professionals ?? 0}
            </h3>
            <p className="text-white/40 text-xs mt-1">
              {t('dashboard.currently_active') || 'Currently active'}
            </p>
          </GlassCard>
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Monthly Chart */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-white mb-1">
              {t('dashboard.revenue_trend') || 'Revenue Trend'}
            </h3>
            <p className="text-white/40 text-sm mb-6">
              {t('dashboard.monthly_revenue_chart') || 'Monthly revenue overview'}
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.revenue_chart ?? []}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="month"
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Appointments by Professional Chart */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-white mb-1">
              {t('dashboard.appointments_by_professional') || 'Appointments by Professional'}
            </h3>
            <p className="text-white/40 text-sm mb-6">
              {t('dashboard.professional_workload') || 'Workload distribution'}
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.appointments_by_professional ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    type="number"
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                  <Bar dataKey="appointments" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>

        {/* PERFORMANCE TABLE */}
        <GlassCard>
          <h3 className="text-lg font-semibold text-white mb-1">
            {t('dashboard.professional_performance') || 'Professional Performance'}
          </h3>
          <p className="text-white/40 text-sm mb-6">
            {t('dashboard.performance_breakdown') || 'Detailed breakdown by professional'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-3 px-4 text-white/50 font-medium uppercase tracking-wider text-xs">
                    {t('dashboard.professional_name') || 'Professional'}
                  </th>
                  <th className="text-right py-3 px-4 text-white/50 font-medium uppercase tracking-wider text-xs">
                    {t('dashboard.completed_appointments') || 'Completed'}
                  </th>
                  <th className="text-right py-3 px-4 text-white/50 font-medium uppercase tracking-wider text-xs">
                    {t('dashboard.cancellation_rate') || 'Cancellation Rate'}
                  </th>
                  <th className="text-right py-3 px-4 text-white/50 font-medium uppercase tracking-wider text-xs">
                    {t('dashboard.generated_revenue') || 'Revenue'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {performance.map((prof) => (
                  <tr
                    key={prof.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-4 text-white font-medium">{prof.name}</td>
                    <td className="py-3 px-4 text-right text-white/70">{prof.completed_appointments}</td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          prof.cancellation_rate > 20
                            ? 'bg-red-500/10 text-red-400'
                            : prof.cancellation_rate > 10
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-green-500/10 text-green-400'
                        }`}
                      >
                        {prof.cancellation_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-white/70 font-medium">
                      {formatCurrency(prof.revenue)}
                    </td>
                  </tr>
                ))}
                {performance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-white/40">
                      {t('dashboard.no_data') || 'No data available for the selected period'}
                    </td>
                  </tr>
                )}
              </tbody>
              {performance.length > 0 && (
                <tfoot>
                  <tr className="border-t border-white/[0.08]">
                    <td className="py-3 px-4 text-white font-bold">
                      {t('dashboard.total') || 'Total'}
                    </td>
                    <td className="py-3 px-4 text-right text-white font-bold">
                      {performance.reduce((sum, p) => sum + p.completed_appointments, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 text-xs">--</td>
                    <td className="py-3 px-4 text-right text-white font-bold">
                      {formatCurrency(performance.reduce((sum, p) => sum + p.revenue, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
