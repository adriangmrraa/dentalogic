import { X, Info } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface DemoConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

export default function DemoConnectModal({ isOpen, onClose, featureName }: DemoConnectModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#0d1117] p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Info size={24} className="text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">{t('demo.modal_title')}</h3>
        </div>

        <p className="text-white/60 text-sm leading-relaxed mb-2">
          {t('demo.modal_description', { feature: featureName })}
        </p>
        <p className="text-white/40 text-xs leading-relaxed mb-6">
          {t('demo.modal_cta_text')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.06] text-white/70 font-medium hover:bg-white/[0.04] transition-colors"
          >
            {t('common.understood')}
          </button>
          <a
            href="https://wa.me/5493704706902?text=Hola,%20me%20interesa%20la%20plataforma"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors text-center"
          >
            {t('demo.contact_team')}
          </a>
        </div>
      </div>
    </div>
  );
}
