export function getNovaContextMock(_page: string) {
  return {
    score: 87,
    greeting: '\u00a1Hola! Soy Nova, tu asistente virtual. \u00bfEn qu\u00e9 puedo ayudarte hoy?',
    checks: [
      { label: 'Turnos de hoy confirmados', status: 'ok', count: 6 },
      { label: 'Pacientes sin turno futuro', status: 'warning', count: 12 },
      { label: 'Anamnesis pendientes', status: 'info', count: 3 },
    ],
    pending: [
      { type: 'appointment', label: '3 turnos sin confirmar para ma\u00f1ana' },
      { type: 'followup', label: '2 seguimientos post-operatorios pendientes' },
    ],
    stats: { patients_today: 8, appointments_today: 12, messages_today: 23 },
  };
}

export function getNovaDailyAnalysisMock() {
  return {
    insights: [
      {
        type: 'trend',
        title: 'Aumento de consultas por ortodoncia',
        description: 'Las consultas por ortodoncia invisible aumentaron un 35% esta semana respecto a la anterior.',
        priority: 'medium',
      },
      {
        type: 'alert',
        title: 'Tasa de cancelaci\u00f3n elevada',
        description: 'La tasa de cancelaci\u00f3n del viernes fue del 25%. Considerar enviar recordatorios adicionales.',
        priority: 'high',
      },
      {
        type: 'opportunity',
        title: 'Blanqueamiento: alta demanda',
        description: '15 pacientes consultaron por blanqueamiento este mes. Oportunidad para campa\u00f1a espec\u00edfica.',
        priority: 'low',
      },
    ],
    generated_at: new Date().toISOString(),
  };
}

export function getNovaOnboardingMock() {
  return {
    completed: 7,
    total: 10,
    items: [
      { key: 'profile', label: 'Completar perfil de cl\u00ednica', done: true },
      { key: 'professionals', label: 'Agregar profesionales', done: true },
      { key: 'treatments', label: 'Configurar tratamientos', done: true },
      { key: 'hours', label: 'Definir horarios de atenci\u00f3n', done: true },
      { key: 'whatsapp', label: 'Conectar WhatsApp', done: true },
      { key: 'faqs', label: 'Cargar preguntas frecuentes', done: true },
      { key: 'calendar', label: 'Vincular Google Calendar', done: true },
      { key: 'meta', label: 'Conectar Meta Ads', done: false },
      { key: 'templates', label: 'Configurar plantillas HSM', done: false },
      { key: 'backup', label: 'Activar backup autom\u00e1tico', done: false },
    ],
  };
}

export function getNovaSessionMock() {
  return { session_id: `demo-session-${Date.now()}` };
}

const CHAT_RESPONSES: Array<{ keywords: string[]; response: string }> = [
  {
    keywords: ['turno', 'cita', 'agenda', 'disponibilidad'],
    response: 'Veo que ten\u00e9s 12 turnos agendados para hoy. El pr\u00f3ximo es a las 10:30 con Mar\u00eda Garc\u00eda (limpieza dental). \u00bfQuer\u00e9s que te muestre la agenda completa?',
  },
  {
    keywords: ['dolor', 'urgencia', 'emergencia', 'muela'],
    response: 'Para urgencias, el protocolo es: 1) Triage de dolor (escala 1-10), 2) Disponibilidad inmediata del profesional de guardia, 3) Confirmaci\u00f3n con el paciente. \u00bfQuer\u00e9s que busque disponibilidad para una urgencia?',
  },
  {
    keywords: ['implante', 'implantes'],
    response: 'Ten\u00e9s 3 pacientes en proceso de implantes este mes. La campa\u00f1a "Implantes Dentales - Neuqu\u00e9n" gener\u00f3 35 leads con un ROI de 5.2x. \u00bfQuer\u00e9s ver el detalle?',
  },
  {
    keywords: ['blanqueamiento', 'est\u00e9tica'],
    response: 'El blanqueamiento es el tratamiento m\u00e1s consultado este mes (42 leads). El precio configurado es de $45.000. \u00bfQuer\u00e9s que te muestre las campa\u00f1as activas?',
  },
  {
    keywords: ['precio', 'costo', 'valor', 'consulta'],
    response: 'La consulta general est\u00e1 en $15.000. Los tratamientos m\u00e1s solicitados: Limpieza $12.000, Blanqueamiento $45.000, Ortodoncia desde $180.000/mes. \u00bfNecesit\u00e1s actualizar alg\u00fan precio?',
  },
  {
    keywords: ['horario', 'hora', 'abierto', 'atiende'],
    response: 'El horario de atenci\u00f3n es Lunes a Viernes de 09:00 a 18:00, S\u00e1bados de 09:00 a 13:00. Domingos cerrado. \u00bfQuer\u00e9s modificar alg\u00fan d\u00eda?',
  },
  {
    keywords: ['paciente', 'ficha', 'historial'],
    response: 'Ten\u00e9s 156 pacientes registrados, 89 activos este mes. Los \u00faltimos 3 nuevos: Fernando Torres (implantes), Patricia Ruiz (blanqueamiento), Roberto Fern\u00e1ndez (blanqueamiento). \u00bfQuer\u00e9s ver alguna ficha?',
  },
  {
    keywords: ['hola', 'buenos d\u00edas', 'buenas', 'hey'],
    response: '\u00a1Hola! Todo listo por ac\u00e1. Ten\u00e9s 12 turnos hoy, 3 sin confirmar para ma\u00f1ana, y 2 seguimientos pendientes. \u00bfEn qu\u00e9 te ayudo?',
  },
];

const DEFAULT_RESPONSE =
  'Entendido. Puedo ayudarte con turnos, pacientes, tratamientos, m\u00e9tricas de marketing, o cualquier dato de la cl\u00ednica. \u00bfQu\u00e9 necesit\u00e1s?';

export function getNovaChatResponseMock(message: string): string {
  const lower = message.toLowerCase();
  const match = CHAT_RESPONSES.find((r) =>
    r.keywords.some((k) => lower.includes(k)),
  );
  return match?.response ?? DEFAULT_RESPONSE;
}
