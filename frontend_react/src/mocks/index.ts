import { getDashboardMetricsMock } from './dashboard.mock';
import { getMarketingStatsMock } from './marketing.mock';
import { getLeadsMock, getLeadsSummaryMock } from './leads.mock';
import {
  getNovaContextMock,
  getNovaDailyAnalysisMock,
  getNovaOnboardingMock,
  getNovaSessionMock,
} from './nova.mock';

export function getMockForPath(
  url: string,
  params?: Record<string, string>,
): unknown | null {
  const path = url.replace(/^.*?(\/admin\/|\/dashboard\/)/, '/$1');

  if (
    path.includes('/admin/dashboard/metrics') ||
    path.includes('/dashboard/metrics')
  ) {
    const days = params?.days ? parseInt(params.days) : 30;
    return getDashboardMetricsMock(days);
  }
  if (path.includes('/admin/marketing/stats'))
    return getMarketingStatsMock(params?.range || 'all');
  if (path.includes('/admin/marketing/meta-auth/url'))
    return { url: '#demo-meta-connect' };
  if (path.includes('/admin/auth/google/ads/url'))
    return { url: '#demo-google-connect' };
  if (path.includes('/admin/leads/stats/summary'))
    return getLeadsSummaryMock();
  if (path.includes('/admin/leads') && !path.includes('/status'))
    return getLeadsMock(params);
  if (path.includes('/admin/nova/session')) return getNovaSessionMock();
  if (path.includes('/admin/nova/context'))
    return getNovaContextMock(params?.page || 'dashboard');
  if (path.includes('/admin/nova/daily-analysis'))
    return getNovaDailyAnalysisMock();
  if (path.includes('/admin/nova/onboarding-status'))
    return getNovaOnboardingMock();

  return null;
}

export { getNovaChatResponseMock } from './nova.mock';
