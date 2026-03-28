import { useState, useEffect } from 'react';
import { Settings, Globe, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../api/axios';
import { useTranslation } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import GlassCard from '../components/GlassCard';

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

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await api.get<ClinicSettings>('/admin/settings/clinic');
            setSettings(res.data);
            setSelectedLang((res.data.ui_language as UiLanguage) || 'en');
        } catch (err) { setError(t('config.load_error')); }
        finally { setLoading(false); }
    };

    const handleLanguageChange = async (value: UiLanguage) => {
        setSelectedLang(value); setSuccess(null); setError(null); setLanguage(value); setSaving(true);
        try {
            await api.patch('/admin/settings/clinic', { ui_language: value });
            setSettings((prev) => (prev ? { ...prev, ui_language: value } : null));
            setSuccess(t('config.saved'));
        } catch (err) { setError(t('config.save_error')); }
        finally { setSaving(false); }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-6 max-w-2xl h-full overflow-y-auto">
            <PageHeader title={t('config.title')} subtitle={t('config.subtitle')} icon={<Settings size={22} />} />

            {settings && (
                <div className="space-y-6">
                    <GlassCard>
                        <div className="flex items-center gap-2 mb-4">
                            <Globe size={20} className="text-blue-400" />
                            <h2 className="text-lg font-semibold text-white">{t('config.language_label')}</h2>
                        </div>
                        <p className="text-sm text-white/40 mb-4">{t('config.language_help')}</p>
                        <div className="flex flex-wrap gap-3">
                            {LANGUAGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleLanguageChange(opt.value)}
                                    disabled={saving}
                                    className={`px-4 py-2.5 rounded-xl font-medium transition-all border min-h-[44px] touch-manipulation ${
                                        selectedLang === opt.value
                                            ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                                            : 'border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.06]'
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
                        <p className="text-xs text-white/30 mt-3">
                            {t('config.current_clinic')}: <strong className="text-white/50">{settings.name}</strong>
                        </p>
                    </GlassCard>
                </div>
            )}

            {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
            )}
            {success && (
                <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
                    <CheckCircle2 size={18} /> {success}
                </div>
            )}
        </div>
    );
}
