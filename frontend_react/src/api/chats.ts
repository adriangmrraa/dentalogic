import { apiGet, apiPost, apiPut } from './axios';

export const fetchChatsSummary = () =>
  apiGet('/admin/chats/summary');

export const fetchChatMessages = (conversationId: string, page?: number) =>
  apiGet(`/admin/chats/${conversationId}/messages?page=${page || 1}`);

export const sendChatMessage = (conversationId: string, message: string) =>
  apiPost(`/admin/chats/${conversationId}/send`, { message });

export const uploadChatMedia = (conversationId: string, file: FormData) =>
  apiPost(`/admin/chats/${conversationId}/media`, file);

export const setHumanOverride = (conversationId: string, active: boolean) =>
  apiPost(`/admin/chats/${conversationId}/override`, { active });

export const markConversationRead = (conversationId: string) =>
  apiPut(`/admin/chats/${conversationId}/read`);

export const fetchChatwootConfig = () =>
  apiGet('/admin/integrations/chatwoot/config');
