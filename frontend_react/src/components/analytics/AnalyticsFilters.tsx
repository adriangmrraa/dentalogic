import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useTranslation } from '../../context/LanguageContext';

interface Professional {
    id: number;
    name: string;
}

interface AnalyticsFiltersProps {
    onFilterChange: (filters: { startDate: string; endDate: string; professionalIds: number[] }) => void;
}

const AnalyticsFilters: React.FC<AnalyticsFiltersProps> = ({ onFilterChange }) => {
    const { t } = useTranslation();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedProfs, setSelectedProfs] = useState<number[]>([]);
    const [professionals, setProfessionals] = useState<Professional[]>([]);

    useEffect(() => {
        // Initialize with current month
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);

        fetchProfessionals();
    }, []);

    const fetchProfessionals = async () => {
        try {
            const response = await api.get('/admin/professionals');
            setProfessionals(response.data);
        } catch (error) {
            console.error("Error fetching professionals for filter", error);
        }
    };

    useEffect(() => {
        if (startDate && endDate) {
            onFilterChange({ startDate, endDate, professionalIds: selectedProfs });
        }
    }, [startDate, endDate, selectedProfs]);

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end">
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>
            <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Profesionales</label>
                <select
                    multiple
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full h-[42px] focus:outline-none focus:ring-2 focus:ring-primary"
                    value={selectedProfs.map(String)}
                    onChange={(e) => {
                        const options = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                        setSelectedProfs(options);
                    }}
                >
                    {professionals.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">{t('chats.ctrl_click_multiple')}</p>
            </div>
        </div>
    );
};

export default AnalyticsFilters;
