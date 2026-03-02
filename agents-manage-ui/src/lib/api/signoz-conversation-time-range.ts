import { makeManagementApiRequest } from './api-config';

export const BOUNDS_PADDING_MS = 3 * 60 * 60 * 1000; // 3 hours
export const DEFAULT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000; // 180 days — fallback when bounds unavailable

export async function getConversationTimeRange(params: {
  startParam: string | null;
  endParam: string | null;
  projectId: string | undefined;
  tenantId: string;
  conversationId: string;
}): Promise<{ start: number; end: number }> {
  const now = Date.now();
  const { startParam, endParam, projectId, tenantId, conversationId } = params;

  if (startParam != null && endParam != null) {
    return { start: Number(startParam), end: Number(endParam) };
  }

  if (!projectId) {
    return { start: now - DEFAULT_LOOKBACK_MS, end: now };
  }

  try {
    const bounds = await makeManagementApiRequest<{
      data: { createdAt: string; updatedAt: string };
    }>(`tenants/${tenantId}/projects/${projectId}/conversations/${conversationId}/bounds`);
    const createdMs = new Date(`${bounds.data.createdAt}Z`).getTime();
    const updatedMs = new Date(`${bounds.data.updatedAt}Z`).getTime();
    const start = Math.max(0, createdMs - BOUNDS_PADDING_MS);
    const end = Math.min(now, updatedMs + BOUNDS_PADDING_MS);
    return { start, end };
  } catch {
    return { start: now - DEFAULT_LOOKBACK_MS, end: now };
  }
}
