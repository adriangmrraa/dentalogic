import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, MessageCircle, LogIn, Sparkles, Calendar, BarChart3 } from 'lucide-react';

const WHATSAPP_NUMBER = '5493435256815';
const WHATSAPP_PREDEFINED_MESSAGE = 'Hola, quisiera consultar por turnos para limpieza dental.';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PREDEFINED_MESSAGE)}`;

export default function LandingView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-medical-50/30 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-2xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-medical-600 text-white shadow-lg shadow-medical-600/25 mb-6">
              <Shield size={32} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Dentalogic
            </h1>
            <p className="mt-3 text-lg text-gray-600 max-w-md mx-auto">
              Gestión inteligente para tu clínica dental: agenda, pacientes, IA conversacional y analíticas en una sola plataforma.
            </p>
          </div>

          {/* Glass card: info + credentials */}
          <div className="landing-glass rounded-2xl border border-white-300 shadow-card p-6 sm:p-8 space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Sparkles className="text-medical-600" size={22} />
              Información estratégica
            </h2>
            <ul className="space-y-3 text-gray-700 text-sm sm:text-base">
              <li className="flex items-start gap-3">
                <Calendar className="text-medical-600 shrink-0 mt-0.5" size={18} />
                <span>Agenda unificada por sede y profesional, con integración a Google Calendar.</span>
              </li>
              <li className="flex items-start gap-3">
                <MessageCircle className="text-medical-600 shrink-0 mt-0.5" size={18} />
                <span>Agente IA por WhatsApp: triaje, turnos y derivación a humano cuando hace falta.</span>
              </li>
              <li className="flex items-start gap-3">
                <BarChart3 className="text-medical-600 shrink-0 mt-0.5" size={18} />
                <span>Analíticas y métricas para CEO y profesionales.</span>
              </li>
            </ul>
            <div className="pt-2 pb-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Credenciales de prueba</p>
              <div className="bg-white/80 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 font-mono">
                <p><span className="text-gray-500">Email:</span> gamarraadrian200@gmail.com</p>
                <p className="mt-1"><span className="text-gray-500">Contraseña:</span> Wstg1793.</p>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="space-y-4">
            <Link
              to="/login?demo=1"
              className="btn-primary w-full flex items-center justify-center gap-3 rounded-xl py-4 text-base font-semibold shadow-lg shadow-medical-600/20 hover:shadow-medical-600/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <LogIn size={20} />
              Probar app
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 rounded-xl py-4 text-base font-semibold border-2 border-medical-600 text-medical-600 bg-white hover:bg-medical-50 transition-all"
            >
              <MessageCircle size={20} />
              Probar Agente IA
            </a>
            <div className="pt-4">
              <Link
                to="/login"
                className="btn-secondary w-full flex items-center justify-center gap-2 rounded-xl py-3 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .landing-glass {
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          transition: box-shadow 0.3s ease, border-color 0.3s ease;
        }
        .landing-glass:hover {
          box-shadow: 0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04);
          border-color: var(--medical-300);
        }
      `}</style>
    </div>
  );
}
