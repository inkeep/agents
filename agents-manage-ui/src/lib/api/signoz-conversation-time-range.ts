import { getLogger } from '@/lib/logger';
import { makeManagementApiRequest } from './api-config';

const BOUNDS_PADDING_MS = 3 * 60 * 60 * 1000; // 3 hours
export const DEFAULT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000; // 180 days — fallback when bounds unavailable

const logger = getLogger('signoz-conversation-time-range');

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
    const start = Number(startParam);
    const end = Number(endParam);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return { start, end };
    }
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
    if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) {
      return { start: now - DEFAULT_LOOKBACK_MS, end: now };
    }
    const start = Math.max(0, createdMs - BOUNDS_PADDING_MS);
    const end = Math.min(now, updatedMs + BOUNDS_PADDING_MS);
    return { start, end };
  } catch (error) {
    logger.warn(
      {
        conversationId,
        projectId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch conversation bounds, using fallback time range'
    );
    return { start: now - DEFAULT_LOOKBACK_MS, end: now };
  }
}
