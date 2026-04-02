function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

interface LeadParams {
  status?: string;
  source?: string;
  page?: string;
  limit?: string;
}

const LEADS = [
  {
    id: 'lead-001',
    name: 'Mar\u00eda Garc\u00eda',
    phone: '+5492994001001',
    email: 'maria.garcia@email.com',
    source: 'meta_ads',
    campaign: 'Implantes Dentales - Neuqu\u00e9n',
    interest: 'Implante dental - molar inferior',
    status: 'converted',
    notes: 'Consulta inicial por WhatsApp. Ya agend\u00f3 turno para evaluaci\u00f3n.',
    created_at: daysAgo(18),
    updated_at: daysAgo(3),
  },
  {
    id: 'lead-002',
    name: 'Carlos L\u00f3pez',
    phone: '+5492994002002',
    email: 'carlos.lopez@email.com',
    source: 'meta_ads',
    campaign: 'Ortodoncia Invisible',
    interest: 'Ortodoncia invisible - consulta de precio',
    status: 'contacted',
    notes: 'Respondi\u00f3 al anuncio. Pidi\u00f3 presupuesto por WhatsApp.',
    created_at: daysAgo(12),
    updated_at: daysAgo(5),
  },
  {
    id: 'lead-003',
    name: 'Ana Mart\u00ednez',
    phone: '+5492994003003',
    email: 'ana.martinez@email.com',
    source: 'whatsapp',
    campaign: null,
    interest: 'Limpieza dental + blanqueamiento',
    status: 'new',
    notes: 'Escribi\u00f3 por WhatsApp preguntando por turnos disponibles.',
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
  },
  {
    id: 'lead-004',
    name: 'Roberto Fern\u00e1ndez',
    phone: '+5492994004004',
    email: 'roberto.fernandez@email.com',
    source: 'meta_ads',
    campaign: 'Blanqueamiento Dental',
    interest: 'Blanqueamiento dental - promo',
    status: 'appointment_scheduled',
    notes: 'Lleg\u00f3 por la promo de blanqueamiento. Turno agendado.',
    created_at: daysAgo(8),
    updated_at: daysAgo(1),
  },
  {
    id: 'lead-005',
    name: 'Laura S\u00e1nchez',
    phone: '+5492994005005',
    email: 'laura.sanchez@email.com',
    source: 'whatsapp',
    campaign: null,
    interest: 'Urgencia - dolor de muela',
    status: 'converted',
    notes: 'Urgencia atendida el mismo d\u00eda. Ahora en tratamiento de conducto.',
    created_at: daysAgo(22),
    updated_at: daysAgo(15),
  },
  {
    id: 'lead-006',
    name: 'Diego Moreno',
    phone: '+5492994006006',
    email: 'diego.moreno@email.com',
    source: 'meta_ads',
    campaign: 'Implantes Dentales - Neuqu\u00e9n',
    interest: 'Implante dental - consulta',
    status: 'no_response',
    notes: 'Hizo clic en el anuncio pero no respondi\u00f3 los mensajes.',
    created_at: daysAgo(15),
    updated_at: daysAgo(10),
  },
  {
    id: 'lead-007',
    name: 'Patricia Ruiz',
    phone: '+5492994007007',
    email: 'patricia.ruiz@email.com',
    source: 'meta_ads',
    campaign: 'Blanqueamiento Dental',
    interest: 'Blanqueamiento + carillas',
    status: 'contacted',
    notes: 'Interesada en est\u00e9tica dental completa. Pidi\u00f3 fotos de trabajos.',
    created_at: daysAgo(5),
    updated_at: daysAgo(3),
  },
  {
    id: 'lead-008',
    name: 'Fernando Torres',
    phone: '+5492994008008',
    email: 'fernando.torres@email.com',
    source: 'meta_ads',
    campaign: 'Urgencias Odontol\u00f3gicas',
    interest: 'Implante dental - presupuesto',
    status: 'new',
    notes: 'Lleg\u00f3 por urgencias pero consulta por implantes tambi\u00e9n.',
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
];

export function getLeadsMock(params?: LeadParams) {
  let filtered = [...LEADS];

  if (params?.status && params.status !== 'all') {
    filtered = filtered.filter((l) => l.status === params.status);
  }
  if (params?.source && params.source !== 'all') {
    filtered = filtered.filter((l) => l.source === params.source);
  }

  const page = params?.page ? parseInt(params.page) : 1;
  const limit = params?.limit ? parseInt(params.limit) : 20;
  const start = (page - 1) * limit;
  const paginated = filtered.slice(start, start + limit);

  return {
    leads: paginated,
    total: filtered.length,
    page,
    limit,
    total_pages: Math.ceil(filtered.length / limit),
  };
}

export function getLeadsSummaryMock() {
  return {
    total: LEADS.length,
    by_status: {
      new: LEADS.filter((l) => l.status === 'new').length,
      contacted: LEADS.filter((l) => l.status === 'contacted').length,
      appointment_scheduled: LEADS.filter((l) => l.status === 'appointment_scheduled').length,
      converted: LEADS.filter((l) => l.status === 'converted').length,
      no_response: LEADS.filter((l) => l.status === 'no_response').length,
    },
    by_source: {
      meta_ads: LEADS.filter((l) => l.source === 'meta_ads').length,
      whatsapp: LEADS.filter((l) => l.source === 'whatsapp').length,
    },
    conversion_rate: +(
      (LEADS.filter((l) => l.status === 'converted').length / LEADS.length) *
      100
    ).toFixed(1),
  };
}

export function updateLeadStatusMock(_id: string, _status: string) {
  return { success: true };
}
