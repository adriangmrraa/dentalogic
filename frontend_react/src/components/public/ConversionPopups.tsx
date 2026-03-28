import { useState, useEffect, useCallback } from 'react';
import { X, Zap, Users, TrendingUp, MessageCircle, Star, Clock, Shield, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PopupMessage {
  id: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  color: string;
  cta?: { label: string; to: string };
}

const SOCIAL_PROOF: PopupMessage[] = [
  {
    id: 'clinics',
    icon: <Users size={18} />,
    title: '50+ clínicas confían en Dentalogic',
    text: 'Únite a la red de clínicas que ya automatizaron su gestión.',
    color: 'blue',
    cta: { label: 'Probar demo', to: '/login?demo=1' },
  },
  {
    id: 'whatsapp',
    icon: <MessageCircle size={18} />,
    title: 'La IA agendó 3 turnos en la última hora',
    text: 'El agente de WhatsApp trabaja 24/7 sin descanso.',
    color: 'emerald',
    cta: { label: 'Ver cómo funciona', to: '/login?demo=1' },
  },
  {
    id: 'revenue',
    icon: <TrendingUp size={18} />,
    title: '+40% de turnos agendados',
    text: 'Clínicas que usan IA reportan un 40% más de turnos que antes.',
    color: 'violet',
  },
  {
    id: 'stars',
    icon: <Star size={18} />,
    title: '4.9 ★ satisfacción de clientes',
    text: '"Nos cambió la vida. Ahora los pacientes agendan solos."',
    color: 'amber',
  },
  {
    id: 'time',
    icon: <Clock size={18} />,
    title: 'Ahorrá 15 horas por semana',
    text: 'La IA se encarga de las consultas repetitivas y la agenda.',
    color: 'cyan',
  },
  {
    id: 'security',
    icon: <Shield size={18} />,
    title: 'Datos protegidos con encriptación AES-256',
    text: 'Cumplimos con los estándares de seguridad más exigentes.',
    color: 'rose',
  },
  {
    id: 'recent',
    icon: <Zap size={18} />,
    title: 'Una clínica de Buenos Aires se unió hace 2 min',
    text: 'La demanda crece. No te quedes atrás.',
    color: 'blue',
    cta: { label: 'Empezar ahora', to: '/login?demo=1' },
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/25', text: 'text-blue-400', iconBg: 'bg-blue-500/20' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', iconBg: 'bg-emerald-500/20' },
  violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/25', text: 'text-violet-400', iconBg: 'bg-violet-500/20' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', text: 'text-amber-400', iconBg: 'bg-amber-500/20' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/25', text: 'text-cyan-400', iconBg: 'bg-cyan-500/20' },
  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/25', text: 'text-rose-400', iconBg: 'bg-rose-500/20' },
};

export default function ConversionPopups() {
  const [current, setCurrent] = useState<PopupMessage | null>(null);
  const [exiting, setExiting] = useState(false);
  const [shown, setShown] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setCurrent(null);
      setExiting(false);
    }, 400);
  }, []);

  useEffect(() => {
    if (dismissed) return;

    // First popup after 8 seconds, then every 25-40 seconds
    const firstDelay = 8000;
    const interval = 25000 + Math.random() * 15000;

    const showNext = () => {
      if (shown >= SOCIAL_PROOF.length) {
        setShown(0); // loop
      }
      const msg = SOCIAL_PROOF[shown % SOCIAL_PROOF.length];
      setCurrent(msg);
      setShown(prev => prev + 1);

      // Auto-dismiss after 6 seconds
      setTimeout(dismiss, 6000);
    };

    const timer = setTimeout(showNext, shown === 0 ? firstDelay : interval);
    return () => clearTimeout(timer);
  }, [shown, dismissed, dismiss]);

  if (!current || dismissed) return null;

  const c = COLOR_MAP[current.color] || COLOR_MAP.blue;

  return (
    <>
      <div
        className="fixed z-[90] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
        style={{
          animation: exiting
            ? 'popupSlideOut 0.4s cubic-bezier(0.55, 0, 1, 0.45) forwards'
            : 'popupSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className={`${c.bg} border ${c.border} backdrop-blur-2xl rounded-2xl p-4 shadow-2xl shadow-black/30`}>
          <div className="flex gap-3">
            {/* Icon */}
            <div className={`shrink-0 w-10 h-10 rounded-xl ${c.iconBg} ${c.text} flex items-center justify-center`}>
              {current.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white leading-tight">{current.title}</h4>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">{current.text}</p>

              {current.cta && (
                <Link
                  to={current.cta.to}
                  className={`inline-flex items-center gap-1.5 mt-2.5 text-xs font-bold ${c.text} hover:underline`}
                >
                  {current.cta.label} <ArrowRight size={12} />
                </Link>
              )}
            </div>

            {/* Close */}
            <button
              onClick={() => { dismiss(); setDismissed(true); }}
              className="shrink-0 p-1 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-colors self-start"
            >
              <X size={14} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full ${c.text.replace('text-', 'bg-').replace('400', '500/40')}`}
              style={{
                animation: exiting ? 'none' : 'popupProgress 6s linear',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes popupSlideIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes popupSlideOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(10px) scale(0.97); }
        }
        @keyframes popupProgress {
          0% { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </>
  );
}
