export function getDashboardMetricsMock(days: number = 30) {
  const now = new Date();
  const daily_usage = Array.from({ length: days }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (days - 1 - i));
    const tokens = 70000 + Math.floor(Math.random() * 50000);
    return {
      date: date.toISOString().split('T')[0],
      total_tokens: tokens,
      cost_usd: +(tokens * 0.000016).toFixed(2),
    };
  });

  const totalTokens = daily_usage.reduce((s, d) => s + d.total_tokens, 0);
  const totalCost = daily_usage.reduce((s, d) => s + d.cost_usd, 0);

  return {
    timestamp: now.toISOString(),
    token_metrics: {
      totals: {
        total_cost_usd: +totalCost.toFixed(2),
        total_tokens: totalTokens,
        total_conversations: 342,
        avg_tokens_per_conversation: Math.round(totalTokens / 342),
        avg_cost_per_conversation: +(totalCost / 342).toFixed(4),
      },
      today: {
        cost_usd: daily_usage[daily_usage.length - 1].cost_usd,
        total_tokens: daily_usage[daily_usage.length - 1].total_tokens,
        conversations: 12,
      },
      current_month: { cost_usd: +totalCost.toFixed(2) },
    },
    daily_usage,
    model_usage: [
      { model: 'gpt-4o-mini', total_tokens: Math.round(totalTokens * 0.77) },
      { model: 'gpt-4o', total_tokens: Math.round(totalTokens * 0.23) },
    ],
    service_breakdown: [
      { service: 'WhatsApp Agent', model: 'gpt-4o-mini', total_tokens: Math.round(totalTokens * 0.63), cost_usd: +(totalCost * 0.63).toFixed(2), calls: 285 },
      { service: 'Nova Assistant', model: 'gpt-4o-mini', total_tokens: Math.round(totalTokens * 0.22), cost_usd: +(totalCost * 0.22).toFixed(2), calls: 134 },
      { service: 'Patient Memory', model: 'gpt-4o', total_tokens: Math.round(totalTokens * 0.10), cost_usd: +(totalCost * 0.10).toFixed(2), calls: 89 },
      { service: 'Daily Insights', model: 'gpt-4o', total_tokens: Math.round(totalTokens * 0.05), cost_usd: +(totalCost * 0.05).toFixed(2), calls: 30 },
    ],
    db_stats: { total_patients: 156, total_appointments: 892, total_conversations: 342 },
    projections: {
      projected_monthly_cost_usd: +(totalCost * 1.1).toFixed(2),
      projected_annual_cost_usd: +(totalCost * 12 * 1.1).toFixed(2),
      cost_per_1000_tokens: 0.0168,
      avg_tokens_per_conversation: Math.round(totalTokens / 342),
      efficiency_score: 87,
    },
    current_config: {
      OPENAI_MODEL: 'gpt-4o-mini',
      MODEL_INSIGHTS: 'gpt-4o-mini',
      MODEL_NOVA_VOICE: 'gpt-4o-mini-realtime-preview',
      MODEL_PATIENT_MEMORY: 'gpt-4o-mini',
    },
  };
}
