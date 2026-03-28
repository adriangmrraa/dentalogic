import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, MessageCircle, LogIn, Sparkles, Calendar, BarChart3, Zap, ChevronDown } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import DynamicShowcase from '../components/public/DynamicShowcase';
import { useDemoTracking } from '../hooks/useDemoTracking';

const DEMO_WHATSAPP = import.meta.env.VITE_DEMO_WHATSAPP || '5493435256815';
const DEMO_MESSAGE = 'Hola, quisiera consultar por turnos.';
const WHATSAPP_URL = `https://wa.me/${DEMO_WHATSAPP}?text=${encodeURIComponent(DEMO_MESSAGE)}`;

export default function LandingView() {
  const { t } = useTranslation();
  const { trackEvent } = useDemoTracking();

  return (
    <div className="landing-root min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-medical-50/20">
      <main className="flex-1 w-full pb-12 sm:pb-16 overflow-x-hidden">
        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center min-h-[90vh] px-4 py-8 sm:p-6 md:p-8">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full max-w-md sm:max-w-lg mx-auto space-y-6 sm:space-y-8"
          >
            {/* Hero Header */}
            <header className="text-center pt-2 sm:pt-0">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-medical-600 text-white shadow-xl shadow-medical-600/25 mb-4 sm:mb-5 ring-4 ring-medical-600/10"
              >
                <Shield size={28} className="sm:w-8 sm:h-8" strokeWidth={2} />
              </motion.div>
              <p className="text-xs sm:text-sm font-semibold text-medical-600 uppercase tracking-widest mb-2">
                {t('landing.platform_label')}
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight mb-4">
                {t('landing.headline')}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-sm mx-auto leading-relaxed">
                {t('landing.subheadline')}
              </p>
            </header>

            {/* CTA principal */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="space-y-3 sm:space-y-4"
            >
              <Link
                to="/login?demo=1"
                onClick={() => trackEvent('button_click', { button: 'try_app' })}
                className="landing-cta-primary flex items-center justify-center gap-3 w-full rounded-2xl py-4 sm:py-5 text-base sm:text-lg font-bold text-white bg-medical-600 hover:bg-medical-700 active:scale-[0.98] transition-all shadow-xl shadow-medical-600/25 hover:shadow-medical-600/30 min-h-[52px] sm:min-h-[56px] touch-manipulation"
              >
                <Zap size={22} className="shrink-0" />
                {t('landing.cta_try_app')}
              </Link>
              <p className="text-center text-xs text-gray-500 px-2 font-medium">
                {t('landing.cta_disclaimer')}
              </p>
            </motion.div>

            {/* Card: beneficios + credenciales */}
            <motion.section 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="landing-glass rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-2xl overflow-hidden"
            >
              <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Sparkles className="text-medical-600 shrink-0" size={20} />
                  {t('landing.demo_title')}
                </h2>
                <ul className="space-y-3 sm:space-y-4 text-gray-700 text-sm sm:text-base font-medium">
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-medical-50 to-medical-100 text-medical-600 shrink-0 shadow-sm border border-medical-100/50">
                      <Calendar size={18} />
                    </span>
                    <span>{t('landing.feature_agenda')}</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 shrink-0 shadow-sm border border-emerald-100/50">
                      <MessageCircle size={18} />
                    </span>
                    <span>{t('landing.feature_ai')}</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600 shrink-0 shadow-sm border border-violet-100/50">
                      <BarChart3 size={18} />
                    </span>
                    <span>{t('landing.feature_analytics')}</span>
                  </li>
                </ul>
                <details className="group pt-2">
                  <summary className="flex items-center justify-between gap-2 py-3 rounded-xl px-4 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer list-none text-sm font-semibold text-gray-600 hover:text-gray-800 select-none touch-manipulation">
                    <span>{t('landing.demo_credentials_title')}</span>
                    <ChevronDown size={18} className="shrink-0 transition-transform duration-300 group-open:rotate-180 text-medical-600" />
                  </summary>
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 p-4 rounded-xl bg-slate-800 text-sm text-gray-300 font-mono shadow-inner"
                  >
                    <p><span className="text-gray-400">Email:</span> ceo@example.com</p>
                    <p className="mt-2"><span className="text-gray-400">{t('landing.credentials_password') || 'Pass'}:</span> Ceo12345</p>
                  </motion.div>
                </details>
              </div>
            </motion.section>

            {/* CTAs secundarios */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="space-y-3 sm:space-y-4 pt-2"
            >
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('whatsapp_click', { button: 'whatsapp_cta' })}
                className="flex items-center justify-center gap-3 w-full rounded-2xl py-3.5 sm:py-4 text-sm sm:text-base font-semibold border-2 border-medical-600 text-medical-600 bg-white hover:bg-medical-50 active:scale-[0.98] transition-all min-h-[48px] touch-manipulation shadow-md"
              >
                <MessageCircle size={20} className="shrink-0" />
                {t('landing.cta_whatsapp')}
              </a>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors min-h-[44px] touch-manipulation"
                >
                  <LogIn size={18} />
                  {t('landing.cta_login')}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Dynamic Showcase Section (The Genial Animations) */}
        <div className="relative z-10 bg-white/50 backdrop-blur-3xl border-t border-gray-100 mt-20">
          <DynamicShowcase />
        </div>
      </main>

      <style>{`
        .landing-root {
          -webkit-tap-highlight-color: transparent;
        }
        .landing-glass {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .landing-cta-primary:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}
