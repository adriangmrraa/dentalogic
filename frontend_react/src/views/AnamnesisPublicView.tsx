import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Stethoscope } from 'lucide-react';
import api from '../api/axios';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantInfo {
  name: string;
  logoUrl?: string;
}

interface TokenValidation {
  valid: boolean;
  patientName?: string;
  tenant?: TenantInfo;
}

interface PersonalData {
  fullName: string;
  birthdate: string;
  phone: string;
  email: string;
  insurance: string;
}

interface MedicalHistory {
  allergies: string;
  medications: string;
  chronicConditions: string;
  surgeries: string;
  pregnancyStatus: 'none' | 'pregnant' | 'lactating';
}

interface DentalHistory {
  lastVisit: string;
  brushingFrequency: string;
  sensitivities: string;
  bruxism: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEP_LABELS = ['Datos personales', 'Historia clínica', 'Historia dental'];

const INPUT_CLS =
  'w-full bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/30 transition-colors';

const SELECT_CLS =
  'w-full bg-white/[0.04] border border-white/[0.08] text-white rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/30 transition-colors [&>option]:bg-[#12121a] [&>option]:text-white';

const LABEL_CLS = 'block text-sm font-medium text-white/70 mb-1.5';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AnamnesisPublicView() {
  const { tenantId, token } = useParams<{ tenantId: string; token: string }>();

  // --- state -----------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  const [step, setStep] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [animating, setAnimating] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [personal, setPersonal] = useState<PersonalData>({
    fullName: '',
    birthdate: '',
    phone: '',
    email: '',
    insurance: '',
  });

  const [medical, setMedical] = useState<MedicalHistory>({
    allergies: '',
    medications: '',
    chronicConditions: '',
    surgeries: '',
    pregnancyStatus: 'none',
  });

  const [dental, setDental] = useState<DentalHistory>({
    lastVisit: '',
    brushingFrequency: '',
    sensitivities: '',
    bruxism: false,
  });

  // --- token validation ------------------------------------------------
  useEffect(() => {
    const validate = async () => {
      try {
        const { data } = await api.get<TokenValidation>(
          `/public/anamnesis/validate/${token}`,
        );
        if (data.valid) {
          setTenant(data.tenant ?? { name: 'Clinica' });
          if (data.patientName) {
            setPersonal((p) => ({ ...p, fullName: data.patientName! }));
          }
        } else {
          setValidationError(
            'El enlace es invalido o ha expirado. Solicita uno nuevo a la clinica.',
          );
        }
      } catch {
        setValidationError(
          'No pudimos validar el enlace. Verifica tu conexion o solicita uno nuevo.',
        );
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  // --- navigation helpers ----------------------------------------------
  const goTo = (target: number) => {
    if (animating || target === step) return;
    setSlideDirection(target > step ? 'left' : 'right');
    setAnimating(true);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
    }, 250);
  };

  const next = () => step < 2 && goTo(step + 1);
  const prev = () => step > 0 && goTo(step - 1);

  // --- submit ----------------------------------------------------------
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post(`/public/anamnesis/${token}`, {
        personalData: personal,
        medicalHistory: medical,
        dentalHistory: dental,
      });
      setSubmitted(true);
    } catch {
      setSubmitError('Hubo un error al enviar. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- progress bar ----------------------------------------------------
  const ProgressBar = () => (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className="flex items-center justify-between mb-3">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => goTo(i)}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              i <= step ? 'text-white' : 'text-white/30'
            }`}
          >
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-all duration-300 ${
                i < step
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : i === step
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white/[0.06] text-white/30 border border-white/[0.08]'
              }`}
            >
              {i < step ? '\u2713' : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((step + 1) / 3) * 100}%` }}
        />
      </div>
    </div>
  );

  // --- step renderers --------------------------------------------------
  const StepPersonal = () => (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Nombre completo</label>
        <input
          className={INPUT_CLS}
          placeholder="Juan Perez"
          value={personal.fullName}
          onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Fecha de nacimiento</label>
          <input
            type="date"
            className={INPUT_CLS}
            value={personal.birthdate}
            onChange={(e) => setPersonal({ ...personal, birthdate: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Telefono</label>
          <input
            className={INPUT_CLS}
            placeholder="+54 11 1234-5678"
            value={personal.phone}
            onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Email</label>
        <input
          type="email"
          className={INPUT_CLS}
          placeholder="juan@email.com"
          value={personal.email}
          onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Obra social / Prepaga</label>
        <input
          className={INPUT_CLS}
          placeholder="OSDE, Swiss Medical, etc."
          value={personal.insurance}
          onChange={(e) => setPersonal({ ...personal, insurance: e.target.value })}
        />
      </div>
    </div>
  );

  const StepMedical = () => (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Alergias</label>
        <textarea
          rows={2}
          className={INPUT_CLS + ' resize-none'}
          placeholder="Penicilina, latex... (dejar vacio si no aplica)"
          value={medical.allergies}
          onChange={(e) => setMedical({ ...medical, allergies: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Medicamentos actuales</label>
        <textarea
          rows={2}
          className={INPUT_CLS + ' resize-none'}
          placeholder="Ibuprofeno, omeprazol..."
          value={medical.medications}
          onChange={(e) => setMedical({ ...medical, medications: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Condiciones cronicas</label>
        <textarea
          rows={2}
          className={INPUT_CLS + ' resize-none'}
          placeholder="Diabetes, hipertension, asma..."
          value={medical.chronicConditions}
          onChange={(e) => setMedical({ ...medical, chronicConditions: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Cirugias previas</label>
        <textarea
          rows={2}
          className={INPUT_CLS + ' resize-none'}
          placeholder="Apendicectomia (2019)..."
          value={medical.surgeries}
          onChange={(e) => setMedical({ ...medical, surgeries: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Embarazo / Lactancia</label>
        <select
          className={SELECT_CLS}
          value={medical.pregnancyStatus}
          onChange={(e) =>
            setMedical({
              ...medical,
              pregnancyStatus: e.target.value as MedicalHistory['pregnancyStatus'],
            })
          }
        >
          <option value="none">No aplica</option>
          <option value="pregnant">Embarazada</option>
          <option value="lactating">En periodo de lactancia</option>
        </select>
      </div>
    </div>
  );

  const StepDental = () => (
    <div className="space-y-4">
      <div>
        <label className={LABEL_CLS}>Ultima visita al dentista</label>
        <select
          className={SELECT_CLS}
          value={dental.lastVisit}
          onChange={(e) => setDental({ ...dental, lastVisit: e.target.value })}
        >
          <option value="">Seleccionar...</option>
          <option value="less_6m">Menos de 6 meses</option>
          <option value="6m_1y">Entre 6 meses y 1 ano</option>
          <option value="1y_2y">Entre 1 y 2 anos</option>
          <option value="more_2y">Mas de 2 anos</option>
          <option value="never">Nunca fui</option>
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Frecuencia de cepillado</label>
        <select
          className={SELECT_CLS}
          value={dental.brushingFrequency}
          onChange={(e) => setDental({ ...dental, brushingFrequency: e.target.value })}
        >
          <option value="">Seleccionar...</option>
          <option value="3+">3 o mas veces al dia</option>
          <option value="2">2 veces al dia</option>
          <option value="1">1 vez al dia</option>
          <option value="irregular">Irregular</option>
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Sensibilidades</label>
        <textarea
          rows={2}
          className={INPUT_CLS + ' resize-none'}
          placeholder="Al frio, al calor, al dulce..."
          value={dental.sensitivities}
          onChange={(e) => setDental({ ...dental, sensitivities: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={dental.bruxism}
          onClick={() => setDental({ ...dental, bruxism: !dental.bruxism })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
            dental.bruxism ? 'bg-blue-500' : 'bg-white/[0.1]'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              dental.bruxism ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <label className="text-sm text-white/70">
          Aprieto o rechino los dientes (bruxismo)
        </label>
      </div>
    </div>
  );

  const steps = [<StepPersonal />, <StepMedical />, <StepDental />];

  // --- full-screen states: loading, error, success ---------------------
  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#06060e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Validando enlace...</p>
        </div>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#06060e] flex items-center justify-center px-4">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 text-red-400 mx-auto">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-lg font-semibold text-white">Enlace no valido</h2>
          <p className="text-sm text-white/50 leading-relaxed">{validationError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#06060e] flex items-center justify-center px-4">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-400 mx-auto animate-[scaleIn_0.5s_ease-out]">
            <CheckCircle size={36} className="animate-[fadeCheck_0.6s_ease-out]" />
          </div>
          <h2 className="text-xl font-semibold text-white">Anamnesis enviada</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Gracias por completar tu ficha. El equipo de{' '}
            <span className="text-white/70 font-medium">{tenant?.name}</span> ya tiene tu
            informacion para tu proxima visita.
          </p>
        </div>
      </div>
    );
  }

  // --- main form -------------------------------------------------------
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#06060e] flex flex-col">
      {/* Header */}
      <header className="w-full px-4 pt-6 pb-2 flex flex-col items-center gap-3">
        {tenant?.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="h-10 w-auto object-contain"
          />
        ) : (
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-blue-500/10 text-blue-400">
            <Stethoscope size={22} />
          </div>
        )}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white">{tenant?.name}</h1>
          <p className="text-xs text-white/40 mt-0.5">Ficha de anamnesis</p>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">
        <ProgressBar />

        {/* Card with animated step content */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 sm:p-6 overflow-hidden">
          {/* Step title */}
          <h2 className="text-base font-semibold text-white mb-1">
            {STEP_LABELS[step]}
          </h2>
          <p className="text-xs text-white/40 mb-5">
            Paso {step + 1} de {STEP_LABELS.length}
          </p>

          {/* Animated content */}
          <div
            key={step}
            className={
              slideDirection === 'left'
                ? 'animate-card-slide-left'
                : 'animate-card-slide-right'
            }
          >
            {steps[step]}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="shrink-0" />
              {submitError}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-white/[0.06]">
            {step > 0 ? (
              <button
                onClick={prev}
                disabled={animating}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors px-4 py-2.5 rounded-xl hover:bg-white/[0.04] disabled:opacity-40"
              >
                <ArrowLeft size={16} />
                Anterior
              </button>
            ) : (
              <span />
            )}

            {step < 2 ? (
              <button
                onClick={next}
                disabled={animating}
                className="flex items-center gap-2 text-sm font-semibold bg-white text-gray-900 px-6 py-2.5 rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                Siguiente
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 text-sm font-semibold bg-white text-gray-900 px-6 py-2.5 rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    Enviar
                    <CheckCircle size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 text-[11px] text-white/20">
        Powered by Dentalogic
      </footer>

      {/* Inline keyframes for success animation */}
      <style>{`
        @keyframes scaleIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeCheck {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
