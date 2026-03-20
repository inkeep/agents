import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import type { GenerationType, StepUsage, UsageEventStatus } from '../../db/runtime/runtime-schema';
import { usageEvents } from '../../db/runtime/runtime-schema';

export interface UsageEventInsert {
  tenantId: string;
  projectId: string;
  agentId: string;
  subAgentId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  generationType: GenerationType;
  traceId?: string | null;
  spanId?: string | null;
  requestedModel: string;
  resolvedModel?: string | null;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number | null;
  cachedReadTokens?: number | null;
  cachedWriteTokens?: number | null;
  stepCount?: number;
  steps?: StepUsage[] | null;
  estimatedCostUsd?: string | null;
  streamed?: boolean;
  finishReason?: string | null;
  generationDurationMs?: number | null;
  byok?: boolean;
  status?: UsageEventStatus;
  errorCode?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

export interface UsageEventQueryParams {
  tenantId: string;
  projectId?: string;
  agentId?: string;
  conversationId?: string;
  model?: string;
  generationType?: GenerationType;
  from: string;
  to: string;
  cursor?: string;
  limit?: number;
}

export type UsageSummaryGroupBy =
  | 'model'
  | 'agent'
  | 'day'
  | 'generation_type'
  | 'conversation'
  | 'message';

export interface UsageSummaryParams {
  tenantId: string;
  projectId?: string;
  from: string;
  to: string;
  groupBy?: UsageSummaryGroupBy;
}

export interface UsageSummaryRow {
  groupKey: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  eventCount: number;
}

export const insertUsageEvent =
  (db: AgentsRunDatabaseClient) => async (params: UsageEventInsert) => {
    const [created] = await db.insert(usageEvents).values(params).returning();
    return created;
  };

export const queryUsageEvents =
  (db: AgentsRunDatabaseClient) => async (params: UsageEventQueryParams) => {
    const limit = Math.min(params.limit ?? 50, 200);
    const conditions = [
      eq(usageEvents.tenantId, params.tenantId),
      gte(usageEvents.createdAt, params.from),
      lte(usageEvents.createdAt, params.to),
    ];

    if (params.projectId) conditions.push(eq(usageEvents.projectId, params.projectId));
    if (params.agentId) conditions.push(eq(usageEvents.agentId, params.agentId));
    if (params.conversationId)
      conditions.push(eq(usageEvents.conversationId, params.conversationId));
    if (params.model) conditions.push(eq(usageEvents.resolvedModel, params.model));
    if (params.generationType)
      conditions.push(eq(usageEvents.generationType, params.generationType));
    if (params.cursor) conditions.push(lte(usageEvents.createdAt, params.cursor));

    const events = await db
      .select()
      .from(usageEvents)
      .where(and(...conditions))
      .orderBy(desc(usageEvents.createdAt))
      .limit(limit + 1);

    const hasMore = events.length > limit;
    const results = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? results[results.length - 1]?.createdAt : undefined;

    return { events: results, nextCursor };
  };

export const queryUsageSummary =
  (db: AgentsRunDatabaseClient) =>
  async (params: UsageSummaryParams): Promise<UsageSummaryRow[]> => {
    const conditions = [
      eq(usageEvents.tenantId, params.tenantId),
      gte(usageEvents.createdAt, params.from),
      lte(usageEvents.createdAt, params.to),
    ];

    if (params.projectId) conditions.push(eq(usageEvents.projectId, params.projectId));

    const groupBy = params.groupBy ?? 'model';

    const groupColumn =
      groupBy === 'model'
        ? usageEvents.resolvedModel
        : groupBy === 'agent'
          ? usageEvents.agentId
          : groupBy === 'generation_type'
            ? usageEvents.generationType
            : groupBy === 'conversation'
              ? usageEvents.conversationId
              : groupBy === 'message'
                ? usageEvents.messageId
                : sql<string>`date_trunc('day', ${usageEvents.createdAt})::text`;

    const rows = await db
      .select({
        groupKey: sql<string>`coalesce(${groupColumn}::text, 'unknown')`.as('group_key'),
        totalInputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`.as(
          'total_input_tokens'
        ),
        totalOutputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`.as(
          'total_output_tokens'
        ),
        totalTokens:
          sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0) + coalesce(sum(${usageEvents.outputTokens}), 0)`.as(
            'total_tokens'
          ),
        totalEstimatedCostUsd:
          sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}::numeric), 0)`.as(
            'total_estimated_cost_usd'
          ),
        eventCount: count().as('event_count'),
      })
      .from(usageEvents)
      .where(and(...conditions))
      .groupBy(groupColumn)
      .orderBy(desc(sql`event_count`));

    return rows.map((row) => ({
      groupKey: String(row.groupKey),
      totalInputTokens: Number(row.totalInputTokens),
      totalOutputTokens: Number(row.totalOutputTokens),
      totalTokens: Number(row.totalTokens),
      totalEstimatedCostUsd: Number(row.totalEstimatedCostUsd),
      eventCount: Number(row.eventCount),
    }));
  };
