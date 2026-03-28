import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, MessageCircle, BarChart3 } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

const features = [
  {
    icon: Calendar,
    title: 'Agenda Inteligente',
    description: 'Gestión de turnos fluida y sincronizada. Reduce el ausentismo con recordatorios automáticos por WhatsApp y optimiza el tiempo de tu equipo.',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    glow: 'from-blue-500/20',
    mockup: '🗓️'
  },
  {
    icon: MessageCircle,
    title: 'Agente IA 24/7',
    description: 'Tus pacientes son atendidos al instante en cualquier momento del día. La IA responde dudas médicas frecuentes y agenda citas sin intervención humana.',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    glow: 'from-emerald-500/20',
    mockup: '🤖'
  },
  {
    icon: BarChart3,
    title: 'Analítica Avanzada',
    description: 'Toma decisiones basadas en datos. Visualiza el crecimiento de tu clínica, ingresos por tratamiento y rendimiento de campañas de marketing en tiempo real.',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    glow: 'from-violet-500/20',
    mockup: '📊'
  }
];

export default function DynamicShowcase() {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-6xl mx-auto py-24 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-24">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight"
        >
          {t('landing.showcase_title') || 'La clínica del futuro, hoy'}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed"
        >
          {t('landing.showcase_subtitle') || 'Descubre por qué Dentalogic es la plataforma preferida por clínicas líderes.'}
        </motion.p>
      </div>

      <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-start">
        {/* Sticky Left Content */}
        <div className="lg:w-1/2 lg:sticky lg:top-32 space-y-16">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, margin: "-20% 0px -20% 0px" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex gap-6 lg:gap-8"
            >
              <div className={`shrink-0 w-14 h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center border ${feature.color}`}>
                <feature.icon size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-white/50 leading-relaxed text-lg">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dynamic Right Cards */}
        <div className="lg:w-1/2 space-y-24 w-full mt-16 lg:mt-0">
          {features.map((feature, idx) => (
            <motion.div
              key={`mockup-${idx}`}
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: false, margin: "-20% 0px -20% 0px" }}
              transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
              className="rounded-[2rem] p-8 aspect-[4/3] flex flex-col items-center justify-center border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl overflow-hidden relative group cursor-default"
            >
              {/* Decorative glow */}
              <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${feature.glow} to-transparent rounded-full blur-3xl -mr-20 -mt-20 transition-transform duration-700 group-hover:scale-150`} />
              <div className={`absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr ${feature.glow} to-transparent rounded-full blur-3xl -ml-10 -mb-10 transition-transform duration-700 group-hover:scale-125`} />

              <motion.div
                whileHover={{ rotate: 10, scale: 1.15 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative z-10 text-8xl mb-8 drop-shadow-xl"
              >
                {feature.mockup}
              </motion.div>

              {/* Animated progress bars */}
              <div className="relative z-10 w-full max-w-sm mt-8 space-y-4">
                <div className="h-4 bg-white/[0.06] rounded-full w-3/4 overflow-hidden relative">
                  <motion.div
                    initial={{ x: "-100%" }}
                    whileInView={{ x: "0%" }}
                    transition={{ duration: 1, delay: 0.3 }}
                    className="absolute inset-0 bg-gradient-to-r from-blue-500/60 to-blue-400/40"
                  />
                </div>
                <div className="h-4 bg-white/[0.06] rounded-full w-full overflow-hidden relative">
                  <motion.div
                    initial={{ x: "-100%" }}
                    whileInView={{ x: "0%" }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="absolute inset-0 bg-gradient-to-r from-emerald-500/60 to-emerald-400/40"
                  />
                </div>
                <div className="h-4 bg-white/[0.06] rounded-full w-5/6" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
