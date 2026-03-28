import React from 'react';
import {
    Users, Calendar, Activity, DollarSign,
    TrendingUp, TrendingDown, Clock, Star
} from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    subtext?: string;
    trend?: 'up' | 'down' | 'neutral';
    icon: 'users' | 'calendar' | 'activity' | 'money' | 'clock' | 'star';
    color?: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtext, trend, icon, color = "blue" }) => {
    const getIcon = () => {
        switch (icon) {
            case 'users': return <Users size={24} />;
            case 'calendar': return <Calendar size={24} />;
            case 'activity': return <Activity size={24} />;
            case 'money': return <DollarSign size={24} />;
            case 'clock': return <Clock size={24} />;
            case 'star': return <Star size={24} />;
            default: return <Activity size={24} />;
        }
    };

    const getColorClasses = () => {
        switch (color) {
            case 'blue': return 'bg-blue-500/10 text-blue-400';
            case 'green': return 'bg-green-500/10 text-green-400';
            case 'purple': return 'bg-purple-500/10 text-purple-400';
            case 'orange': return 'bg-orange-500/10 text-orange-400';
            default: return 'bg-white/[0.06] text-white/60';
        }
    };

    const getBorderColor = () => {
        switch (color) {
            case 'blue': return 'border-l-blue-500/40';
            case 'green': return 'border-l-green-500/40';
            case 'purple': return 'border-l-purple-500/40';
            case 'orange': return 'border-l-orange-500/40';
            default: return 'border-l-white/20';
        }
    };

    return (
        <div className={`bg-white/[0.03] border border-white/[0.06] border-l-4 ${getBorderColor()} rounded-2xl p-6 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.08] group`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-white/50 mb-1">{title}</p>
                    <h3 className="text-2xl font-bold text-white">{value}</h3>
                </div>
                <div className={`p-3 rounded-xl ${getColorClasses()} group-hover:scale-110 transition-transform`}>
                    {getIcon()}
                </div>
            </div>
            {subtext && (
                <div className="mt-4 flex items-center text-sm">
                    {trend === 'up' && <TrendingUp size={16} className="text-green-400 mr-1" />}
                    {trend === 'down' && <TrendingDown size={16} className="text-red-400 mr-1" />}
                    <span className="text-white/40">{subtext}</span>
                </div>
            )}
        </div>
    );
};

export default KPICard;
