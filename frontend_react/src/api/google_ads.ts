import { apiGet, apiPost } from './axios';

export const getCampaigns = () =>
  apiGet('/admin/marketing/google/campaigns');

export const getMetrics = (from: string, to: string) =>
  apiGet(`/admin/marketing/google/metrics?from=${from}&to=${to}`);

export const getCustomers = () =>
  apiGet('/admin/marketing/google/customers');

export const getConnectionStatus = () =>
  apiGet('/admin/auth/google/ads/status');

export const getCombinedStats = (from: string, to: string) =>
  apiGet(`/admin/marketing/combined?from=${from}&to=${to}`);

export const syncData = () =>
  apiPost('/admin/marketing/google/sync');

export const disconnect = () =>
  apiPost('/admin/auth/google/ads/disconnect');

export const refreshToken = () =>
  apiPost('/admin/auth/google/ads/refresh');
