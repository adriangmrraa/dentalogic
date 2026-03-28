import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Shield, FileText, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Static content – Spanish, dental clinic SaaS                      */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  title: string;
  body: string;
}

const PRIVACY_SECTIONS: Section[] = [
  {
    id: 'recopilacion',
    title: '1. Recopilacion de datos personales',
    body: `Al utilizar nuestra plataforma de gestion odontologica, recopilamos los siguientes datos personales: nombre completo, documento de identidad, correo electronico, numero de telefono, fecha de nacimiento, domicilio, obra social o cobertura medica, e historial clinico dental. Estos datos son proporcionados directamente por la clinica dental o por el paciente al momento de su registro.\n\nAdicionalmente, recopilamos datos de uso de la plataforma de forma automatica, incluyendo direccion IP, tipo de navegador, sistema operativo, paginas visitadas y tiempo de permanencia. Estos datos nos permiten mejorar la experiencia del usuario y optimizar el rendimiento del servicio.`,
  },
  {
    id: 'uso-datos',
    title: '2. Uso de los datos',
    body: `Los datos personales recopilados se utilizan exclusivamente para los siguientes fines:\n\n- Gestion de turnos y agenda de la clinica dental.\n- Administracion de historias clinicas odontologicas.\n- Comunicacion entre la clinica y sus pacientes (recordatorios de turnos, notificaciones de tratamiento).\n- Facturacion y gestion administrativa.\n- Generacion de reportes estadisticos anonimizados para la clinica.\n- Mejora continua de la plataforma y sus funcionalidades.\n\nNo utilizamos los datos personales de los pacientes con fines de marketing directo ni los compartimos con terceros para dichos propositos sin consentimiento explicito.`,
  },
  {
    id: 'almacenamiento',
    title: '3. Almacenamiento y seguridad',
    body: `Todos los datos se almacenan en servidores seguros con cifrado AES-256 en reposo y TLS 1.3 en transito. Implementamos medidas de seguridad tecnicas y organizativas conforme a las mejores practicas de la industria, incluyendo:\n\n- Control de acceso basado en roles (RBAC) para cada clinica.\n- Autenticacion de dos factores disponible para todos los usuarios.\n- Copias de seguridad automaticas diarias con retencion de 30 dias.\n- Monitoreo continuo de actividad sospechosa.\n- Registros de auditoria (logs) de todas las operaciones sobre datos sensibles.\n\nLos datos de salud bucal de los pacientes se consideran datos sensibles y reciben un nivel adicional de proteccion conforme a la Ley N.° 25.326 de Proteccion de Datos Personales de la Republica Argentina.`,
  },
  {
    id: 'derechos',
    title: '4. Derechos del titular de los datos',
    body: `De acuerdo con la legislacion vigente, todo titular de datos personales tiene derecho a:\n\n- Acceso: solicitar informacion sobre los datos personales almacenados.\n- Rectificacion: corregir datos inexactos o incompletos.\n- Supresion: solicitar la eliminacion de sus datos cuando ya no sean necesarios para el fin para el cual fueron recopilados.\n- Oposicion: oponerse al tratamiento de sus datos en determinadas circunstancias.\n- Portabilidad: recibir sus datos en un formato estructurado y de uso comun.\n\nPara ejercer cualquiera de estos derechos, el titular puede contactar a la clinica dental correspondiente o escribir a nuestro correo de soporte indicando su solicitud. Responderemos en un plazo maximo de 10 dias habiles.`,
  },
  {
    id: 'cookies',
    title: '5. Cookies y tecnologias de rastreo',
    body: `Nuestra plataforma utiliza cookies estrictamente necesarias para el funcionamiento del sistema, incluyendo cookies de sesion y de autenticacion. No utilizamos cookies publicitarias ni de rastreo de terceros.\n\nLas cookies de sesion se eliminan automaticamente al cerrar el navegador. Las cookies de autenticacion tienen una duracion maxima de 30 dias y pueden ser revocadas por el usuario en cualquier momento cerrando sesion.\n\nEl usuario puede configurar su navegador para rechazar cookies, aunque esto puede afectar la funcionalidad de la plataforma.`,
  },
  {
    id: 'menores',
    title: '6. Datos de menores de edad',
    body: `Los datos de pacientes menores de 18 anios solo pueden ser cargados en la plataforma por la clinica dental con el consentimiento del padre, madre o tutor legal. La clinica dental es responsable de obtener y conservar dicho consentimiento.\n\nLos menores de 13 anios no pueden crear cuentas de usuario en la plataforma. El acceso al portal de pacientes para menores esta sujeto a la supervision del adulto responsable.`,
  },
  {
    id: 'transferencias',
    title: '7. Transferencias internacionales',
    body: `Los datos pueden ser procesados en servidores ubicados fuera de la Republica Argentina, en jurisdicciones que cuentan con niveles adecuados de proteccion de datos personales. En caso de transferencia internacional, garantizamos que se implementen clausulas contractuales estandar y medidas de seguridad equivalentes a las descritas en esta politica.\n\nActualmente, nuestros servidores principales se encuentran en centros de datos ubicados en America del Sur, con replicas de respaldo en Norteamerica.`,
  },
  {
    id: 'modificaciones-privacidad',
    title: '8. Modificaciones a esta politica',
    body: `Nos reservamos el derecho de actualizar esta Politica de Privacidad en cualquier momento. Cualquier modificacion sera notificada a los usuarios registrados mediante correo electronico y/o aviso dentro de la plataforma con al menos 15 dias de anticipacion a su entrada en vigencia.\n\nLa fecha de ultima actualizacion se indica al inicio de este documento. El uso continuado de la plataforma tras la notificacion de cambios constituye aceptacion de la politica modificada.`,
  },
];

const TERMS_SECTIONS: Section[] = [
  {
    id: 'aceptacion',
    title: '1. Aceptacion de los terminos',
    body: `Al acceder y utilizar la plataforma Dentalogic ("el Servicio"), usted acepta quedar vinculado por estos Terminos y Condiciones de Uso. Si no esta de acuerdo con alguno de los terminos aqui establecidos, le solicitamos que no utilice el Servicio.\n\nEstos terminos constituyen un acuerdo legal entre usted (ya sea una persona fisica o juridica) y Dentalogic. El uso del Servicio implica la aceptacion plena e incondicional de todas las disposiciones incluidas en este documento.`,
  },
  {
    id: 'descripcion-servicio',
    title: '2. Descripcion del servicio',
    body: `Dentalogic es una plataforma de gestion integral para clinicas dentales que ofrece las siguientes funcionalidades:\n\n- Gestion de agenda y turnos con soporte multi-sede y multi-profesional.\n- Administracion de fichas de pacientes e historias clinicas odontologicas.\n- Comunicacion automatizada con pacientes via WhatsApp y correo electronico.\n- Facturacion y gestion de presupuestos de tratamientos.\n- Reportes y analiticas de rendimiento de la clinica.\n- Integracion con inteligencia artificial para asistencia en la gestion.\n\nEl Servicio se ofrece bajo la modalidad SaaS (Software como Servicio) y se accede a traves de navegadores web compatibles.`,
  },
  {
    id: 'registro-cuentas',
    title: '3. Registro y cuentas de usuario',
    body: `Para utilizar el Servicio, la clinica dental debe crear una cuenta proporcionando informacion veraz y actualizada. El administrador de la cuenta es responsable de:\n\n- Mantener la confidencialidad de las credenciales de acceso.\n- Gestionar los permisos de los usuarios dentro de su organizacion.\n- Asegurar que todos los usuarios de su cuenta cumplan con estos terminos.\n- Notificar de inmediato cualquier uso no autorizado de la cuenta.\n\nDentalogic se reserva el derecho de suspender o cancelar cuentas que infrinjan estos terminos o que presenten actividad sospechosa, previa notificacion al titular de la cuenta.`,
  },
  {
    id: 'obligaciones-usuario',
    title: '4. Obligaciones del usuario',
    body: `El usuario se compromete a:\n\n- Utilizar el Servicio unicamente para los fines previstos de gestion odontologica.\n- No intentar acceder a datos de otras clinicas o usuarios sin autorizacion.\n- No realizar ingenieria inversa, descompilar o intentar extraer el codigo fuente del Servicio.\n- No utilizar el Servicio para almacenar o transmitir contenido ilicito.\n- Cumplir con todas las leyes y regulaciones aplicables, incluyendo las relativas a proteccion de datos de salud.\n- Mantener copias de seguridad propias de los datos criticos de su clinica.\n\nEl incumplimiento de estas obligaciones puede resultar en la suspension inmediata del acceso al Servicio.`,
  },
  {
    id: 'propiedad-intelectual',
    title: '5. Propiedad intelectual',
    body: `Todo el contenido de la plataforma, incluyendo pero no limitado a software, diseno, logotipos, textos, graficos e interfaces, es propiedad exclusiva de Dentalogic o de sus licenciantes y esta protegido por las leyes de propiedad intelectual vigentes.\n\nLos datos clinicos y de pacientes cargados en la plataforma son propiedad de la clinica dental titular de la cuenta. Dentalogic no reclama ningun derecho de propiedad sobre dichos datos.\n\nSe concede al usuario una licencia limitada, no exclusiva, no transferible y revocable para utilizar el Servicio conforme a estos terminos.`,
  },
  {
    id: 'disponibilidad',
    title: '6. Disponibilidad y soporte',
    body: `Dentalogic se compromete a mantener una disponibilidad del Servicio del 99.5% mensual, excluyendo ventanas de mantenimiento programado. Las ventanas de mantenimiento seran comunicadas con al menos 48 horas de anticipacion.\n\nEl soporte tecnico se brinda a traves de los canales habilitados (correo electronico, chat dentro de la plataforma y WhatsApp) en horario de lunes a viernes de 9:00 a 18:00 (hora de Argentina, GMT-3).\n\nDentalogic no sera responsable por interrupciones del Servicio causadas por factores fuera de su control, incluyendo fallas de conectividad del usuario, ataques informaticos de terceros o desastres naturales.`,
  },
  {
    id: 'limitacion-responsabilidad',
    title: '7. Limitacion de responsabilidad',
    body: `En la maxima medida permitida por la ley, Dentalogic no sera responsable por:\n\n- Danos indirectos, incidentales, especiales o consecuentes derivados del uso o imposibilidad de uso del Servicio.\n- Perdida de datos causada por el uso indebido del Servicio por parte del usuario.\n- Decisiones clinicas tomadas sobre la base de la informacion gestionada a traves de la plataforma.\n\nLa responsabilidad total de Dentalogic frente al usuario no excedera el monto abonado por el usuario en los ultimos 12 meses de uso del Servicio. El Servicio se proporciona "tal cual" y "segun disponibilidad".`,
  },
  {
    id: 'rescision',
    title: '8. Rescision y cancelacion',
    body: `Cualquiera de las partes puede rescindir el uso del Servicio en cualquier momento, con un preaviso minimo de 30 dias.\n\nAl cancelar la cuenta, la clinica tendra un plazo de 60 dias para exportar sus datos. Transcurrido dicho plazo, los datos seran eliminados de forma permanente de nuestros servidores, salvo aquellos que debamos conservar por obligacion legal.\n\nDentalogic podra rescindir el acceso de forma inmediata en caso de incumplimiento grave de estos terminos, sin perjuicio de las acciones legales que pudieran corresponder.`,
  },
  {
    id: 'legislacion',
    title: '9. Legislacion aplicable y jurisdiccion',
    body: `Estos Terminos y Condiciones se rigen por las leyes de la Republica Argentina. Cualquier controversia derivada de la interpretacion o cumplimiento de estos terminos sera sometida a la jurisdiccion de los Tribunales Ordinarios de la Ciudad Autonoma de Buenos Aires, renunciando las partes a cualquier otro fuero o jurisdiccion que pudiera corresponderles.\n\nSi alguna disposicion de estos terminos fuera declarada invalida o inaplicable, las disposiciones restantes mantendran su plena vigencia y efecto.`,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function PrivacyTermsView() {
  const { pathname } = useLocation();
  const isPrivacy = pathname.startsWith('/privacy');

  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const title = isPrivacy ? 'Politica de Privacidad' : 'Terminos y Condiciones';
  const Icon = isPrivacy ? Shield : FileText;
  const lastUpdated = '15 de marzo de 2026';

  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const [tocOpen, setTocOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  /* ---------- Intersection Observer for active section ---------- */
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
          break;
        }
      }
    },
    [],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0.1,
    });

    for (const el of Object.values(sectionRefs.current)) {
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [observerCallback, sections]);

  /* Reset state when switching between privacy / terms */
  useEffect(() => {
    setActiveId(sections[0]?.id ?? '');
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isPrivacy]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Smooth scroll to section ---------- */
  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      setTocOpen(false);
    }
  };

  /* ---------- TOC link renderer ---------- */
  const renderTocLink = (s: Section) => (
    <button
      key={s.id}
      onClick={() => scrollTo(s.id)}
      className={`block w-full text-left text-sm py-1.5 transition-colors ${
        activeId === s.id
          ? 'text-blue-400 font-medium'
          : 'text-white/50 hover:text-blue-400'
      }`}
    >
      {s.title}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#06060e]">
      {/* ---- Header ---- */}
      <header className="pt-12 pb-8 px-4 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 mb-4">
          <Icon size={28} strokeWidth={1.8} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Ultima actualizacion: {lastUpdated}
        </p>
      </header>

      {/* ---- Layout: TOC sidebar (desktop) + content ---- */}
      <div className="max-w-5xl mx-auto px-4 pb-20 flex gap-10">
        {/* Sidebar TOC — desktop only */}
        <aside className="hidden lg:block sticky top-24 self-start w-56 shrink-0">
          <nav className="space-y-1">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
              Contenido
            </p>
            {sections.map(renderTocLink)}
          </nav>
        </aside>

        {/* Main column */}
        <div className="w-full max-w-[768px] mx-auto space-y-6">
          {/* Mobile collapsible TOC */}
          <div className="lg:hidden bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            <button
              onClick={() => setTocOpen((o) => !o)}
              className="flex items-center justify-between w-full px-5 py-4 text-white/70 text-sm font-medium"
            >
              <span>Tabla de contenido</span>
              <ChevronDown
                size={18}
                className={`transition-transform ${tocOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {tocOpen && (
              <nav className="px-5 pb-4 space-y-0.5">
                {sections.map(renderTocLink)}
              </nav>
            )}
          </div>

          {/* Sections */}
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => {
                sectionRefs.current[s.id] = el;
              }}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 scroll-mt-24"
            >
              <h2 className="text-lg font-semibold text-white mb-3">
                {s.title}
              </h2>
              <div className="text-white/70 text-sm leading-relaxed whitespace-pre-line">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
