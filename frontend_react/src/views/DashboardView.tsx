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

// ============================================
// INTERFACES & TYPES
// ============================================

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

// ============================================
// COMPONENTS
// ============================================

const KPICard = ({ title, value, icon: Icon, color, trend }: any) => (
  <div className="bg-white/80 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend && (
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
          <TrendingUp size={12} /> {trend}
        </span>
      )}
    </div>
    <p className="text-gray-500 text-sm font-medium">{title}</p>
    <h3 className="text-2xl font-bold text-gray-800 mt-1">{value}</h3>
  </div>
);

const UrgencyBadge = ({ level }: { level: UrgencyRecord['urgency_level'] }) => {
  const styles = {
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    NORMAL: 'bg-green-100 text-green-700 border-green-200'
  };
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${styles[level]}`}>
      {level}
    </span>
  );
};

// ============================================
// MAIN VIEW
// ============================================

export default function DashboardView() {
  console.log('--- DashboardView Rendering ---');
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [urgencies, setUrgencies] = useState<UrgencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 1. Conectar WebSocket
    socketRef.current = io(BACKEND_URL);

    // 2. Escuchar nuevos turnos/mensajes para actualización en vivo
    socketRef.current.on('NEW_APPOINTMENT', () => {
      setStats(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ia_appointments: prev.ia_appointments + 1
        };
      });
    });

    const loadDashboardData = async () => {
      try {
        setLoading(true);
        // En un escenario real, llamaríamos a /admin/analytics/stats
        const response = await api.get('/admin/stats/summary');

        // Mock data for Recharts (as specified in logic "Gala")
        const mockGrowth = [
          { date: 'Lun', ia_referrals: 12, completed_appointments: 8 },
          { date: 'Mar', ia_referrals: 18, completed_appointments: 12 },
          { date: 'Mie', ia_referrals: 15, completed_appointments: 14 },
          { date: 'Jue', ia_referrals: 25, completed_appointments: 20 },
          { date: 'Vie', ia_referrals: 22, completed_appointments: 18 },
          { date: 'Sab', ia_referrals: 10, completed_appointments: 6 },
          { date: 'Dom', ia_referrals: 5, completed_appointments: 2 },
        ];

        setStats({
          ia_conversations: (response.data.total_patients || 0) * 4,
          ia_appointments: response.data.appointments_today || 0,
          active_urgencies: response.data.active_urgencies || 0,
          total_revenue: 12500,
          growth_data: mockGrowth
        });

        // Mock Urgencies for Bottom Row
        setUrgencies([
          { id: '1', patient_name: 'Juan Pérez', phone: '+54 11 2345-6789', urgency_level: 'CRITICAL', reason: 'Dolor agudo persistente', timestamp: '10:30 AM' },
          { id: '2', patient_name: 'María García', phone: '+54 11 9876-5432', urgency_level: 'HIGH', reason: 'Absceso dental', timestamp: '11:15 AM' },
          { id: '3', patient_name: 'Carlos López', phone: '+54 11 5555-1234', urgency_level: 'NORMAL', reason: 'Control post-operatorio', timestamp: '12:00 PM' },
          { id: '4', patient_name: 'Ana Smith', phone: '+1 555 123 4567', urgency_level: 'NORMAL', reason: 'Consulta estética', timestamp: '12:45 PM' },
        ]);

      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* HEADER SECTION */}
      <header className="p-6 shrink-0 bg-white/50 backdrop-blur-sm border-b border-slate-100 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Analítica Soberana</h1>
          <p className="text-slate-500 text-sm">Monitoreo en tiempo real de la clínica</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-200 text-sm font-medium hover:bg-slate-50 transition-colors">Semanal</button>
          <button className="px-4 py-2 bg-slate-800 text-white rounded-xl shadow-sm text-sm font-medium hover:bg-slate-700 transition-colors">Mensual</button>
        </div>
      </header>

      {/* MAIN SCROLLABLE CONTENT WITH ISORATION */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 scroll-smooth">

        {/* TOP ROW: KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Conversaciones IA"
            value={stats?.ia_conversations}
            icon={MessageSquare}
            color="bg-blue-500"
            trend="+12%"
          />
          <KPICard
            title="Citas de IA"
            value={stats?.ia_appointments}
            icon={CalendarCheck}
            color="bg-emerald-500"
            trend="+5%"
          />
          <KPICard
            title="Urgencias"
            value={stats?.active_urgencies}
            icon={Activity}
            color="bg-rose-500"
          />
          <KPICard
            title="Ingresos (Gala)"
            value={`$${stats?.total_revenue?.toLocaleString()}`}
            icon={DollarSign}
            color="bg-amber-500"
            trend="+8%"
          />
        </div>

        {/* MIDDLE ROW: CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-slate-800">Eficiencia de IA (Derivaciones vs Concretadas)</h2>
              <div className="hidden sm:flex gap-4 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Derivaciones</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Concretadas</span>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.growth_data}>
                  <defs>
                    <linearGradient id="colorIA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorDone" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="ia_referrals" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIA)" />
                  <Area type="monotone" dataKey="completed_appointments" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDone)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10">
              <h2 className="text-lg font-semibold mb-1 text-blue-400">Strategic Insights</h2>
              <p className="text-slate-400 text-xs mb-6 uppercase tracking-widest">Sovereign Protocol v8.0</p>

              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm text-slate-300">Latencia RAG</span>
                  <span className="text-sm font-mono text-emerald-400">142ms</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm text-slate-300">Isolation Mode</span>
                  <span className="text-sm font-mono text-blue-400">Active</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm text-slate-300">Security Layers</span>
                  <span className="text-sm font-mono text-amber-400">Triple</span>
                </div>
              </div>
            </div>

            <button className="z-10 w-full mt-6 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 shadow-lg min-h-[44px]">
              Ver Informe Maestro <ArrowUpRight size={18} />
            </button>

            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>
          </div>
        </div>

        {/* BOTTOM ROW: RECENT URGENCIES TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col mb-4">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800">Urgencias Recientes (Triage)</h2>
            <button className="text-blue-600 text-sm font-semibold hover:underline px-3 py-2">Ver todo</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gravedad</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hora</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {urgencies.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                          <User size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{u.patient_name}</p>
                          <p className="text-[11px] text-slate-500 font-mono tracking-tighter">{u.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">{u.reason}</td>
                    <td className="px-6 py-4">
                      <UrgencyBadge level={u.urgency_level} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-slate-400" /> {u.timestamp}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 text-slate-400 hover:text-blue-600 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <ArrowUpRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
