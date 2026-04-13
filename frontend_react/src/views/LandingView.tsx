import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, MessageCircle, LogIn, Sparkles, Calendar, BarChart3, Zap, ChevronDown, CheckCircle, Users, Clock, Star, ArrowRight, Stethoscope } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import ParticleBackground from '../components/public/ParticleBackground';
import ConversionPopups from '../components/public/ConversionPopups';
import { useDemoTracking } from '../hooks/useDemoTracking';

const DEMO_WHATSAPP = import.meta.env.VITE_DEMO_WHATSAPP || '5491162793009';

const SHOWCASE_IMAGES = [
  'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80',
  'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800&q=80',
  'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=800&q=80',
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

export default function LandingView() {
  const { t } = useTranslation();
  const { trackEvent } = useDemoTracking();
  const demoMessage = t('demo.whatsapp_message');
  const whatsappUrl = `https://wa.me/${DEMO_WHATSAPP}?text=${encodeURIComponent(demoMessage)}`;

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: 'radial-gradient(ellipse at top right, #0d1830, #06060e 60%)' }}>
      <ParticleBackground particleCount={80} />
      <ConversionPopups />

      <main className="flex-1 w-full overflow-x-hidden relative z-10">

        {/* ═══════════ HERO ═══════════ */}
        <section className="flex flex-col items-center justify-center min-h-screen px-4 sm:px-8 lg:px-16 py-12 sm:py-16">
          <motion.div {...fadeUp} transition={{ duration: 0.7 }} className="w-full max-w-4xl xl:max-w-5xl mx-auto text-center space-y-8">

            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-400 shadow-xl shadow-blue-500/10 mb-2">
              <Stethoscope size={32} strokeWidth={1.8} />
            </motion.div>

            <div>
              <p className="text-sm font-bold text-blue-400 uppercase tracking-[0.2em] mb-4">
                {t('landing.platform_label') || 'Plataforma para clinicas dentales'}
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1]">
                {t('landing.headline') || 'Agenda, pacientes e IA en una sola app'}
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-white/40 max-w-xl mx-auto leading-relaxed">
                {t('landing.subheadline') || 'Proba la plataforma en un clic. Sin tarjeta. Acceso inmediato a la demo.'}
              </p>
            </div>

            {/* CTAs */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link to="/login?demo=1" onClick={() => trackEvent('button_click', { button: 'try_app' })}
                className="flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-gray-900 bg-white rounded-2xl hover:bg-white/90 active:scale-[0.98] transition-all shadow-xl shadow-white/10 min-h-[56px]">
                <Zap size={20} /> {t('landing.cta_try_app') || 'Probar app'}
              </Link>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('whatsapp_click', {})}
                className="flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl hover:bg-emerald-500/20 active:scale-[0.98] transition-all min-h-[56px]">
                <MessageCircle size={20} /> {t('landing.cta_whatsapp') || 'Probar agente WhatsApp'}
              </a>
            </motion.div>

            <p className="text-xs text-white/20">{t('landing.cta_disclaimer') || 'Te logueamos automaticamente en la cuenta demo'}</p>
          </motion.div>
        </section>

        {/* ═══════════ STATS BAR ═══════════ */}
        <motion.section {...fadeUp} transition={{ delay: 0.2 }}
          className="max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 -mt-8 mb-20">
          <div className="flex justify-center gap-8 sm:gap-16 py-6 px-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xl">
            {[
              { value: '20+', label: t('landing.stat_professionals') || 'Profesionales' },
              { value: '5K+', label: t('landing.stat_patients') || 'Pacientes' },
              { value: '99.9%', label: t('landing.stat_uptime') || 'Uptime' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-white">{stat.value}</div>
                <div className="text-xs text-white/30 font-medium mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ═══════════ FEATURES GRID ═══════════ */}
        <section className="max-w-7xl xl:max-w-[90rem] mx-auto px-4 sm:px-8 lg:px-16 py-20">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              {t('landing.features_title') || 'Todo lo que tu clinica necesita'}
            </h2>
            <p className="text-white/40 text-lg max-w-2xl mx-auto">
              {t('landing.features_subtitle') || 'Una plataforma completa que transforma la gestion de tu clinica dental'}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Calendar, title: t('landing.feat_agenda') || 'Agenda inteligente', desc: t('landing.feat_agenda_desc') || 'Gestion de turnos por profesional y sede. Sincronizacion con Google Calendar. Recordatorios automaticos.', color: 'blue', img: SHOWCASE_IMAGES[0] },
              { icon: MessageCircle, title: t('landing.feat_ai') || 'Agente IA 24/7', desc: t('landing.feat_ai_desc') || 'Atencion automatica por WhatsApp. Agenda turnos, responde dudas, detecta urgencias y cobra senas.', color: 'emerald', img: SHOWCASE_IMAGES[1] },
              { icon: BarChart3, title: t('landing.feat_analytics') || 'Analitica avanzada', desc: t('landing.feat_analytics_desc') || 'Dashboard con KPIs en tiempo real. Ingresos, tasa de asistencia, rendimiento por profesional.', color: 'violet', img: SHOWCASE_IMAGES[2] },
              { icon: Sparkles, title: t('landing.feat_odontogram') || 'Odontograma digital', desc: t('landing.feat_odontogram_desc') || 'Registro clinico visual con 10 estados por pieza dental. Animaciones y colores por patologia.', color: 'amber' },
              { icon: Users, title: t('landing.feat_patients') || 'Ficha de pacientes', desc: t('landing.feat_patients_desc') || 'Historia clinica completa, anamnesis digital, galeria de documentos y radiografias.', color: 'cyan' },
              { icon: Star, title: t('landing.feat_marketing') || 'Marketing Hub', desc: t('landing.feat_marketing_desc') || 'ROI real de Meta Ads y Google Ads. Atribucion de pacientes por campaña.', color: 'pink' },
            ].map((feat, i) => {
              const colorMap: Record<string, string> = {
                blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
              };
              return (
                <motion.div key={i} {...fadeUp} transition={{ delay: i * 0.1 }}
                  className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 overflow-hidden group hover:border-white/[0.12] transition-all duration-500">
                  {feat.img && (
                    <div className="absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-700 bg-cover bg-center"
                      style={{ backgroundImage: `url(${feat.img})`, filter: 'blur(1px)' }} />
                  )}
                  <div className="relative z-10">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border mb-4 ${colorMap[feat.color]}`}>
                      <feat.icon size={22} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
                    <p className="text-sm text-white/40 leading-relaxed">{feat.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <section className="max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-20">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              {t('landing.how_title') || 'Como funciona'}
            </h2>
          </motion.div>

          <div className="space-y-6">
            {[
              { step: '1', title: t('landing.step1_title') || 'Proba la demo', desc: t('landing.step1_desc') || 'Un clic y entras a la plataforma completa. Sin registrarte, sin tarjeta.', icon: Zap },
              { step: '2', title: t('landing.step2_title') || 'Habla con la IA', desc: t('landing.step2_desc') || 'Escribile al agente por WhatsApp. Ve como agenda un turno automaticamente.', icon: MessageCircle },
              { step: '3', title: t('landing.step3_title') || 'Ve la magia', desc: t('landing.step3_desc') || 'La notificacion aparece en tiempo real. El turno se refleja en la agenda. Todo automatico.', icon: Sparkles },
            ].map((s, i) => (
              <motion.div key={i} {...fadeUp} transition={{ delay: i * 0.15 }}
                className="flex gap-6 items-start p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-lg font-black shrink-0">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">{s.title}</h3>
                  <p className="text-white/40">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════ TESTIMONIAL / SOCIAL PROOF ═══════════ */}
        <section className="max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-20">
          <motion.div {...fadeUp}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03] bg-cover bg-center" style={{ backgroundImage: `url(${SHOWCASE_IMAGES[0]})` }} />
            <div className="relative z-10">
              <div className="flex justify-center gap-1 mb-6">
                {[...Array(5)].map((_, i) => <Star key={i} size={20} className="text-amber-400 fill-amber-400" />)}
              </div>
              <blockquote className="text-xl sm:text-2xl text-white/80 font-medium leading-relaxed mb-6 italic">
                {t('landing.testimonial_text') || '"Desde que implementamos Dentalogic, la atencion automatica por WhatsApp nos triplicó los turnos agendados fuera de horario."'}
              </blockquote>
              <div className="text-white/40 text-sm">
                <span className="text-white/60 font-semibold">{t('landing.testimonial_author') || 'Dra. Martinez'}</span> — {t('landing.testimonial_role') || 'Directora, Clinica Dental Premium'}
              </div>
            </div>
          </motion.div>
        </section>

        {/* ═══════════ FINAL CTA ═══════════ */}
        <section className="max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 py-20 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              {t('landing.final_cta_title') || 'Transforma tu clinica hoy'}
            </h2>
            <p className="text-white/40 text-lg mb-8 max-w-xl mx-auto">
              {t('landing.final_cta_desc') || 'Unite a las clinicas que ya gestionan todo con inteligencia artificial'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/login?demo=1"
                className="flex items-center justify-center gap-3 px-8 py-4 text-base font-bold text-gray-900 bg-white rounded-2xl hover:bg-white/90 active:scale-[0.98] transition-all shadow-xl">
                <Zap size={20} /> {t('landing.cta_try_app') || 'Probar app'}
              </Link>
              <Link to="/login"
                className="flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-white/50 border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all">
                <LogIn size={18} /> {t('landing.cta_login') || 'Iniciar sesion'}
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] py-8 text-center">
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} Dentalogic. {t('landing.footer') || 'Inteligencia artificial para clinicas dentales.'}
          </p>
        </footer>
      </main>
    </div>
  );
}
