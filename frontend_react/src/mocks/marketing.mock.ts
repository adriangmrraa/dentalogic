export function getMarketingStatsMock(_range: string = 'all') {
  return {
    roi: {
      total_spend: 1250.00,
      total_revenue: 8500.00,
      patients_converted: 23,
      currency: 'ARS',
      is_connected: true,
    },
    campaigns: {
      campaigns: [
        { campaign_name: 'Implantes Dentales - Neuqu\u00e9n', spend: 450.00, leads: 35, patients_converted: 8, roi: 5.2, status: 'active' },
        { campaign_name: 'Ortodoncia Invisible', spend: 380.00, leads: 28, patients_converted: 7, roi: 4.8, status: 'active' },
        { campaign_name: 'Blanqueamiento Dental', spend: 220.00, leads: 42, patients_converted: 5, roi: 3.1, status: 'paused' },
        { campaign_name: 'Urgencias Odontol\u00f3gicas', spend: 200.00, leads: 18, patients_converted: 3, roi: 2.5, status: 'active' },
      ],
      creatives: [
        { ad_name: 'Carousel - Antes y Despu\u00e9s', campaign_name: 'Implantes Dentales - Neuqu\u00e9n', spend: 225.00, leads: 20, patients_converted: 5, roi: 6.1, status: 'active' },
        { ad_name: 'Video - Testimonio Paciente', campaign_name: 'Ortodoncia Invisible', spend: 190.00, leads: 15, patients_converted: 4, roi: 5.3, status: 'active' },
        { ad_name: 'Imagen - Promo Blanqueamiento', campaign_name: 'Blanqueamiento Dental', spend: 220.00, leads: 42, patients_converted: 5, roi: 3.1, status: 'paused' },
      ],
    },
    is_connected: true,
    currency: 'ARS',
  };
}
