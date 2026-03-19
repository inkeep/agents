import { makeManagementApiRequest } from './api-config';

export interface UsageSummaryRow {
  groupKey: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  eventCount: number;
}

export interface UsageEvent {
  requestId: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  subAgentId: string | null;
  conversationId: string | null;
  generationType: string;
  requestedModel: string;
  resolvedModel: string | null;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedReadTokens: number | null;
  estimatedCostUsd: string | null;
  streamed: boolean;
  finishReason: string | null;
  generationDurationMs: number | null;
  status: string;
  errorCode: string | null;
  startedAt: string;
  createdAt: string;
}

export type UsageSummaryGroupBy = 'model' | 'agent' | 'day' | 'generation_type';

export async function fetchUsageSummary(params: {
  tenantId: string;
  projectId?: string;
  from: string;
  to: string;
  groupBy?: UsageSummaryGroupBy;
}): Promise<UsageSummaryRow[]> {
  const searchParams = new URLSearchParams();
  if (params.projectId) searchParams.set('projectId', params.projectId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.groupBy) searchParams.set('groupBy', params.groupBy);

  const result = await makeManagementApiRequest<{ data: UsageSummaryRow[] }>(
    `v1/${params.tenantId}/usage/summary?${searchParams.toString()}`
  );
  return result.data;
}

export async function fetchUsageEvents(params: {
  tenantId: string;
  projectId?: string;
  from: string;
  to: string;
  agentId?: string;
  model?: string;
  generationType?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ data: UsageEvent[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams();
  if (params.projectId) searchParams.set('projectId', params.projectId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.agentId) searchParams.set('agentId', params.agentId);
  if (params.model) searchParams.set('model', params.model);
  if (params.generationType) searchParams.set('generationType', params.generationType);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.limit) searchParams.set('limit', String(params.limit));

  return makeManagementApiRequest<{ data: UsageEvent[]; nextCursor: string | null }>(
    `v1/${params.tenantId}/usage/events?${searchParams.toString()}`
  );
}
