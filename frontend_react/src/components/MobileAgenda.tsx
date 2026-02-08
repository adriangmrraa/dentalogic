import DateStrip from './DateStrip';
import type { Appointment, Professional } from '../views/AgendaView';
import { Clock, User, Phone } from 'lucide-react';

interface MobileAgendaProps {
    appointments: Appointment[];
    selectedDate: Date;
    onDateChange: (date: Date) => void;
    onEventClick: (event: any) => void;
    professionals: Professional[];
}

export default function MobileAgenda({
    appointments,
    selectedDate,
    onDateChange,
    onEventClick,
    professionals
}: MobileAgendaProps) {

    // Filter appointments for the selected date
    const dailyAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.appointment_datetime);
        return aptDate.toDateString() === selectedDate.toDateString();
    }).sort((a, b) => new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime());

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const getStatusColor = (status: string) => {
        // Simplified status colors for mobile border
        switch (status) {
            case 'confirmed': return 'border-l-green-500';
            case 'cancelled': return 'border-l-red-500';
            case 'completed': return 'border-l-gray-500';
            case 'no_show': return 'border-l-orange-500';
            default: return 'border-l-blue-500';
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Date Strip Navigation */}
            <DateStrip selectedDate={selectedDate} onDateSelect={onDateChange} />

            {/* Appointment List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {dailyAppointments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                        <Clock size={48} className="mb-2 opacity-20" />
                        <p className="text-sm">No hay turnos para este día</p>
                    </div>
                ) : (
                    dailyAppointments.map((apt) => (
                        <div
                            key={apt.id}
                            onClick={() => onEventClick({ event: { start: new Date(apt.appointment_datetime), extendedProps: { ...apt, eventType: 'appointment' } } })}
                            className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${getStatusColor(apt.status)} active:scale-[0.98] transition-transform touch-manipulation`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-gray-800">
                                        {formatTime(apt.appointment_datetime)}
                                    </span>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                        {30} min
                                    </span>
                                </div>
                                {/* Status Badge */}
                                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-gray-50 text-gray-500`}>
                                    {apt.status}
                                </span>
                            </div>

                            <div className="mb-1">
                                <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
                                    {apt.patient_name || 'Paciente sin nombre'}
                                </h3>
                                <p className="text-sm text-gray-500 line-clamp-1">
                                    {apt.appointment_type}
                                </p>
                            </div>

                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
                                {/* Professional Name - Derived from ID if needed, or if available in apt */}
                                <div className="flex items-center gap-1.5 text-gray-400">
                                    <User size={14} />
                                    <span className="text-xs">Dr. {professionals.find((p: Professional) => p.id === apt.professional_id)?.last_name || '...'}</span>
                                </div>
                                {apt.patient_phone && (
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <Phone size={14} />
                                        <span className="text-xs">{apt.patient_phone}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {/* Spacer for bottom FAB if exists, or just padding */}
                <div className="h-12"></div>
            </div>
        </div>
    );
}
