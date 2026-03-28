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
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse at top right, #0d1830, #06060e 60%)' }}>
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
                className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-400 shadow-xl shadow-blue-500/10 mb-4 sm:mb-5"
              >
                <Shield size={28} className="sm:w-8 sm:h-8" strokeWidth={2} />
              </motion.div>
              <p className="text-xs sm:text-sm font-semibold text-blue-400 uppercase tracking-widest mb-2">
                {t('landing.platform_label')}
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight mb-4">
                {t('landing.headline')}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-white/50 max-w-sm mx-auto leading-relaxed">
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
                className="flex items-center justify-center gap-3 w-full rounded-2xl py-4 sm:py-5 text-base sm:text-lg font-bold text-gray-900 bg-white hover:bg-white/90 active:scale-[0.98] transition-all shadow-xl shadow-white/10 min-h-[52px] sm:min-h-[56px] touch-manipulation"
              >
                <Zap size={22} className="shrink-0" />
                {t('landing.cta_try_app')}
              </Link>
              <p className="text-center text-xs text-white/30 px-2 font-medium">
                {t('landing.cta_disclaimer')}
              </p>
            </motion.div>

            {/* Card: beneficios + credenciales */}
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="rounded-2xl sm:rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
                <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="text-blue-400 shrink-0" size={20} />
                  {t('landing.demo_title')}
                </h2>
                <ul className="space-y-3 sm:space-y-4 text-white/70 text-sm sm:text-base font-medium">
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 border border-blue-500/20">
                      <Calendar size={18} />
                    </span>
                    <span>{t('landing.feature_agenda')}</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0 border border-emerald-500/20">
                      <MessageCircle size={18} />
                    </span>
                    <span>{t('landing.feature_ai')}</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 shrink-0 border border-violet-500/20">
                      <BarChart3 size={18} />
                    </span>
                    <span>{t('landing.feature_analytics')}</span>
                  </li>
                </ul>
                <details className="group pt-2">
                  <summary className="flex items-center justify-between gap-2 py-3 rounded-xl px-4 bg-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer list-none text-sm font-semibold text-white/50 hover:text-white/70 select-none touch-manipulation">
                    <span>{t('landing.demo_credentials_title')}</span>
                    <ChevronDown size={18} className="shrink-0 transition-transform duration-300 group-open:rotate-180 text-blue-400" />
                  </summary>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 font-mono"
                  >
                    <p><span className="text-white/30">Email:</span> ceo@example.com</p>
                    <p className="mt-2"><span className="text-white/30">{t('landing.credentials_password') || 'Pass'}:</span> Ceo12345</p>
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
                className="flex items-center justify-center gap-3 w-full rounded-2xl py-3.5 sm:py-4 text-sm sm:text-base font-semibold border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-[0.98] transition-all min-h-[48px] touch-manipulation"
              >
                <MessageCircle size={20} className="shrink-0" />
                {t('landing.cta_whatsapp')}
              </a>
              <div className="pt-2">
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors min-h-[44px] touch-manipulation"
                >
                  <LogIn size={18} />
                  {t('landing.cta_login')}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Dynamic Showcase Section */}
        <div className="relative z-10 border-t border-white/[0.06] mt-20">
          <DynamicShowcase />
        </div>
      </main>
    </div>
  );
}
