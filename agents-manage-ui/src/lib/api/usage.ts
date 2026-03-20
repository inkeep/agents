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
  searchParams.set('tenantId', params.tenantId);
  searchParams.set('endpoint', 'summary');
  if (params.projectId) searchParams.set('projectId', params.projectId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.groupBy) searchParams.set('groupBy', params.groupBy);

  const response = await fetch(`/api/usage?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Usage summary request failed: ${response.status}`);
  }
  const result = await response.json();
  return result.data;
}

export async function fetchUsageEvents(params: {
  tenantId: string;
  projectId?: string;
  conversationId?: string;
  from: string;
  to: string;
  agentId?: string;
  model?: string;
  generationType?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ data: UsageEvent[]; nextCursor: string | null }> {
  const searchParams = new URLSearchParams();
  searchParams.set('tenantId', params.tenantId);
  searchParams.set('endpoint', 'events');
  if (params.projectId) searchParams.set('projectId', params.projectId);
  if (params.conversationId) searchParams.set('conversationId', params.conversationId);
  searchParams.set('from', params.from);
  searchParams.set('to', params.to);
  if (params.agentId) searchParams.set('agentId', params.agentId);
  if (params.model) searchParams.set('model', params.model);
  if (params.generationType) searchParams.set('generationType', params.generationType);
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`/api/usage?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Usage events request failed: ${response.status}`);
  }
  return response.json();
}
