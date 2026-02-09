import { useState, useEffect } from 'react';
import { Settings, Globe, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../api/axios';
import { useTranslation } from '../context/LanguageContext';

type UiLanguage = 'es' | 'en' | 'fr';

interface ClinicSettings {
    name: string;
    location?: string;
    hours_start?: string;
    hours_end?: string;
    ui_language: UiLanguage;
}

const LANGUAGE_OPTIONS: { value: UiLanguage; labelKey: string }[] = [
    { value: 'es', labelKey: 'config.language_es' },
    { value: 'en', labelKey: 'config.language_en' },
    { value: 'fr', labelKey: 'config.language_fr' },
];

export default function ConfigView() {
    const { t, setLanguage } = useTranslation();
    const [settings, setSettings] = useState<ClinicSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [selectedLang, setSelectedLang] = useState<UiLanguage>('en');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await api.get<ClinicSettings>('/admin/settings/clinic');
            setSettings(res.data);
            setSelectedLang((res.data.ui_language as UiLanguage) || 'en');
        } catch (err) {
            setError(t('config.load_error'));
        } finally {
            setLoading(false);
        }
    };

    const handleLanguageChange = async (value: UiLanguage) => {
        setSelectedLang(value);
        setSuccess(null);
        setError(null);
        setLanguage(value);
        setSaving(true);
        try {
            await api.patch('/admin/settings/clinic', { ui_language: value });
            setSettings((prev) => (prev ? { ...prev, ui_language: value } : null));
            setSuccess(t('config.saved'));
        } catch (err) {
            setError(t('config.save_error'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
                    <Settings size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('config.title')}</h1>
                    <p className="text-sm text-gray-500">{t('config.subtitle')}</p>
                </div>
            </div>

            {settings && (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Globe size={20} className="text-gray-600" />
                            <h2 className="text-lg font-semibold text-gray-800">{t('config.language_label')}</h2>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            {t('config.language_help')}
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {LANGUAGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleLanguageChange(opt.value)}
                                    disabled={saving}
                                    className={`px-4 py-2.5 rounded-xl font-medium transition-colors border-2 min-h-[44px] touch-manipulation ${
                                        selectedLang === opt.value
                                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    {saving && selectedLang === opt.value ? (
                                        <Loader2 className="w-5 h-5 animate-spin inline-block" />
                                    ) : (
                                        t(opt.labelKey)
                                    )}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-3">
                            {t('config.current_clinic')}: <strong>{settings.name}</strong>
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mt-4 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle2 size={18} />
                    {success}
                </div>
            )}
        </div>
    );
}
