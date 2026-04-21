import { z } from 'zod';
import {
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  buildFilterExpression,
  FIELD_CONTEXTS,
  FIELD_DATA_TYPES,
  OPERATORS,
  ORDER_DIRECTIONS,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  QUERY_TYPES,
  REQUEST_TYPES,
  SIGNALS,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
  USAGE_GENERATION_TYPES,
} from '@/constants/signoz';
import { fetchWithRetry } from '@/lib/api/fetch-with-retry';

// ---------- String Constants for Type Safety

export interface ConversationStats {
  conversationId: string;
  tenantId: string;
  agentId: string;
  agentName: string;
  totalToolCalls: number;
  toolsUsed: Array<{ name: string; calls: number; description: string }>;
  totalErrors: number;
  hasErrors: boolean;
  firstUserMessage?: string;
  startTime?: number;
}

export interface AggregateStats {
  totalToolCalls: number;
  totalTransfers: number;
  totalDelegations: number;
  totalConversations: number;
  totalAICalls: number;
}

export interface PaginatedConversationStats {
  data: ConversationStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  aggregateStats?: AggregateStats;
}

export interface SpanFilterOptions {
  spanName?: string;
  attributes?: {
    key: string;
    value: string;
    operator?:
      | '='
      | '!='
      | '<'
      | '>'
      | '<='
      | '>='
      | 'in'
      | 'nin'
      | 'contains'
      | 'ncontains'
      | 'regex'
      | 'nregex'
      | 'like'
      | 'nlike'
      | 'exists'
      | 'nexists';
  }[];
}

export interface TokenUsageResult {
  byModel: Array<{
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  byAgent: Array<{
    agentId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  byProject: Array<{
    projectId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
  totals: { inputTokens: number; outputTokens: number; totalTokens: number };
}

type ProjectStatsResult = Array<{
  projectId: string;
  totalConversations: number;
  totalAICalls: number;
  totalMCPCalls: number;
}>;

const EMPTY_TOKEN_USAGE: TokenUsageResult = {
  byModel: [],
  byAgent: [],
  byProject: [],
  totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
};

// ---------- Reusable scope filters

type FilterItem = { key: string; op: string; value: unknown };

const AI_OPERATION_FILTER: FilterItem = {
  key: SPAN_KEYS.AI_OPERATION_ID,
  op: OPERATORS.IN,
  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
};

const CONVERSATION_SCOPE_FILTER: FilterItem = {
  key: SPAN_KEYS.CONVERSATION_ID,
  op: OPERATORS.EXISTS,
  value: '',
};

const GENERATION_TYPE_SCOPE_FILTER: FilterItem = {
  key: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
  op: OPERATORS.IN,
  value: [...USAGE_GENERATION_TYPES],
};

const buildScopedFilterItems = (
  scope: 'conversation' | 'all-usage',
  projectId?: string
): FilterItem[] => [
  AI_OPERATION_FILTER,
  scope === 'conversation' ? CONVERSATION_SCOPE_FILTER : GENERATION_TYPE_SCOPE_FILTER,
  ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
];

// ---------- Small utilities

const nsToMs = (ns: number) => Math.floor(ns / 1_000_000);

const timestampMsFromSeries = (s: { values?: Array<{ value?: string }> }): number => {
  const raw = s.values?.[0]?.value;
  if (!raw || raw === '0') return 0;

  const truncated = raw.replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(truncated);
  if (!Number.isNaN(d.getTime()) && d.getTime() > 0) return d.getTime();

  const num = Number(raw);
  if (!Number.isNaN(num) && num > 1e15) return nsToMs(num);
  if (!Number.isNaN(num) && num > 0) return num;
  return 0;
};

const asNumberIfNumeric = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

// Type-safe filter value schema and parser
const FilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

type FilterValue = z.infer<typeof FilterValueSchema>;

type DataType = (typeof FIELD_DATA_TYPES)[keyof typeof FIELD_DATA_TYPES];

const asTypedFilterValue = (v: string): FilterValue => {
  try {
    // Handle boolean values
    if (v === 'true') {
      return FilterValueSchema.parse(true);
    }
    if (v === 'false') {
      return FilterValueSchema.parse(false);
    }

    // Handle numeric values with validation
    const numericValue = asNumberIfNumeric(v);
    if (typeof numericValue === 'number') {
      return FilterValueSchema.parse(numericValue);
    }

    return FilterValueSchema.parse(v);
  } catch (error) {
    // If validation fails, log the error and return the original string
    console.warn(`Failed to parse filter value "${v}":`, error);
    return FilterValueSchema.parse(v);
  }
};

const byFirstActivity = (a: number = 0, b: number = 0) => b - a;

type Series = {
  labels?: Record<string, string>;
  values?: Array<{ value?: string }>;
};

const countFromSeries = (s: Series) => parseInt(s.values?.[0]?.value ?? '0', 10) || 0;
const numberFromSeries = (s: Series) => Number(s.values?.[0]?.value ?? 0) || 0;

const DAY_IN_SECONDS = 86400;

const dateKeyFromMs = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const timestampMsFromValue = (raw: unknown): number => {
  if (raw == null) return 0;
  if (typeof raw === 'number') {
    if (raw > 1e15) return nsToMs(raw);
    if (raw > 1e12) return raw;
    if (raw > 0) return raw * 1000;
    return 0;
  }
  if (typeof raw === 'string') {
    const num = Number(raw);
    if (!Number.isNaN(num)) return timestampMsFromValue(num);
    const parsed = new Date(raw).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const extractTimeSeriesBuckets = (resp: any, name: string): Map<string, number> => {
  const buckets = new Map<string, number>();
  const addToBucket = (ms: number, value: number) => {
    if (!ms) return;
    buckets.set(dateKeyFromMs(ms), (buckets.get(dateKeyFromMs(ms)) ?? 0) + value);
  };

  const results = resp?.data?.data?.results ?? resp?.data?.results;
  if (!Array.isArray(results)) return buckets;
  const result = results.find((r: any) => r?.queryName === name);
  if (!result) return buckets;

  const seriesList: any[] = result.aggregations
    ? result.aggregations.flatMap((agg: any) => agg.series ?? [])
    : (result.series ?? []);

  if (seriesList.length > 0) {
    for (const s of seriesList) {
      for (const v of s.values ?? []) {
        addToBucket(timestampMsFromValue(v.timestamp ?? v.ts ?? v.time), Number(v.value ?? 0) || 0);
      }
    }
    return buckets;
  }

  const columns: Array<{ name: string; columnType: string }> = result.columns ?? [];
  const rows: unknown[][] = result.data ?? [];
  if (columns.length === 0 || rows.length === 0) return buckets;
  const tsIdx = columns.findIndex((c) => /time|timestamp/i.test(c.name));
  const valIdx = columns.findIndex((c) => c.columnType === 'aggregation');
  if (tsIdx < 0 || valIdx < 0) return buckets;
  for (const row of rows) {
    addToBucket(timestampMsFromValue(row[tsIdx]), Number(row[valIdx] ?? 0) || 0);
  }
  return buckets;
};

type UsageCostGroupBy = 'model' | 'agent' | 'generation_type' | 'conversation' | 'provider';

interface UsageCostSummaryRow {
  groupKey: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  eventCount: number;
}

// Single source of truth for cost-summary aggregations: the expression list
// sent to SigNoz and the response-column indices used to parse it are both
// derived from this array, so reordering it keeps them in sync.
const USAGE_COST_AGGREGATION_ORDER = [
  { key: 'inputTokens', expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS})` },
  { key: 'outputTokens', expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS})` },
  { key: 'cost', expression: `sum(${SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD})` },
  { key: 'eventCount', expression: 'count()' },
] as const;

type UsageCostAggregationKey = (typeof USAGE_COST_AGGREGATION_ORDER)[number]['key'];

const USAGE_COST_AGGREGATIONS = USAGE_COST_AGGREGATION_ORDER.map((a) => a.expression);

const USAGE_COST_AGGREGATION_INDEX = Object.fromEntries(
  USAGE_COST_AGGREGATION_ORDER.map((a, i) => [a.key, i])
) as Record<UsageCostAggregationKey, number>;

const usageCostQueryName = (groupBy: UsageCostGroupBy): string => `usageCost_${groupBy}`;

const usageCostGroupByKey = (groupBy: UsageCostGroupBy): string => {
  switch (groupBy) {
    case 'model':
      return SPAN_KEYS.AI_MODEL_ID;
    case 'agent':
      return SPAN_KEYS.AGENT_ID;
    case 'generation_type':
      return SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE;
    case 'conversation':
      return SPAN_KEYS.CONVERSATION_ID;
    case 'provider':
      return SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER;
  }
};

const seriesToUsageSummaryRows = (series: Series[], groupByKey: string): UsageCostSummaryRow[] => {
  const readNumber = (s: Series, key: UsageCostAggregationKey) =>
    Number(s.values?.[USAGE_COST_AGGREGATION_INDEX[key]]?.value ?? 0) || 0;
  const readInt = (s: Series, key: UsageCostAggregationKey) =>
    parseInt(s.values?.[USAGE_COST_AGGREGATION_INDEX[key]]?.value ?? '0', 10) || 0;

  return series
    .map((s) => {
      const totalInputTokens = readNumber(s, 'inputTokens');
      const totalOutputTokens = readNumber(s, 'outputTokens');
      return {
        groupKey: s.labels?.[groupByKey] || UNKNOWN_VALUE,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalEstimatedCostUsd: readNumber(s, 'cost'),
        eventCount: readInt(s, 'eventCount'),
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);
};

const datesRange = (startMs: number, endMs: number) => {
  const start = new Date(startMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }
  return out;
};

// ---------- Client

const CRITICAL_ERROR_SPAN_NAMES = [
  'execution_handler.execute',
  'agent.load_tools',
  'context.handle_context_resolution',
  'context.resolve',
  'agent.generate',
  'context-resolver.resolve_single_fetch_definition',
  'agent_session.generate_structured_update',
  'agent_session.process_artifact',
  'agent_session.generate_artifact_metadata',
  'response.format_object_response',
  'response.format_response',
  'ai.toolCall',
];

class SigNozStatsAPI {
  private tenantId: string | null = null;

  setTenantId(tenantId: string) {
    this.tenantId = tenantId;
  }

  private async makeRequest<T = any>(payload: any, projectId?: string): Promise<T> {
    if (!this.tenantId) {
      throw new Error('TenantId not set. Call setTenantId() before making requests.');
    }

    const requestPayload = {
      ...payload,
      ...(projectId && { projectId }),
    };

    const response = await fetchWithRetry(`/api/traces?tenantId=${this.tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
      credentials: 'include',
      timeout: 30000,
      maxAttempts: 3,
      label: 'signoz-stats-query',
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async makePipelineRequest(
    paginationPayload: any,
    detailPayloadTemplate: any
  ): Promise<{ paginationResponse: any; detailResponse: any }> {
    if (!this.tenantId) {
      throw new Error('TenantId not set. Call setTenantId() before making requests.');
    }

    const response = await fetchWithRetry(`/api/traces?tenantId=${this.tenantId}&mode=batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paginationPayload, detailPayloadTemplate }),
      credentials: 'include',
      timeout: 60000,
      maxAttempts: 3,
      label: 'signoz-stats-batch-query',
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // --- Helpers to read SigNoz response
  private extractSeries(resp: any, name: string): Series[] {
    const results = resp?.data?.data?.results ?? resp?.data?.results;
    if (!results) {
      return [];
    }
    const result = results.find((r: any) => r?.queryName === name);
    if (!result) return [];
    if (result.aggregations) {
      return result.aggregations.flatMap((agg: any) =>
        (agg.series ?? []).map((s: any) => ({
          labels: Array.isArray(s.labels)
            ? Object.fromEntries(
                (s.labels as any[]).map((l: any) => [l.key?.name ?? '', String(l.value ?? '')])
              )
            : (s.labels ?? {}),
          values: (s.values ?? []).map((v: any) => ({ value: String(v.value ?? '0') })),
        }))
      );
    }
    const columns: Array<{ name: string; columnType: string }> = result.columns ?? [];
    const rows: unknown[][] = result.data ?? [];
    return rows.map((row) => {
      const labels: Record<string, string> = {};
      const values: Array<{ value: string }> = [];
      columns.forEach((col, i) => {
        if (col.columnType === 'group') labels[col.name] = row[i] == null ? '' : String(row[i]);
        else if (col.columnType === 'aggregation')
          values.push({ value: row[i] == null ? '0' : String(row[i]) });
      });
      return { labels, values };
    });
  }

  private extractToolCallAggregates(resp: any): {
    totalToolCalls: number;
    totalTransfers: number;
    totalDelegations: number;
  } {
    const series = this.extractSeries(resp, 'aggToolCallsByType');
    let totalToolCalls = 0;
    let totalTransfers = 0;
    let totalDelegations = 0;
    for (const s of series) {
      const toolType = s.labels?.[SPAN_KEYS.AI_TOOL_TYPE];
      const count = countFromSeries(s);
      if (toolType === AI_TOOL_TYPES.MCP) totalToolCalls += count;
      else if (toolType === AI_TOOL_TYPES.TRANSFER) totalTransfers += count;
      else if (toolType === AI_TOOL_TYPES.DELEGATION) totalDelegations += count;
    }
    return { totalToolCalls, totalTransfers, totalDelegations };
  }

  // ---------- Public methods (unchanged signatures)

  async getConversationStats(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean
  ): Promise<PaginatedConversationStats> {
    try {
      return await this.getConversationStatsPaginated(
        startTime,
        endTime,
        filters,
        projectId,
        pagination,
        searchQuery,
        agentId,
        hasErrors
      );
    } catch (e) {
      console.error('getConversationStats error:', e);
      return {
        data: [],
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }
  }

  private parseDetailResponse(
    resp: any,
    conversationIds: string[]
  ): { orderedStats: ConversationStats[]; firstSeen: Map<string, number> } {
    const toolsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TOOLS);
    const lastActivitySeries = this.extractSeries(resp, QUERY_EXPRESSIONS.LAST_ACTIVITY);
    const metadataSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.CONVERSATION_METADATA);
    const spansWithErrorsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.SPANS_WITH_ERRORS);
    const userMessagesSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.USER_MESSAGES);

    // metadata map
    const metaByConv = new Map<string, { tenantId: string; agentId: string; agentName: string }>();
    for (const s of metadataSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      metaByConv.set(id, {
        tenantId: s.labels?.[SPAN_KEYS.TENANT_ID] ?? UNKNOWN_VALUE,
        agentId: s.labels?.[SPAN_KEYS.AGENT_ID] ?? UNKNOWN_VALUE,
        agentName: s.labels?.[SPAN_KEYS.AGENT_NAME] ?? UNKNOWN_VALUE,
      });
    }

    // first seen map
    const firstSeen = new Map<string, number>();
    for (const s of lastActivitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      firstSeen.set(id, timestampMsFromSeries(s));
    }

    // first user message per conversation
    const firstMsgByConv = new Map<string, { content: string; timestamp: number }>();
    const msgsByConv = new Map<string, Array<{ t: number; c: string }>>();
    for (const s of userMessagesSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      const content = s.labels?.[SPAN_KEYS.MESSAGE_CONTENT];
      const t = timestampMsFromSeries(s);
      if (!id || !content) continue;
      (msgsByConv.get(id) ?? msgsByConv.set(id, []).get(id))?.push({ t, c: content });
    }
    for (const [id, arr] of msgsByConv) {
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0];
      if (first) {
        const content = first.c.length > 100 ? `${first.c.slice(0, 100)}...` : first.c;
        firstMsgByConv.set(id, { content, timestamp: first.t });
      }
    }

    const stats = this.toConversationStats(
      toolsSeries,
      metaByConv,
      spansWithErrorsSeries,
      firstMsgByConv
    );

    // Filter to only include the paginated conversation IDs (in the correct order)
    const statsMap = new Map(stats.map((s) => [s.conversationId, s]));
    const orderedStats = conversationIds
      .map((id) => statsMap.get(id))
      .filter((s): s is ConversationStats => s !== undefined);

    // Sort by first activity to maintain order
    orderedStats.sort((a, b) =>
      byFirstActivity(firstSeen.get(a.conversationId), firstSeen.get(b.conversationId))
    );

    return { orderedStats, firstSeen };
  }

  private async getConversationStatsPaginated(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean
  ): Promise<PaginatedConversationStats> {
    const hasSearchQuery = !!searchQuery?.trim();
    const hasSpanFilters = !!(filters?.spanName || filters?.attributes?.length);
    const useServerSidePagination = !hasSearchQuery && !hasSpanFilters;

    const makePaginationResult = (total: number) => ({
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
      hasNextPage: pagination.page < Math.ceil(total / pagination.limit),
      hasPreviousPage: pagination.page > 1,
    });

    // Fast path: use server-side pipeline (1 browser round-trip instead of 2)
    if (useServerSidePagination) {
      const paginationPayload = this.buildFilteredConversationIdsPayload(
        startTime,
        endTime,
        filters,
        projectId,
        agentId,
        false,
        pagination,
        hasErrors
      );

      const sanitizedAgentId = agentId && agentId !== 'all' ? agentId : undefined;
      const detailPayloadTemplate = this.buildCombinedPayload(
        startTime,
        endTime,
        filters,
        projectId,
        sanitizedAgentId,
        undefined
      );

      const { paginationResponse, detailResponse } = await this.makePipelineRequest(
        paginationPayload,
        detailPayloadTemplate
      );

      const zeroSeries = { values: [{ value: '0' }] } as Series;
      const toolAggs = this.extractToolCallAggregates(paginationResponse);
      const aggregateStats: AggregateStats = {
        ...toolAggs,
        totalAICalls: countFromSeries(
          this.extractSeries(paginationResponse, 'aggAICalls')[0] || zeroSeries
        ),
        totalConversations: 0,
      };

      const pageSeries = this.extractSeries(
        paginationResponse,
        QUERY_EXPRESSIONS.PAGE_CONVERSATIONS
      );
      const allConversationIds = pageSeries
        .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
        .filter(Boolean) as string[];

      const totalSeries = this.extractSeries(
        paginationResponse,
        QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS
      );
      const total = countFromSeries(totalSeries[0] || zeroSeries);
      aggregateStats.totalConversations = total;

      const pageStart = (pagination.page - 1) * pagination.limit;
      const conversationIds = allConversationIds.slice(pageStart, pageStart + pagination.limit);

      if (conversationIds.length === 0 || !detailResponse) {
        return {
          data: [],
          pagination: makePaginationResult(total),
          aggregateStats,
        };
      }

      const { orderedStats } = this.parseDetailResponse(detailResponse, conversationIds);

      return {
        data: orderedStats,
        pagination: makePaginationResult(total),
        aggregateStats,
      };
    }

    // Slow path: search or span filters require client-side processing (2 round-trips)
    const { conversationIds, total, aggregateStats } = await this.getPaginatedConversationIds(
      startTime,
      endTime,
      filters,
      projectId,
      pagination,
      searchQuery,
      agentId,
      hasErrors
    );

    if (conversationIds.length === 0) {
      return {
        data: [],
        pagination: makePaginationResult(total),
        aggregateStats,
      };
    }

    const payload = this.buildCombinedPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      conversationIds
    );
    const resp = await this.makeRequest(payload);
    const { orderedStats } = this.parseDetailResponse(resp, conversationIds);

    return {
      data: orderedStats,
      pagination: makePaginationResult(total),
      aggregateStats,
    };
  }

  private async getPaginatedConversationIds(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean
  ): Promise<{ conversationIds: string[]; total: number; aggregateStats: AggregateStats }> {
    const hasSearchQuery = !!searchQuery?.trim();
    const hasSpanFilters = !!(filters?.spanName || filters?.attributes?.length);

    const consolidatedPayload = this.buildFilteredConversationIdsPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      hasSearchQuery,
      undefined,
      hasErrors
    );

    const consolidatedResp = await this.makeRequest(consolidatedPayload);

    const zeroSeries = { values: [{ value: '0' }] } as Series;
    const extractAggregates = (): AggregateStats => ({
      ...this.extractToolCallAggregates(consolidatedResp),
      totalAICalls: countFromSeries(
        this.extractSeries(consolidatedResp, 'aggAICalls')[0] || zeroSeries
      ),
      totalConversations: 0,
    });

    // Slow path: client-side filtering needed for search or span filters
    const activitySeries = this.extractSeries(
      consolidatedResp,
      QUERY_EXPRESSIONS.PAGE_CONVERSATIONS
    );
    const activityMap = new Map<string, number>();
    for (const s of activitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      activityMap.set(id, timestampMsFromSeries(s));
    }

    let conversationIds = Array.from(activityMap.keys());

    // Apply span filters if needed
    if (hasSpanFilters) {
      const filteredSeries = this.extractSeries(
        consolidatedResp,
        QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS
      );
      const filteredIds = new Set(
        filteredSeries.map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID]).filter(Boolean) as string[]
      );
      conversationIds = conversationIds.filter((id) => filteredIds.has(id));
    }

    // Apply search filtering if needed
    if (hasSearchQuery) {
      const metadataSeries = this.extractSeries(
        consolidatedResp,
        QUERY_EXPRESSIONS.CONVERSATION_METADATA
      );
      const metadataMap = new Map<string, { agentId: string; conversationId: string }>();
      for (const s of metadataSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        const agentIdValue = s.labels?.[SPAN_KEYS.AGENT_ID];
        if (!id) continue;
        metadataMap.set(id, { agentId: agentIdValue ?? '', conversationId: id });
      }

      const userMessagesSeries = this.extractSeries(
        consolidatedResp,
        QUERY_EXPRESSIONS.USER_MESSAGES
      );
      const firstMessagesMap = new Map<string, string>();
      for (const s of userMessagesSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        const content = s.labels?.[SPAN_KEYS.MESSAGE_CONTENT];
        if (!id || !content) continue;
        if (!firstMessagesMap.has(id)) {
          firstMessagesMap.set(id, content);
        }
      }

      const q = searchQuery?.toLowerCase().trim() ?? '';
      conversationIds = conversationIds.filter((id) => {
        const meta = metadataMap.get(id);
        const firstMsg = firstMessagesMap.get(id);
        return (
          firstMsg?.toLowerCase().includes(q) ||
          id.toLowerCase().includes(q) ||
          meta?.agentId.toLowerCase().includes(q)
        );
      });
    }

    // Sort by last activity (descending - most recent first)
    conversationIds.sort((a, b) => {
      const aTime = activityMap.get(a) ?? 0;
      const bTime = activityMap.get(b) ?? 0;
      return bTime - aTime;
    });

    const total = conversationIds.length;
    const start = (pagination.page - 1) * pagination.limit;
    const paginatedIds = conversationIds.slice(start, start + pagination.limit);

    const aggregateStats = extractAggregates();
    aggregateStats.totalConversations = total;

    return { conversationIds: paginatedIds, total, aggregateStats };
  }

  async getAICallsBySubAgent(
    startTime: number,
    endTime: number,
    agentId?: string,
    modelId?: string,
    projectId?: string
  ) {
    try {
      const resp = await this.makeRequest(
        this.buildAgentModelBreakdownPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'agentModelCalls');
      const acc = new Map<
        string,
        {
          subAgentId: string;
          agentId: string;
          modelId: string;
          totalCalls: number;
        }
      >();

      for (const s of series) {
        const subAgent = s.labels?.[SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID] || UNKNOWN_VALUE;
        const gId = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        const mId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);

        if (!count) continue;
        if (agentId && agentId !== 'all' && gId !== agentId) continue;
        if (modelId && modelId !== 'all' && mId !== modelId) continue;

        const key = `${subAgent}::${gId}::${mId}`;
        const row = acc.get(key) || {
          subAgentId: subAgent,
          agentId: gId,
          modelId: mId,
          totalCalls: 0,
        };
        row.totalCalls += count;
        acc.set(key, row);
      }
      return [...acc.values()].sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getAICallsByAgent error:', e);
      return [];
    }
  }

  async getAICallsByModel(
    startTime: number,
    endTime: number,
    agentId?: string,
    projectId?: string
  ) {
    try {
      const resp = await this.makeRequest(
        this.buildModelBreakdownPayload(
          startTime,
          endTime,
          buildScopedFilterItems('conversation', projectId),
          projectId
        )
      );
      return this.parseModelCallsResponse(resp, agentId);
    } catch (e) {
      console.error('getAICallsByModel error:', e);
      return [];
    }
  }

  async getUsageCallsByModel(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildModelBreakdownPayload(
          startTime,
          endTime,
          buildScopedFilterItems('all-usage', projectId),
          projectId
        )
      );
      return this.parseModelCallsResponse(resp);
    } catch (e) {
      console.error('getUsageCallsByModel error:', e);
      return [];
    }
  }

  private parseModelCallsResponse(
    resp: any,
    agentId?: string
  ): Array<{ modelId: string; totalCalls: number }> {
    const series = this.extractSeries(resp, 'modelCalls');
    const totals = new Map<string, number>();

    for (const s of series) {
      const mId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
      const count = countFromSeries(s);
      if (!count) continue;
      if (agentId && agentId !== 'all') {
        const gId = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        if (gId !== agentId) continue;
      }
      totals.set(mId, (totals.get(mId) || 0) + count);
    }

    return [...totals]
      .map(([modelId, totalCalls]) => ({ modelId, totalCalls }))
      .sort((a, b) => b.totalCalls - a.totalCalls);
  }

  private parseTokenUsageResponse(resp: any): TokenUsageResult {
    const inputByModelSeries = this.extractSeries(resp, 'inputTokensByModel');
    const outputByModelSeries = this.extractSeries(resp, 'outputTokensByModel');
    const inputByAgentSeries = this.extractSeries(resp, 'inputTokensByAgent');
    const outputByAgentSeries = this.extractSeries(resp, 'outputTokensByAgent');
    const inputByProjectSeries = this.extractSeries(resp, 'inputTokensByProject');
    const outputByProjectSeries = this.extractSeries(resp, 'outputTokensByProject');

    const aggregate = (
      inputSeries: Series[],
      outputSeries: Series[],
      labelKey: string
    ): Map<string, { inputTokens: number; outputTokens: number }> => {
      const stats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of inputSeries) {
        const key = s.labels?.[labelKey] || UNKNOWN_VALUE;
        const existing = stats.get(key) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += numberFromSeries(s);
        stats.set(key, existing);
      }
      for (const s of outputSeries) {
        const key = s.labels?.[labelKey] || UNKNOWN_VALUE;
        const existing = stats.get(key) || { inputTokens: 0, outputTokens: 0 };
        existing.outputTokens += numberFromSeries(s);
        stats.set(key, existing);
      }
      return stats;
    };

    const toSorted = <T extends { totalTokens: number }>(
      stats: Map<string, { inputTokens: number; outputTokens: number }>,
      mapEntry: (key: string, v: { inputTokens: number; outputTokens: number }) => T
    ): T[] =>
      [...stats.entries()]
        .map(([key, v]) => mapEntry(key, v))
        .sort((a, b) => b.totalTokens - a.totalTokens);

    const byModel = toSorted(
      aggregate(inputByModelSeries, outputByModelSeries, SPAN_KEYS.AI_MODEL_ID),
      (modelId, s) => ({ modelId, ...s, totalTokens: s.inputTokens + s.outputTokens })
    );
    const byAgent = toSorted(
      aggregate(inputByAgentSeries, outputByAgentSeries, SPAN_KEYS.AGENT_ID),
      (agentId, s) => ({ agentId, ...s, totalTokens: s.inputTokens + s.outputTokens })
    );
    const byProject = toSorted(
      aggregate(inputByProjectSeries, outputByProjectSeries, SPAN_KEYS.PROJECT_ID),
      (projectId, s) => ({ projectId, ...s, totalTokens: s.inputTokens + s.outputTokens })
    );

    const totals = {
      inputTokens: byModel.reduce((sum, m) => sum + m.inputTokens, 0),
      outputTokens: byModel.reduce((sum, m) => sum + m.outputTokens, 0),
      totalTokens: byModel.reduce((sum, m) => sum + m.totalTokens, 0),
    };

    return { byModel, byAgent, byProject, totals };
  }

  async getTokenUsageStats(
    startTime: number,
    endTime: number,
    projectId?: string
  ): Promise<TokenUsageResult> {
    try {
      const resp = await this.makeRequest(
        this.buildTokenUsagePayload(
          startTime,
          endTime,
          buildScopedFilterItems('conversation', projectId),
          projectId
        )
      );
      return this.parseTokenUsageResponse(resp);
    } catch (e) {
      console.error('getTokenUsageStats error:', e);
      return EMPTY_TOKEN_USAGE;
    }
  }

  async getUsageTokenBreakdown(
    startTime: number,
    endTime: number,
    projectId?: string
  ): Promise<TokenUsageResult> {
    try {
      const resp = await this.makeRequest(
        this.buildTokenUsagePayload(
          startTime,
          endTime,
          buildScopedFilterItems('all-usage', projectId),
          projectId
        )
      );
      return this.parseTokenUsageResponse(resp);
    } catch (e) {
      console.error('getUsageTokenBreakdown error:', e);
      return EMPTY_TOKEN_USAGE;
    }
  }

  async getUniqueAgents(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildUniqueAgentsPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'uniqueAgents');
      const agent = series
        .map((s) => s.labels?.[SPAN_KEYS.AGENT_ID])
        .filter((id): id is string => Boolean(id) && id !== UNKNOWN_VALUE)
        .sort();
      return [...new Set(agent)];
    } catch (e) {
      console.error('getUniqueAgents error:', e);
      return [];
    }
  }

  async getUniqueModels(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildUniqueModelsPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'uniqueModels');
      const models = series
        .map((s) => s.labels?.[SPAN_KEYS.AI_MODEL_ID])
        .filter((id): id is string => Boolean(id) && id !== UNKNOWN_VALUE)
        .sort();
      return [...new Set(models)];
    } catch (e) {
      console.error('getUniqueModels error:', e);
      return [];
    }
  }

  async getToolCallsByTool(
    startTime: number,
    endTime: number,
    serverName?: string,
    projectId?: string
  ) {
    try {
      const resp = await this.makeRequest(
        this.buildToolBreakdownPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'toolCalls');
      const errorSeries = this.extractSeries(resp, 'toolErrors');

      const errorMap = new Map<string, number>();
      for (const s of errorSeries) {
        const toolName = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_NAME] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        errorMap.set(toolName, (errorMap.get(toolName) || 0) + count);
      }

      const acc = new Map<
        string,
        {
          toolName: string;
          serverName: string;
          serverId: string;
          totalCalls: number;
          errorCount: number;
          errorRate: number;
        }
      >();

      for (const s of series) {
        const toolName = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_NAME] || UNKNOWN_VALUE;
        const server = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME] || UNKNOWN_VALUE;
        const serverId = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);

        if (!count) continue;
        if (serverName && serverName !== 'all' && server !== serverName) continue;

        const key = `${toolName}::${server}::${serverId}`;
        const row = acc.get(key) || {
          toolName,
          serverName: server,
          serverId,
          totalCalls: 0,
          errorCount: 0,
          errorRate: 0,
        };
        row.totalCalls += count;
        row.errorCount = errorMap.get(toolName) || 0;
        row.errorRate = row.totalCalls > 0 ? (row.errorCount / row.totalCalls) * 100 : 0;
        acc.set(key, row);
      }

      return [...acc.values()].sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getToolCallsByTool error:', e);
      return [];
    }
  }

  async getUniqueToolServers(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildUniqueToolServersPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'uniqueServers');
      const serverMap = new Map<string, { name: string; id: string }>();
      for (const s of series) {
        const name = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME];
        const id = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID] || '';
        if (name && name !== UNKNOWN_VALUE) {
          serverMap.set(name, { name, id });
        }
      }
      return [...serverMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error('getUniqueToolServers error:', e);
      return [];
    }
  }

  async getUniqueToolNames(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildUniqueToolNamesPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'uniqueTools');
      const tools = series
        .map((s) => s.labels?.[SPAN_KEYS.AI_TOOL_CALL_NAME])
        .filter((id): id is string => Boolean(id) && id !== UNKNOWN_VALUE)
        .sort();
      return [...new Set(tools)];
    } catch (e) {
      console.error('getUniqueToolNames error:', e);
      return [];
    }
  }

  async getConversationsPerDay(
    startTime: number,
    endTime: number,
    agentId?: string,
    projectId?: string
  ) {
    try {
      // Fetch conversation activity directly — no need for a metadata pre-check
      const activityResp = await this.makeRequest(
        this.buildConversationActivityPayload(startTime, endTime, agentId, projectId)
      );
      const activitySeries = this.extractSeries(activityResp, 'lastActivity');

      const buckets = new Map<string, number>();
      for (const s of activitySeries) {
        const tsMs = timestampMsFromSeries(s);
        if (!tsMs) continue;
        const d = new Date(tsMs);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }

      return datesRange(startTime, endTime).map((date) => ({
        date,
        count: buckets.get(date) || 0,
      }));
    } catch (e) {
      console.error('getConversationsPerDay error:', e);
      return datesRange(startTime, endTime).map((date) => ({ date, count: 0 }));
    }
  }

  async getAvailableSpanNames(
    startTime: number,
    endTime: number,
    agentId?: string,
    projectId?: string
  ) {
    try {
      const spanNameFilterItems: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.NAME, op: OPERATORS.EXISTS, value: '' },
        ...(agentId && agentId !== 'all'
          ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }]
          : []),
        ...(projectId
          ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }]
          : []),
      ];

      const payload = {
        start: startTime,
        end: endTime,
        requestType: REQUEST_TYPES.SCALAR,
        compositeQuery: {
          queries: [
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: QUERY_EXPRESSIONS.SPAN_NAMES,
                signal: SIGNALS.TRACES,
                filter: { expression: buildFilterExpression(spanNameFilterItems) },
                aggregations: [{ expression: 'count()' }],
                groupBy: [
                  {
                    name: SPAN_KEYS.NAME,
                    fieldDataType: FIELD_DATA_TYPES.STRING,
                    fieldContext: FIELD_CONTEXTS.SPAN,
                  },
                ],
                order: [{ key: { name: SPAN_KEYS.NAME }, direction: ORDER_DIRECTIONS.ASC }],
                stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
                limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
                disabled: QUERY_DEFAULTS.DISABLED,
              },
            },
          ],
        },
        variables: {},
        projectId,
      };

      const resp = await this.makeRequest(payload);
      const series = this.extractSeries(resp, QUERY_EXPRESSIONS.SPAN_NAMES);
      return series.map((s) => s.labels?.[SPAN_KEYS.NAME]).filter((n): n is string => !!n);
    } catch (e) {
      console.error('getAvailableSpanNames error:', e);
      return [];
    }
  }

  // ---------- Private: transform + filter

  private toConversationStats(
    toolCallsSeries: Series[],
    metaByConv: Map<string, { tenantId: string; agentId: string; agentName: string }>,
    spansWithErrorsSeries: Series[],
    firstMsgByConv: Map<string, { content: string; timestamp: number }>
  ): ConversationStats[] {
    type Acc = {
      totalToolCalls: number;
      toolsUsed: Map<string, { name: string; calls: number; description: string }>;
      totalErrors: number;
    };

    const byConv = new Map<string, Acc>();

    const ensure = (id: string) => {
      const cur = byConv.get(id);
      if (cur) return cur;
      const blank: Acc = {
        totalToolCalls: 0,
        toolsUsed: new Map(),
        totalErrors: 0,
      };
      byConv.set(id, blank);
      return blank;
    };

    for (const s of toolCallsSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const name = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_NAME];
      if (!name) continue;
      const calls = countFromSeries(s);
      if (!calls) continue;
      const desc = s.labels?.[SPAN_KEYS.MCP_TOOL_DESCRIPTION] || '';
      const acc = ensure(id);
      acc.totalToolCalls += calls;
      const t = acc.toolsUsed.get(name) || {
        name,
        calls: 0,
        description: desc,
      };
      t.calls += calls;
      acc.toolsUsed.set(name, t);
    }

    for (const s of spansWithErrorsSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const spanName = s.labels?.[SPAN_KEYS.NAME] || '';
      const count = countFromSeries(s);
      if (!count) continue;

      if (CRITICAL_ERROR_SPAN_NAMES.includes(spanName)) {
        ensure(id).totalErrors += count;
      }
    }

    const out: ConversationStats[] = [];
    const allConvIds = new Set<string>([...byConv.keys(), ...metaByConv.keys()]);
    for (const id of allConvIds) {
      const acc = byConv.get(id) || ensure(id);
      const meta = metaByConv.get(id) || {
        tenantId: UNKNOWN_VALUE,
        agentId: UNKNOWN_VALUE,
        agentName: UNKNOWN_VALUE,
      };
      out.push({
        conversationId: id,
        tenantId: meta.tenantId,
        agentId: meta.agentId,
        agentName: meta.agentName || '',
        totalToolCalls: acc.totalToolCalls,
        toolsUsed: [...acc.toolsUsed.values()],
        totalErrors: acc.totalErrors,
        hasErrors: acc.totalErrors > 0,
        firstUserMessage: firstMsgByConv.get(id)?.content,
        startTime: firstMsgByConv.get(id)?.timestamp,
      });
    }
    return out;
  }

  // ---------- Payload builders (unchanged behavior, less repetition)

  private buildAgentModelBreakdownPayload(start: number, end: number, projectId?: string) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.AGENT_MODEL_CALLS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AGENT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_MODEL_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildModelBreakdownPayload(
    start: number,
    end: number,
    filterItems: Array<{ key: string; op: string; value: unknown }>,
    projectId?: string
  ) {
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.MODEL_CALLS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_MODEL_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AGENT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildConversationActivityPayload(
    start: number,
    end: number,
    agentId?: string,
    projectId?: string
  ) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ...(agentId && agentId !== 'all'
        ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }]
        : []),
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `min(${SPAN_KEYS.TIMESTAMP})` }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [
                { key: { name: `min(${SPAN_KEYS.TIMESTAMP})` }, direction: ORDER_DIRECTIONS.DESC },
              ],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildFilteredConversationIdsPayload(
    start: number,
    end: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    agentId: string | undefined,
    includeSearchData: boolean,
    pagination?: { page: number; limit: number },
    hasErrors?: boolean
  ) {
    const buildBaseFilterItems = (): Array<{ key: string; op: string; value: unknown }> => {
      const items: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ];
      if (agentId && agentId !== 'all') {
        items.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
      }
      if (projectId) {
        items.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
      }
      if (hasErrors) {
        items.push(
          { key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true },
          { key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: CRITICAL_ERROR_SPAN_NAMES }
        );
      }
      return items;
    };

    const paginationWindowLimit =
      pagination && !includeSearchData
        ? pagination.page * pagination.limit
        : QUERY_DEFAULTS.LIMIT_UNLIMITED;

    const queries: any[] = [
      {
        type: QUERY_TYPES.BUILDER_QUERY,
        spec: {
          name: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
          signal: SIGNALS.TRACES,
          aggregations: [{ expression: `max(${SPAN_KEYS.TIMESTAMP})` }],
          filter: { expression: buildFilterExpression(buildBaseFilterItems()) },
          groupBy: [
            {
              name: SPAN_KEYS.CONVERSATION_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
          ],
          order: [
            { key: { name: `max(${SPAN_KEYS.TIMESTAMP})` }, direction: ORDER_DIRECTIONS.DESC },
          ],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: paginationWindowLimit,
          disabled: QUERY_DEFAULTS.DISABLED,
        },
      },
      {
        type: QUERY_TYPES.BUILDER_QUERY,
        spec: {
          name: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
          signal: SIGNALS.TRACES,
          aggregations: [{ expression: `count_distinct(${SPAN_KEYS.CONVERSATION_ID})` }],
          filter: { expression: buildFilterExpression(buildBaseFilterItems()) },
          groupBy: [],
          order: [],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: 1,
          disabled: QUERY_DEFAULTS.DISABLED,
        },
      },
    ];

    if (filters?.spanName || filters?.attributes?.length) {
      const filteredConvItems: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ];

      if (filters.spanName) {
        filteredConvItems.push({
          key: SPAN_KEYS.NAME,
          op: OPERATORS.EQUALS,
          value: filters.spanName,
        });
      }

      for (const attr of filters.attributes ?? []) {
        let op = attr.operator ?? OPERATORS.EQUALS;
        if (op === 'contains') op = OPERATORS.LIKE;
        if (op === 'ncontains') op = OPERATORS.NOT_LIKE;
        let value: any = asTypedFilterValue(attr.value);
        let dataType: DataType = FIELD_DATA_TYPES.STRING;
        if (typeof value === 'boolean') dataType = FIELD_DATA_TYPES.BOOL;
        else if (typeof value === 'number' && op !== OPERATORS.LIKE && op !== OPERATORS.NOT_LIKE)
          dataType = Number.isInteger(value) ? FIELD_DATA_TYPES.INT64 : FIELD_DATA_TYPES.FLOAT64;

        if (op === OPERATORS.EXISTS || op === OPERATORS.NOT_EXISTS) {
          filteredConvItems.push({ key: attr.key, op, value: '' });
          continue;
        }

        if (op === OPERATORS.LIKE || op === OPERATORS.NOT_LIKE) {
          value = String(value);
          dataType = FIELD_DATA_TYPES.STRING;
          if (!value.includes('%')) value = `%${value}%`;
        }

        if (
          (dataType === FIELD_DATA_TYPES.INT64 || dataType === FIELD_DATA_TYPES.FLOAT64) &&
          op === OPERATORS.EQUALS
        ) {
          filteredConvItems.push({ key: attr.key, op: OPERATORS.GREATER_THAN_OR_EQUAL, value });
          filteredConvItems.push({ key: attr.key, op: OPERATORS.LESS_THAN_OR_EQUAL, value });
        } else {
          filteredConvItems.push({ key: attr.key, op, value });
        }
      }

      if (projectId) {
        filteredConvItems.push({
          key: SPAN_KEYS.PROJECT_ID,
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }

      queries.push({
        type: QUERY_TYPES.BUILDER_QUERY,
        spec: {
          name: QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS,
          signal: SIGNALS.TRACES,
          aggregations: [{ expression: 'count()' }],
          filter: { expression: buildFilterExpression(filteredConvItems) },
          groupBy: [
            {
              name: SPAN_KEYS.CONVERSATION_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
          ],
          order: [],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          disabled: QUERY_DEFAULTS.DISABLED,
        },
      });
    }

    if (includeSearchData) {
      const metadataItems: Array<{ key: string; op: string; value: unknown }> = [
        ...buildBaseFilterItems(),
        { key: SPAN_KEYS.TENANT_ID, op: OPERATORS.EXISTS, value: '' },
        { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EXISTS, value: '' },
      ];

      queries.push({
        type: QUERY_TYPES.BUILDER_QUERY,
        spec: {
          name: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
          signal: SIGNALS.TRACES,
          aggregations: [{ expression: 'count()' }],
          filter: { expression: buildFilterExpression(metadataItems) },
          groupBy: [
            {
              name: SPAN_KEYS.CONVERSATION_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
            {
              name: SPAN_KEYS.TENANT_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
            {
              name: SPAN_KEYS.AGENT_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
            {
              name: SPAN_KEYS.AGENT_NAME,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
          ],
          order: [],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          disabled: QUERY_DEFAULTS.DISABLED,
        },
      });

      const userMsgItems: Array<{ key: string; op: string; value: unknown }> = [
        ...buildBaseFilterItems(),
        { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' },
      ];

      queries.push({
        type: QUERY_TYPES.BUILDER_QUERY,
        spec: {
          name: QUERY_EXPRESSIONS.USER_MESSAGES,
          signal: SIGNALS.TRACES,
          aggregations: [{ expression: `min(${SPAN_KEYS.TIMESTAMP})` }],
          filter: { expression: buildFilterExpression(userMsgItems) },
          groupBy: [
            {
              name: SPAN_KEYS.CONVERSATION_ID,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
            {
              name: SPAN_KEYS.MESSAGE_CONTENT,
              fieldDataType: FIELD_DATA_TYPES.STRING,
              fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
            },
          ],
          order: [],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          disabled: QUERY_DEFAULTS.DISABLED,
        },
      });
    }

    const toolCallsItems: Array<{ key: string; op: string; value: unknown }> = [
      ...buildBaseFilterItems(),
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
    ];

    queries.push({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: 'aggToolCallsByType',
        signal: SIGNALS.TRACES,
        aggregations: [{ expression: 'count()' }],
        filter: { expression: buildFilterExpression(toolCallsItems) },
        groupBy: [
          {
            name: SPAN_KEYS.AI_TOOL_TYPE,
            fieldDataType: FIELD_DATA_TYPES.STRING,
            fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
          },
        ],
        order: [],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        disabled: QUERY_DEFAULTS.DISABLED,
      },
    });

    const aiCallsItems: Array<{ key: string; op: string; value: unknown }> = [
      ...buildBaseFilterItems(),
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
    ];

    queries.push({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: 'aggAICalls',
        signal: SIGNALS.TRACES,
        aggregations: [{ expression: 'count()' }],
        filter: { expression: buildFilterExpression(aiCallsItems) },
        groupBy: [],
        order: [],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        disabled: QUERY_DEFAULTS.DISABLED,
      },
    });

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: { queries },
      variables: {},
      projectId,
    };
  }

  private buildCombinedPayload(
    start: number,
    end: number,
    _filters?: SpanFilterOptions,
    projectId?: string,
    agentId?: string,
    conversationIds?: string[]
  ) {
    const withContext = (
      base: Array<{ key: string; op: string; value: unknown }>
    ): Array<{ key: string; op: string; value: unknown }> => {
      const items = [...base];
      if (projectId)
        items.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
      if (agentId) items.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
      if (conversationIds && conversationIds.length > 0) {
        items.push({ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.IN, value: conversationIds });
      } else {
        items.push({ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' });
      }
      return items;
    };

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.TOOLS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression(
                  withContext([
                    { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
                    { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
                  ])
                ),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression(
                  withContext([
                    { key: SPAN_KEYS.TENANT_ID, op: OPERATORS.EXISTS, value: '' },
                    { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EXISTS, value: '' },
                  ])
                ),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.TENANT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AGENT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AGENT_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `max(${SPAN_KEYS.TIMESTAMP})` }],
              filter: { expression: buildFilterExpression(withContext([])) },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [
                { key: { name: `max(${SPAN_KEYS.TIMESTAMP})` }, direction: ORDER_DIRECTIONS.DESC },
              ],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression(
                  withContext([{ key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true }])
                ),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.SPAN,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.USER_MESSAGES,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `min(${SPAN_KEYS.TIMESTAMP})` }],
              filter: {
                expression: buildFilterExpression(
                  withContext([{ key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' }])
                ),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.MESSAGE_CONTENT,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildUniqueAgentsPayload(start: number, end: number, projectId?: string) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EXISTS, value: '' },
      { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.NOT_EQUALS, value: UNKNOWN_VALUE },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.UNIQUE_AGENTS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.AGENT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [{ key: { name: SPAN_KEYS.AGENT_ID }, direction: ORDER_DIRECTIONS.ASC }],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildUniqueModelsPayload(start: number, end: number, projectId?: string) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.AI_MODEL_ID, op: OPERATORS.EXISTS, value: '' },
      { key: SPAN_KEYS.AI_MODEL_ID, op: OPERATORS.NOT_EQUALS, value: UNKNOWN_VALUE },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.UNIQUE_MODELS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.AI_MODEL_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [{ key: { name: SPAN_KEYS.AI_MODEL_ID }, direction: ORDER_DIRECTIONS.ASC }],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildToolBreakdownPayload(start: number, end: number, projectId?: string) {
    const baseItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
      { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'toolCalls',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(baseItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'toolErrors',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...baseItems,
                  { key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true },
                ]),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildUniqueToolServersPayload(start: number, end: number, projectId?: string) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
      { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
      { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, op: OPERATORS.EXISTS, value: '' },
      {
        key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME,
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'uniqueServers',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [
                {
                  key: { name: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME },
                  direction: ORDER_DIRECTIONS.ASC,
                },
              ],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  private buildUniqueToolNamesPayload(start: number, end: number, projectId?: string) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
      { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
      { key: SPAN_KEYS.AI_TOOL_CALL_NAME, op: OPERATORS.EXISTS, value: '' },
      { key: SPAN_KEYS.AI_TOOL_CALL_NAME, op: OPERATORS.NOT_EQUALS, value: UNKNOWN_VALUE },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'uniqueTools',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.AI_TOOL_CALL_NAME,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [
                { key: { name: SPAN_KEYS.AI_TOOL_CALL_NAME }, direction: ORDER_DIRECTIONS.ASC },
              ],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
      projectId,
    };
  }

  // ============= Project Overview Stats Methods =============

  /**
   * Get aggregated stats across all projects or filtered by specific projects.
   * Returns: total conversations, avg user messages per conversation, total AI calls, total MCP calls
   */
  async getProjectOverviewStats(
    startTime: number,
    endTime: number,
    projectIds?: string[]
  ): Promise<{
    totalConversations: number;
    avgUserMessagesPerConversation: number;
    totalUserMessages: number;
    totalTriggerInvocations: number;
    totalSlackMessages: number;
    totalAICalls: number;
    totalMCPCalls: number;
  }> {
    try {
      // When filtering by a single project, pass it to makeRequest for server-side filtering
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const payload = this.buildProjectOverviewStatsPayload(startTime, endTime, projectIds);
      const resp = await this.makeRequest(payload, singleProjectId);

      const totalConversationsSeries = this.extractSeries(resp, 'totalConversations');
      const totalUserMessagesSeries = this.extractSeries(resp, 'totalUserMessages');
      const totalTriggerInvocationsSeries = this.extractSeries(resp, 'totalTriggerInvocations');
      const totalSlackMessagesSeries = this.extractSeries(resp, 'totalSlackMessages');
      const totalAICallsSeries = this.extractSeries(resp, 'totalAICalls');
      const totalMCPCallsSeries = this.extractSeries(resp, 'totalMCPCalls');

      const totalConversations = countFromSeries(
        totalConversationsSeries[0] || { values: [{ value: '0' }] }
      );
      const totalUserMessages = countFromSeries(
        totalUserMessagesSeries[0] || { values: [{ value: '0' }] }
      );
      const totalTriggerInvocations = countFromSeries(
        totalTriggerInvocationsSeries[0] || { values: [{ value: '0' }] }
      );
      const totalSlackMessages = countFromSeries(
        totalSlackMessagesSeries[0] || { values: [{ value: '0' }] }
      );
      const totalAICalls = countFromSeries(totalAICallsSeries[0] || { values: [{ value: '0' }] });
      const totalMCPCalls = countFromSeries(totalMCPCallsSeries[0] || { values: [{ value: '0' }] });

      const avgUserMessagesPerConversation =
        totalConversations > 0 ? Math.round((totalUserMessages / totalConversations) * 10) / 10 : 0;

      return {
        totalConversations,
        avgUserMessagesPerConversation,
        totalUserMessages,
        totalTriggerInvocations,
        totalSlackMessages,
        totalAICalls,
        totalMCPCalls,
      };
    } catch (e) {
      console.error('getProjectOverviewStats error:', e);
      return {
        totalConversations: 0,
        avgUserMessagesPerConversation: 0,
        totalUserMessages: 0,
        totalTriggerInvocations: 0,
        totalSlackMessages: 0,
        totalAICalls: 0,
        totalMCPCalls: 0,
      };
    }
  }

  /**
   * Get conversations per day across all projects or filtered by specific projects.
   */
  async getConversationsPerDayAcrossProjects(
    startTime: number,
    endTime: number,
    projectIds?: string[]
  ): Promise<{ date: string; count: number }[]> {
    try {
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const activityResp = await this.makeRequest(
        this.buildProjectConversationActivityPayload(startTime, endTime, projectIds),
        singleProjectId
      );
      const activitySeries = this.extractSeries(activityResp, 'lastActivity');

      const buckets = new Map<string, number>();
      for (const s of activitySeries) {
        const tsMs = timestampMsFromSeries(s);
        if (!tsMs) continue;
        const d = new Date(tsMs);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }

      return datesRange(startTime, endTime).map((date) => ({
        date,
        count: buckets.get(date) || 0,
      }));
    } catch (e) {
      console.error('getConversationsPerDayAcrossProjects error:', e);
      return datesRange(startTime, endTime).map((date) => ({ date, count: 0 }));
    }
  }

  /**
   * Get stats broken down by project
   */
  private parseStatsByProjectResponse(resp: any): ProjectStatsResult {
    const conversationsSeries = this.extractSeries(resp, 'conversationsByProject');
    const aiCallsSeries = this.extractSeries(resp, 'aiCallsByProject');
    const mcpCallsSeries = this.extractSeries(resp, 'mcpCallsByProject');

    const projectStats = new Map<
      string,
      { totalConversations: number; totalAICalls: number; totalMCPCalls: number }
    >();
    const ensure = (id: string) => {
      const cur = projectStats.get(id);
      if (cur) return cur;
      const init = { totalConversations: 0, totalAICalls: 0, totalMCPCalls: 0 };
      projectStats.set(id, init);
      return init;
    };

    for (const s of conversationsSeries) {
      const id = s.labels?.[SPAN_KEYS.PROJECT_ID];
      if (id) ensure(id).totalConversations = countFromSeries(s);
    }
    for (const s of aiCallsSeries) {
      const id = s.labels?.[SPAN_KEYS.PROJECT_ID];
      if (id) ensure(id).totalAICalls = countFromSeries(s);
    }
    for (const s of mcpCallsSeries) {
      const id = s.labels?.[SPAN_KEYS.PROJECT_ID];
      if (id) ensure(id).totalMCPCalls = countFromSeries(s);
    }

    return Array.from(projectStats.entries())
      .map(([projectId, stats]) => ({ projectId, ...stats }))
      .sort((a, b) => b.totalConversations - a.totalConversations);
  }

  async getStatsByProject(
    startTime: number,
    endTime: number,
    projectIds?: string[]
  ): Promise<ProjectStatsResult> {
    try {
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const payload = this.buildStatsByProjectPayload(startTime, endTime, projectIds);
      const resp = await this.makeRequest(payload, singleProjectId);
      return this.parseStatsByProjectResponse(resp);
    } catch (e) {
      console.error('getStatsByProject error:', e);
      return [];
    }
  }

  async getUsageStatsByProject(
    startTime: number,
    endTime: number,
    projectIds?: string[]
  ): Promise<ProjectStatsResult> {
    try {
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const payload = this.buildStatsByProjectPayload(startTime, endTime, projectIds, [
        GENERATION_TYPE_SCOPE_FILTER,
      ]);
      const resp = await this.makeRequest(payload, singleProjectId);
      return this.parseStatsByProjectResponse(resp);
    } catch (e) {
      console.error('getUsageStatsByProject error:', e);
      return [];
    }
  }

  // ============= Project Overview Payload Builders =============

  private buildProjectOverviewStatsPayload(start: number, end: number, projectIds?: string[]) {
    const tenantItem = { key: SPAN_KEYS.TENANT_ID, op: OPERATORS.EQUALS, value: this.tenantId };
    const projectItem: { key: string; op: string; value: unknown } =
      projectIds && projectIds.length > 0
        ? { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.IN, value: projectIds }
        : { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EXISTS, value: '' };
    const convExistsItem = { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' };
    const base = [tenantItem, projectItem, convExistsItem];

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalConversations',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `count_distinct(${SPAN_KEYS.CONVERSATION_ID})` }],
              filter: { expression: buildFilterExpression(base) },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalUserMessages',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...base,
                  { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' },
                ]),
              },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalTriggerInvocations',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `count_distinct(${SPAN_KEYS.TRIGGER_INVOCATION_ID})` }],
              filter: {
                expression: buildFilterExpression([
                  tenantItem,
                  projectItem,
                  { key: SPAN_KEYS.INVOCATION_TYPE, op: OPERATORS.EQUALS, value: 'trigger' },
                  { key: SPAN_KEYS.TRIGGER_INVOCATION_ID, op: OPERATORS.EXISTS, value: '' },
                ]),
              },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalSlackMessages',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...base,
                  { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' },
                  { key: SPAN_KEYS.INVOCATION_TYPE, op: OPERATORS.EQUALS, value: 'slack' },
                ]),
              },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalAICalls',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...base,
                  {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    op: OPERATORS.IN,
                    value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                  },
                ]),
              },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'totalMCPCalls',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...base,
                  { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
                  { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
                ]),
              },
              groupBy: [],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
    };
  }

  private buildProjectConversationActivityPayload(
    start: number,
    end: number,
    projectIds?: string[]
  ) {
    const projectItem: { key: string; op: string; value: unknown } =
      projectIds && projectIds.length > 0
        ? { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.IN, value: projectIds }
        : { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EXISTS, value: '' };
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.TENANT_ID, op: OPERATORS.EQUALS, value: this.tenantId },
      projectItem,
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
    ];
    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `min(${SPAN_KEYS.TIMESTAMP})` }],
              filter: { expression: buildFilterExpression(filterItems) },
              groupBy: [
                {
                  name: SPAN_KEYS.CONVERSATION_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [
                { key: { name: `min(${SPAN_KEYS.TIMESTAMP})` }, direction: ORDER_DIRECTIONS.DESC },
              ],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
    };
  }

  private buildStatsByProjectPayload(
    start: number,
    end: number,
    projectIds?: string[],
    aiCallsFilterItems?: Array<{ key: string; op: string; value: unknown }>
  ) {
    const tenantItem = { key: SPAN_KEYS.TENANT_ID, op: OPERATORS.EQUALS, value: this.tenantId };
    const projectItem: { key: string; op: string; value: unknown } =
      projectIds && projectIds.length > 0
        ? { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.IN, value: projectIds }
        : { key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EXISTS, value: '' };
    const convExistsItem = { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' };
    const base = [tenantItem, projectItem, convExistsItem];
    const aiCallsBase = aiCallsFilterItems
      ? [tenantItem, projectItem, ...aiCallsFilterItems]
      : base;

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'conversationsByProject',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: `count_distinct(${SPAN_KEYS.CONVERSATION_ID})` }],
              filter: { expression: buildFilterExpression(base) },
              groupBy: [
                {
                  name: SPAN_KEYS.PROJECT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'aiCallsByProject',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...aiCallsBase,
                  {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    op: OPERATORS.IN,
                    value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                  },
                ]),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.PROJECT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'mcpCallsByProject',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...base,
                  { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
                  { key: SPAN_KEYS.AI_TOOL_TYPE, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
                ]),
              },
              groupBy: [
                {
                  name: SPAN_KEYS.PROJECT_ID,
                  fieldDataType: FIELD_DATA_TYPES.STRING,
                  fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
                },
              ],
              order: [],
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              disabled: QUERY_DEFAULTS.DISABLED,
            },
          },
        ],
      },
      variables: {},
    };
  }

  async getUsageCostSummary(
    startTime: number,
    endTime: number,
    groupBy: UsageCostGroupBy,
    projectId?: string
  ): Promise<UsageCostSummaryRow[]> {
    const result = await this.getUsageCostSummaries(startTime, endTime, [groupBy], projectId);
    return result[groupBy];
  }

  async getUsageCostSummaries<G extends UsageCostGroupBy>(
    startTime: number,
    endTime: number,
    groupings: readonly G[],
    projectId?: string
  ): Promise<Record<G, UsageCostSummaryRow[]>> {
    const empty = Object.fromEntries(
      groupings.map((g) => [g, [] as UsageCostSummaryRow[]])
    ) as Record<G, UsageCostSummaryRow[]>;
    if (groupings.length === 0) return empty;

    try {
      const resp = await this.makeRequest(
        this.buildUsageCostMultiGroupPayload(startTime, endTime, groupings, projectId),
        projectId
      );

      const out = { ...empty };
      for (const g of groupings) {
        const series = this.extractSeries(resp, usageCostQueryName(g));
        const groupByKey = usageCostGroupByKey(g);
        out[g] = seriesToUsageSummaryRows(series, groupByKey);
      }
      return out;
    } catch (e) {
      console.error('getUsageCostSummaries error:', e);
      return empty;
    }
  }

  async getUsageEventsList(
    startTime: number,
    endTime: number,
    projectId?: string,
    conversationId?: string,
    limit = 25
  ): Promise<
    Array<{
      spanId: string;
      parentSpanId: string;
      traceId: string;
      timestamp: string;
      generationType: string;
      model: string;
      provider: string;
      agentId: string;
      subAgentId: string;
      conversationId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
      finishReason: string;
      status: string;
    }>
  > {
    try {
      const sf = (name: string, fieldDataType: string, fieldContext: string) => ({
        name,
        fieldDataType,
        fieldContext,
      });
      const str = FIELD_DATA_TYPES.STRING;
      const float64 = FIELD_DATA_TYPES.FLOAT64;
      const spanCtx = FIELD_CONTEXTS.SPAN;
      const attrCtx = FIELD_CONTEXTS.ATTRIBUTE;

      const filterItems: Array<{ key: string; op: string; value: unknown }> = [
        {
          key: SPAN_KEYS.AI_OPERATION_ID,
          op: OPERATORS.IN,
          value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
        },
        {
          key: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
          op: OPERATORS.IN,
          value: [...USAGE_GENERATION_TYPES],
        },
        ...(projectId
          ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }]
          : []),
        ...(conversationId
          ? [{ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EQUALS, value: conversationId }]
          : []),
      ];

      const payload = {
        start: startTime,
        end: endTime,
        requestType: REQUEST_TYPES.RAW,
        ...(projectId && { projectId }),
        compositeQuery: {
          queries: [
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: QUERY_EXPRESSIONS.USAGE_EVENTS,
                signal: SIGNALS.TRACES,
                filter: { expression: buildFilterExpression(filterItems) },
                selectFields: [
                  sf(SPAN_KEYS.SPAN_ID, str, spanCtx),
                  sf(SPAN_KEYS.PARENT_SPAN_ID, str, spanCtx),
                  sf(SPAN_KEYS.TRACE_ID, str, spanCtx),
                  sf(SPAN_KEYS.HAS_ERROR, FIELD_DATA_TYPES.BOOL, spanCtx),
                  sf(SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE, str, attrCtx),
                  sf(SPAN_KEYS.AI_MODEL_ID, str, attrCtx),
                  sf(SPAN_KEYS.AI_MODEL_PROVIDER, str, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER, str, attrCtx),
                  sf(SPAN_KEYS.AGENT_ID, str, attrCtx),
                  sf(SPAN_KEYS.SUB_AGENT_ID, str, attrCtx),
                  sf(SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID, str, attrCtx),
                  sf(SPAN_KEYS.CONVERSATION_ID, str, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, float64, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, float64, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, float64, attrCtx),
                  sf(SPAN_KEYS.AI_RESPONSE_FINISH_REASON, str, attrCtx),
                ],
                order: [{ key: { name: SPAN_KEYS.TIMESTAMP }, direction: ORDER_DIRECTIONS.DESC }],
                limit,
                stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
                disabled: QUERY_DEFAULTS.DISABLED,
              },
            },
          ],
        },
      };

      const resp = await this.makeRequest(payload, projectId);
      const rows =
        resp?.data?.data?.results?.find((r: any) => r?.queryName === QUERY_EXPRESSIONS.USAGE_EVENTS)
          ?.rows ?? [];

      return rows.map((row: any) => {
        const d = row?.data ?? row;
        const ts = row.timestamp || d.timestamp || '';

        const inputTokens =
          Number(d[SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS] || d[SPAN_KEYS.AI_USAGE_PROMPT_TOKENS]) ||
          0;
        const outputTokens =
          Number(
            d[SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS] || d[SPAN_KEYS.AI_USAGE_COMPLETION_TOKENS]
          ) || 0;
        const cost = Number(d[SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD]) || 0;

        return {
          spanId: d.spanID || '',
          parentSpanId: d.parentSpanID || '',
          traceId: d.traceID || '',
          timestamp: ts,
          generationType: d[SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE] || 'unknown',
          model: d[SPAN_KEYS.AI_MODEL_ID] || 'unknown',
          provider: d[SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER] || d[SPAN_KEYS.AI_MODEL_PROVIDER] || '',
          agentId: d[SPAN_KEYS.AGENT_ID] || '',
          subAgentId: d[SPAN_KEYS.SUB_AGENT_ID] || d[SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID] || '',
          conversationId: d[SPAN_KEYS.CONVERSATION_ID] || '',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCostUsd: cost,
          finishReason: d[SPAN_KEYS.AI_RESPONSE_FINISH_REASON] || '',
          status: d.hasError === true || d.hasError === 'true' ? 'failed' : 'succeeded',
        };
      });
    } catch (e) {
      console.error('getUsageEventsList error:', e);
      return [];
    }
  }

  async getUsageCostPerDay(
    startTime: number,
    endTime: number,
    projectId?: string
  ): Promise<Array<{ date: string; cost: number }>> {
    try {
      const filterItems = buildScopedFilterItems('all-usage', projectId);

      const payload = {
        start: startTime,
        end: endTime,
        requestType: REQUEST_TYPES.TIME_SERIES,
        ...(projectId && { projectId }),
        compositeQuery: {
          queries: [
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: 'costPerDay',
                signal: SIGNALS.TRACES,
                aggregations: [{ expression: `sum(${SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD})` }],
                filter: { expression: buildFilterExpression(filterItems) },
                groupBy: [],
                order: [],
                stepInterval: DAY_IN_SECONDS,
                disabled: QUERY_DEFAULTS.DISABLED,
              },
            },
          ],
        },
      };

      const resp = await this.makeRequest(payload, projectId);
      const buckets = extractTimeSeriesBuckets(resp, 'costPerDay');

      return datesRange(startTime, endTime).map((date) => ({
        date,
        cost: buckets.get(date) ?? 0,
      }));
    } catch (e) {
      console.error('getUsageCostPerDay error:', { startTime, endTime, projectId, error: e });
      return datesRange(startTime, endTime).map((date) => ({ date, cost: 0 }));
    }
  }

  private buildUsageCostMultiGroupPayload(
    start: number,
    end: number,
    groupings: readonly UsageCostGroupBy[],
    projectId?: string
  ) {
    const baseItems: Array<{ key: string; op: string; value: unknown }> = [
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
      {
        key: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
        op: OPERATORS.IN,
        value: [...USAGE_GENERATION_TYPES],
      },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
    ];
    const filterExpression = buildFilterExpression(baseItems);

    const queries = groupings.map((g) => ({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: usageCostQueryName(g),
        signal: SIGNALS.TRACES,
        aggregations: USAGE_COST_AGGREGATIONS.map((expression) => ({ expression })),
        filter: { expression: filterExpression },
        groupBy: [
          {
            name: usageCostGroupByKey(g),
            fieldDataType: FIELD_DATA_TYPES.STRING,
            fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
          },
        ],
        order: [],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        disabled: QUERY_DEFAULTS.DISABLED,
      },
    }));

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      ...(projectId && { projectId }),
      compositeQuery: { queries },
    };
  }

  private buildTokenUsagePayload(
    start: number,
    end: number,
    filterItems: Array<{ key: string; op: string; value: unknown }>,
    projectId?: string
  ) {
    const makeTokenQuery = (queryName: string, aggregateKey: string, groupByKey: string) => ({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: queryName,
        signal: SIGNALS.TRACES,
        aggregations: [{ expression: `sum(${aggregateKey})` }],
        filter: { expression: buildFilterExpression(filterItems) },
        groupBy: [
          {
            name: groupByKey,
            fieldDataType: FIELD_DATA_TYPES.STRING,
            fieldContext: FIELD_CONTEXTS.ATTRIBUTE,
          },
        ],
        order: [],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        disabled: QUERY_DEFAULTS.DISABLED,
      },
    });

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          makeTokenQuery(
            'inputTokensByModel',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.AI_MODEL_ID
          ),
          makeTokenQuery(
            'outputTokensByModel',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.AI_MODEL_ID
          ),
          makeTokenQuery(
            'inputTokensByAgent',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.AGENT_ID
          ),
          makeTokenQuery(
            'outputTokensByAgent',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.AGENT_ID
          ),
          makeTokenQuery(
            'inputTokensByProject',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.PROJECT_ID
          ),
          makeTokenQuery(
            'outputTokensByProject',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.PROJECT_ID
          ),
        ],
      },
      variables: {},
      projectId,
    };
  }
}

// ---------- Singleton export

let signozStatsClient: SigNozStatsAPI | null = null;

export function getSigNozStatsClient(tenantId?: string): SigNozStatsAPI {
  const client = (signozStatsClient ??= new SigNozStatsAPI());

  if (tenantId) {
    client.setTenantId(tenantId);
  }

  return client;
}
