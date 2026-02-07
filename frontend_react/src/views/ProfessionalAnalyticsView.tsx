import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import api from '../api/axios';
import { Zap, Crown, Award, TrendingUp, AlertTriangle } from 'lucide-react';
import KPICard from '../components/analytics/KPICard';
import AnalyticsFilters from '../components/analytics/AnalyticsFilters';

interface MetricData {
    id: number;
    name: string;
    specialty: string;
    metrics: {
        total_appointments: number;
        completion_rate: number;
        cancellation_rate: number;
        revenue: number;
        retention_rate: number;
        unique_patients: number;
    };
    tags: string[];
}

export default function ProfessionalAnalyticsView() {
    const [data, setData] = useState<MetricData[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ startDate: '', endDate: '', professionalIds: [] as number[] });

    const fetchData = async () => {
        if (!filters.startDate || !filters.endDate) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                start_date: filters.startDate,
                end_date: filters.endDate
            });
            const response = await api.get(`/admin/analytics/professionals/summary?${params}`);

            let filteredData = response.data;
            if (filters.professionalIds.length > 0) {
                filteredData = filteredData.filter((d: MetricData) => filters.professionalIds.includes(d.id));
            }

            setData(filteredData);
        } catch (error) {
            console.error("Error fetching analytics", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters]);

    // Aggregated Stats for Cards
    const totalRevenue = data.reduce((acc, curr) => acc + curr.metrics.revenue, 0);
    const totalAppointments = data.reduce((acc, curr) => acc + curr.metrics.total_appointments, 0);
    const avgCompletion = data.length ? data.reduce((acc, curr) => acc + curr.metrics.completion_rate, 0) / data.length : 0;
    const totalPatients = data.reduce((acc, curr) => acc + curr.metrics.unique_patients, 0);

    const getTagBadge = (tag: string) => {
        switch (tag) {
            case 'High Performance':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><Zap size={12} /> High Perf</span>;
            case 'Retention Master':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><Crown size={12} /> Customer Love</span>;
            case 'Top Revenue':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Award size={12} /> Rainmaker</span>;
            case 'Risk: Cancellations':
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><AlertTriangle size={12} /> Risk</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{tag}</span>;
        }
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Analytics Estratégico</h1>
                    <p className="text-gray-500">Visión de alto nivel del rendimiento profesional (CEO View)</p>
                </div>
                <div className="text-sm text-gray-400 italic">
                    Datos reales en tiempo real
                </div>
            </div>

            <AnalyticsFilters onFilterChange={setFilters} />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Ingresos Estimados"
                    value={`$${totalRevenue.toLocaleString()}`}
                    icon="money"
                    color="green"
                    subtext="Total del periodo"
                />
                <KPICard
                    title="Turnos Totales"
                    value={totalAppointments}
                    icon="calendar"
                    color="blue"
                    subtext={`${totalPatients} pacientes únicos`}
                />
                <KPICard
                    title="Tasa Completitud"
                    value={`${avgCompletion.toFixed(1)}%`}
                    icon="activity"
                    color="purple"
                    subtext="Promedio general"
                />
                <KPICard
                    title="Profesionales Activos"
                    value={data.length}
                    icon="users"
                    color="orange"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Chart Section */}
                <div className="lg:col-span-2 card">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Rendimiento Comparativo</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Legend />
                                <Bar dataKey="metrics.completion_rate" name="Tasa Completitud (%)" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={20} />
                                <Bar dataKey="metrics.retention_rate" name="Tasa Retención (%)" fill="#82ca9d" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Performers / Strategic Insights */}
                <div className="card">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <TrendingUp className="text-blue-500" /> Insights
                    </h3>
                    <div className="space-y-4">
                        {data.slice(0, 5).map((prof) => ( // Show top 5
                            <div key={prof.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold shrink-0">
                                    {prof.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 text-sm">{prof.name}</h4>
                                    <p className="text-xs text-gray-500 mb-2">{prof.specialty}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {prof.tags.length > 0 ? prof.tags.map(tag => getTagBadge(tag)) : <span className="text-xs text-gray-400">Sin etiquetas</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {data.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay datos para mostrar</p>}
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="card overflow-hidden p-0">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800">Detalle Operativo</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profesional</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Turnos</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Completitud</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Retención</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ingresos Est.</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etiquetas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {data.map((prof) => (
                                <tr key={prof.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="text-sm font-medium text-gray-900">{prof.name}</div>
                                        </div>
                                        <div className="text-xs text-gray-500">{prof.specialty}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                        {prof.metrics.total_appointments}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${prof.metrics.completion_rate > 90 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            {prof.metrics.completion_rate}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                        {prof.metrics.retention_rate}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-medium">
                                        ${prof.metrics.revenue.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex gap-1 flex-wrap">
                                            {prof.tags.map(tag => getTagBadge(tag))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
