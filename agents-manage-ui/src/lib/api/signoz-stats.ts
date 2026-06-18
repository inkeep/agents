import { z } from 'zod';
import {
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  buildFilterExpression,
  buildOrExpression,
  EVAL_GENERATION_TYPES,
  FIELD_CONTEXTS,
  FIELD_DATA_TYPES,
  NON_EVAL_USAGE_GENERATION_TYPES,
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
  totalEstimatedCostUsd?: number;
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
  value: [...NON_EVAL_USAGE_GENERATION_TYPES],
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

const HOUR_IN_SECONDS = 3600;

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
    const key = dateKeyFromMs(ms);
    buckets.set(key, (buckets.get(key) ?? 0) + value);
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
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

// Single source of truth for cost-summary aggregations: the expression list
// sent to SigNoz and the response-column indices used to parse it are both
// derived from this array, so reordering it keeps them in sync. Additions
// must be append-only because downstream dashboards bind to these positions.
export const USAGE_COST_AGGREGATION_ORDER = [
  { key: 'inputTokens', expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS})` },
  { key: 'outputTokens', expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS})` },
  { key: 'cost', expression: `sum(${SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD})` },
  { key: 'eventCount', expression: 'count()' },
  {
    key: 'cacheReadTokens',
    expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS})`,
  },
  {
    key: 'cacheCreationTokens',
    expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS})`,
  },
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

const extractUsageCostSummaryRows = (
  resp: any,
  queryName: string,
  groupByKey: string
): UsageCostSummaryRow[] => {
  const results = resp?.data?.data?.results ?? resp?.data?.results;
  if (!Array.isArray(results)) return [];
  const result = results.find((r: any) => r?.queryName === queryName);
  if (!result) return [];

  const AGG_COUNT = USAGE_COST_AGGREGATION_ORDER.length;
  const groups = new Map<string, number[]>();
  const slots = (key: string): number[] => {
    const existing = groups.get(key);
    if (existing) return existing;
    const fresh = new Array(AGG_COUNT).fill(0);
    groups.set(key, fresh);
    return fresh;
  };

  if (Array.isArray(result.aggregations)) {
    result.aggregations.forEach((agg: any, aggIdx: number) => {
      if (aggIdx >= AGG_COUNT) return;
      for (const s of agg.series ?? []) {
        const labels = Array.isArray(s.labels)
          ? Object.fromEntries(
              (s.labels as any[]).map((l: any) => [l.key?.name ?? '', String(l.value ?? '')])
            )
          : (s.labels ?? {});
        const key = labels[groupByKey] || UNKNOWN_VALUE;
        const raw = s.values?.[0]?.value;
        slots(key)[aggIdx] = Number(raw ?? 0) || 0;
      }
    });
  } else {
    const columns: Array<{ name: string; columnType: string }> = result.columns ?? [];
    const rows: unknown[][] = result.data ?? [];
    const groupColIdx = columns.findIndex((c) => c.columnType === 'group' && c.name === groupByKey);
    const aggColIdxs = columns
      .map((c, i) => (c.columnType === 'aggregation' ? i : -1))
      .filter((i) => i >= 0);
    for (const row of rows) {
      const key =
        groupColIdx >= 0 ? String(row[groupColIdx] ?? '') || UNKNOWN_VALUE : UNKNOWN_VALUE;
      const target = slots(key);
      aggColIdxs.forEach((ci, aggIdx) => {
        if (aggIdx >= AGG_COUNT) return;
        target[aggIdx] = Number(row[ci] ?? 0) || 0;
      });
    }
  }

  return Array.from(groups.entries())
    .map(([groupKey, vals]) => {
      const totalInputTokens = vals[USAGE_COST_AGGREGATION_INDEX.inputTokens] ?? 0;
      const totalOutputTokens = vals[USAGE_COST_AGGREGATION_INDEX.outputTokens] ?? 0;
      return {
        groupKey,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalEstimatedCostUsd: vals[USAGE_COST_AGGREGATION_INDEX.cost] ?? 0,
        eventCount: Math.round(vals[USAGE_COST_AGGREGATION_INDEX.eventCount] ?? 0),
        totalCacheReadTokens: vals[USAGE_COST_AGGREGATION_INDEX.cacheReadTokens] ?? 0,
        totalCacheCreationTokens: vals[USAGE_COST_AGGREGATION_INDEX.cacheCreationTokens] ?? 0,
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
    out.push(dateKeyFromMs(d.getTime()));
  }
  return out;
};

// ---------- Client

const PAGINATION_SPAN_NAMES = [
  'POST /run/api/chat',
  'POST /run/v1/chat/completions',
  'trigger.message_received',
  'execution_handler.execute',
  'slack.stream_agent_response',
  'context.handle_context_resolution',
];

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

  private async makeRequest<T = any>(
    payload: any,
    projectId?: string,
    signal?: AbortSignal
  ): Promise<T> {
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
      maxAttempts: 2,
      label: 'signoz-stats-query',
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Request failed with status ${response.status}: ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  private async makePipelineRequest(
    paginationPayload: any,
    detailPayloadTemplate: any,
    signal?: AbortSignal
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
      maxAttempts: 2,
      label: 'signoz-stats-batch-query',
      signal,
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
    const series = this.extractSeries(resp, QUERY_EXPRESSIONS.AGG_TOOL_CALLS_BY_TYPE);
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

  private async fetchGlobalAggregates(
    startTime: number,
    endTime: number,
    projectId: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean
  ): Promise<Omit<AggregateStats, 'totalConversations'>> {
    const aggBaseItems: FilterItem[] = [
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
    ];
    if (agentId && agentId !== 'all') {
      aggBaseItems.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
    }
    if (projectId) {
      aggBaseItems.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
    }
    if (hasErrors) {
      aggBaseItems.push(
        { key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true },
        { key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: CRITICAL_ERROR_SPAN_NAMES }
      );
    }

    const payload = {
      start: startTime,
      end: endTime,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.AGG_TOOL_CALLS_BY_TYPE,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...aggBaseItems,
                  { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
                ]),
              },
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
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.AGG_AI_CALLS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: {
                expression: buildFilterExpression([
                  ...aggBaseItems,
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
        ],
      },
      variables: {},
      projectId,
    };

    const resp = await this.makeRequest(payload).catch((e) => {
      console.warn('[SigNozStatsAPI] Failed to fetch global aggregates:', e);
      return undefined;
    });

    const zeroSeries = { values: [{ value: '0' }] } as Series;
    const toolAggs = resp
      ? this.extractToolCallAggregates(resp)
      : { totalToolCalls: 0, totalTransfers: 0, totalDelegations: 0 };
    const totalAICalls = resp
      ? countFromSeries(this.extractSeries(resp, QUERY_EXPRESSIONS.AGG_AI_CALLS)[0] || zeroSeries)
      : 0;

    return { ...toolAggs, totalAICalls };
  }

  private async fetchOriginScopedAggregates(
    startTime: number,
    endTime: number,
    projectId: string | undefined,
    agentId: string | undefined,
    origin: string
  ): Promise<Omit<AggregateStats, 'totalConversations'>> {
    const zeroResult = {
      totalToolCalls: 0,
      totalTransfers: 0,
      totalDelegations: 0,
      totalAICalls: 0,
    };

    const convIds = await this.getConversationIdsForOrigin(
      startTime,
      endTime,
      origin,
      projectId,
      agentId
    ).catch((e) => {
      console.warn('[SigNozStatsAPI] Failed to fetch conversation IDs for origin:', e);
      return [];
    });

    if (convIds.length === 0) return zeroResult;

    const aggPayload = this.buildOriginScopedAggregatePayload(
      startTime,
      endTime,
      projectId,
      agentId,
      convIds
    );

    const resp = await this.makeRequest(aggPayload).catch((e) => {
      console.warn('[SigNozStatsAPI] Failed to fetch origin-scoped aggregates:', e);
      return undefined;
    });

    const zeroSeries = { values: [{ value: '0' }] } as Series;
    const toolAggs = resp
      ? this.extractToolCallAggregates(resp)
      : { totalToolCalls: 0, totalTransfers: 0, totalDelegations: 0 };
    const totalAICalls = resp
      ? countFromSeries(this.extractSeries(resp, QUERY_EXPRESSIONS.AGG_AI_CALLS)[0] || zeroSeries)
      : 0;

    return { ...toolAggs, totalAICalls };
  }

  private async getConversationIdsForOrigin(
    startTime: number,
    endTime: number,
    origin: string,
    projectId?: string,
    agentId?: string
  ): Promise<string[]> {
    const filterItems: FilterItem[] = [
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      { key: SPAN_KEYS.INVOCATION_TYPE, op: OPERATORS.EQUALS, value: origin },
      { key: SPAN_KEYS.PARENT_SPAN_ID_V5, op: OPERATORS.EQUALS, value: '' },
    ];
    if (projectId) {
      filterItems.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
    }
    if (agentId && agentId !== 'all') {
      filterItems.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
    }

    const payload = {
      start: startTime,
      end: endTime,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'originConversationIds',
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(filterItems) },
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
          },
        ],
      },
      variables: {},
      projectId,
    };

    const resp = await this.makeRequest(payload);
    const series = this.extractSeries(resp, 'originConversationIds');
    return series
      .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
      .filter((id): id is string => Boolean(id));
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
    hasErrors?: boolean,
    origin?: string,
    signal?: AbortSignal
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
        hasErrors,
        origin,
        signal
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
    conversationIds: string[],
    firstSeen: Map<string, number>
  ): { orderedStats: ConversationStats[] } {
    const rows = this.extractRawRows(resp, 'allSpans');

    const nonEvalTypes = new Set<string>(NON_EVAL_USAGE_GENERATION_TYPES);
    const llmOps = new Set<string>([AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT]);

    type ConvAcc = {
      tenantId: string;
      agentId: string;
      agentName: string;
      totalToolCalls: number;
      toolsUsed: Map<string, { name: string; calls: number; description: string }>;
      totalErrors: number;
      totalEstimatedCostUsd: number;
      firstMsg?: { content: string; timestamp: number };
    };

    const byConv = new Map<string, ConvAcc>();
    const ensure = (id: string): ConvAcc => {
      const cur = byConv.get(id);
      if (cur) return cur;
      const blank: ConvAcc = {
        tenantId: UNKNOWN_VALUE,
        agentId: UNKNOWN_VALUE,
        agentName: UNKNOWN_VALUE,
        totalToolCalls: 0,
        toolsUsed: new Map(),
        totalErrors: 0,
        totalEstimatedCostUsd: 0,
      };
      byConv.set(id, blank);
      return blank;
    };

    for (const row of rows) {
      const convId = row[SPAN_KEYS.CONVERSATION_ID];
      if (!convId || typeof convId !== 'string') continue;
      const acc = ensure(convId);

      const spanName = row[SPAN_KEYS.NAME];
      const agentId = row[SPAN_KEYS.AGENT_ID];
      const agentName = row[SPAN_KEYS.AGENT_NAME];
      const tenantId = row[SPAN_KEYS.TENANT_ID];

      if (agentId && typeof agentId === 'string' && acc.agentId === UNKNOWN_VALUE) {
        acc.agentId = agentId;
      }
      if (agentName && typeof agentName === 'string' && acc.agentName === UNKNOWN_VALUE) {
        acc.agentName = agentName;
      }
      if (tenantId && typeof tenantId === 'string' && acc.tenantId === UNKNOWN_VALUE) {
        acc.tenantId = tenantId;
      }

      if (
        spanName === SPAN_NAMES.AI_TOOL_CALL &&
        row[SPAN_KEYS.AI_TOOL_TYPE] === AI_TOOL_TYPES.MCP
      ) {
        const toolName = row[SPAN_KEYS.AI_TOOL_CALL_NAME];
        if (toolName && typeof toolName === 'string') {
          acc.totalToolCalls += 1;
          const t = acc.toolsUsed.get(toolName) || {
            name: toolName,
            calls: 0,
            description: (row[SPAN_KEYS.MCP_TOOL_DESCRIPTION] as string) || '',
          };
          t.calls += 1;
          acc.toolsUsed.set(toolName, t);
        }
      }

      const hasError = row[SPAN_KEYS.HAS_ERROR];
      if (
        (hasError === true || hasError === 'true') &&
        typeof spanName === 'string' &&
        CRITICAL_ERROR_SPAN_NAMES.includes(spanName)
      ) {
        acc.totalErrors += 1;
      }

      const msgContent = row[SPAN_KEYS.MESSAGE_CONTENT];
      if (msgContent && typeof msgContent === 'string' && !acc.firstMsg) {
        const ts = timestampMsFromValue(row[SPAN_KEYS.TIMESTAMP]);
        const content = msgContent.length > 100 ? `${msgContent.slice(0, 100)}...` : msgContent;
        acc.firstMsg = { content, timestamp: ts };
      }

      const opId = row[SPAN_KEYS.AI_OPERATION_ID];
      const genType = row[SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE];
      if (
        typeof opId === 'string' &&
        llmOps.has(opId) &&
        typeof genType === 'string' &&
        nonEvalTypes.has(genType)
      ) {
        const cost = Number(row[SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD]);
        if (cost > 0) acc.totalEstimatedCostUsd += cost;
      }
    }

    const stats: ConversationStats[] = [];
    for (const id of conversationIds) {
      const acc = byConv.get(id);
      if (!acc) continue;
      stats.push({
        conversationId: id,
        tenantId: acc.tenantId,
        agentId: acc.agentId,
        agentName: acc.agentName,
        totalToolCalls: acc.totalToolCalls,
        toolsUsed: [...acc.toolsUsed.values()],
        totalErrors: acc.totalErrors,
        hasErrors: acc.totalErrors > 0,
        firstUserMessage: acc.firstMsg?.content,
        startTime: acc.firstMsg?.timestamp,
        totalEstimatedCostUsd: acc.totalEstimatedCostUsd || undefined,
      });
    }

    stats.sort((a, b) =>
      byFirstActivity(firstSeen.get(a.conversationId), firstSeen.get(b.conversationId))
    );

    return { orderedStats: stats };
  }

  private extractRawRows(resp: any, queryName: string): Array<Record<string, unknown>> {
    const results = resp?.data?.data?.results ?? resp?.data?.results ?? resp?.results;
    if (!Array.isArray(results)) return [];

    const result = results.find((r: any) => r?.queryName === queryName);
    if (!result) return [];

    if (Array.isArray(result.rows)) {
      return result.rows.map((row: any) => row?.data ?? row);
    }

    const columns: Array<{ name: string }> = result.columns ?? [];
    const data: unknown[][] = result.data ?? [];
    if (columns.length === 0) return [];

    return data.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i].name] = row[i];
      }
      return obj;
    });
  }

  private async getConversationStatsPaginated(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean,
    origin?: string,
    signal?: AbortSignal
  ): Promise<PaginatedConversationStats> {
    const hasSpanFilters = !!(filters?.spanName || filters?.attributes?.length);
    const useServerSidePagination = !hasSpanFilters;

    const makePaginationResult = (total: number) => ({
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
      hasNextPage: pagination.page < Math.ceil(total / pagination.limit),
      hasPreviousPage: pagination.page > 1,
    });

    // Fast path: use server-side pipeline (1 browser round-trip instead of 2).
    // Search queries are now filtered server-side via OR in filter.expression,
    // so only span filters force the slow path.
    if (useServerSidePagination) {
      const paginationPayload = this.buildFilteredConversationIdsPayload(
        startTime,
        endTime,
        filters,
        projectId,
        agentId,
        searchQuery,
        pagination,
        hasErrors,
        origin,
        false
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

      const pipelinePromise = this.makePipelineRequest(
        paginationPayload,
        detailPayloadTemplate,
        signal
      );

      const aggPromise = origin
        ? this.fetchOriginScopedAggregates(startTime, endTime, projectId, agentId, origin)
        : this.fetchGlobalAggregates(startTime, endTime, projectId, agentId, hasErrors);

      const [{ paginationResponse, detailResponse }, aggs] = await Promise.all([
        pipelinePromise,
        aggPromise.catch((e) => {
          console.warn('[SigNozStatsAPI] Failed to fetch aggregates:', e);
          return undefined;
        }),
      ]);

      const zeroSeries = { values: [{ value: '0' }] } as Series;

      const aggregateStats: AggregateStats = aggs
        ? { ...aggs, totalConversations: 0 }
        : {
            totalToolCalls: 0,
            totalTransfers: 0,
            totalDelegations: 0,
            totalAICalls: 0,
            totalConversations: 0,
          };

      const pageSeries = this.extractSeries(
        paginationResponse,
        QUERY_EXPRESSIONS.PAGE_CONVERSATIONS
      );
      const allConversationIds = pageSeries
        .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
        .filter(Boolean) as string[];

      const firstSeen = new Map<string, number>();
      for (const s of pageSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        if (!id) continue;
        firstSeen.set(id, timestampMsFromSeries(s));
      }

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

      const { orderedStats } = this.parseDetailResponse(detailResponse, conversationIds, firstSeen);

      return {
        data: orderedStats,
        pagination: makePaginationResult(total),
        aggregateStats,
      };
    }

    // Slow path: span filters active — requires client-side intersection
    const paginatedPromise = this.getPaginatedConversationIds(
      startTime,
      endTime,
      filters,
      projectId,
      pagination,
      searchQuery,
      agentId,
      hasErrors,
      origin,
      signal
    );

    const aggPromise = origin
      ? this.fetchOriginScopedAggregates(startTime, endTime, projectId, agentId, origin)
      : this.fetchGlobalAggregates(startTime, endTime, projectId, agentId, hasErrors);

    const [{ conversationIds, total, firstSeen: slowPathFirstSeen }, aggs] = await Promise.all([
      paginatedPromise,
      aggPromise.catch((e) => {
        console.warn('[SigNozStatsAPI] Failed to fetch aggregates:', e);
        return undefined;
      }),
    ]);

    const aggregateStats: AggregateStats = aggs
      ? { ...aggs, totalConversations: total }
      : {
          totalToolCalls: 0,
          totalTransfers: 0,
          totalDelegations: 0,
          totalAICalls: 0,
          totalConversations: total,
        };

    if (conversationIds.length === 0) {
      return {
        data: [],
        pagination: makePaginationResult(total),
        aggregateStats,
      };
    }

    const detailPayload = this.buildCombinedPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      conversationIds
    );

    const detailResp = await this.makeRequest(detailPayload, undefined, signal);
    const { orderedStats } = this.parseDetailResponse(
      detailResp,
      conversationIds,
      slowPathFirstSeen
    );

    return {
      data: orderedStats,
      pagination: makePaginationResult(total),
      aggregateStats,
    };
  }

  /**
   * Slow path: used when span filters are active. The span-filter intersection
   * with pageConversations is done server-side via a BUILDER_TRACE_OPERATOR (&&).
   * The result comes back under PAGE_CONVERSATIONS already intersected; this
   * method only needs to sort and paginate in JS.
   */
  private async getPaginatedConversationIds(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    hasErrors?: boolean,
    origin?: string,
    signal?: AbortSignal
  ): Promise<{
    conversationIds: string[];
    total: number;
    firstSeen: Map<string, number>;
  }> {
    const payload = this.buildFilteredConversationIdsPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      searchQuery,
      pagination,
      hasErrors,
      origin,
      false
    );

    const resp = await this.makeRequest(payload, undefined, signal);
    const zeroSeries = { values: [{ value: '0' }] } as Series;

    const activitySeries = this.extractSeries(resp, QUERY_EXPRESSIONS.PAGE_CONVERSATIONS);
    const activityMap = new Map<string, number>();
    for (const s of activitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      activityMap.set(id, timestampMsFromSeries(s));
    }

    const allConversationIds = Array.from(activityMap.keys());

    const totalSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS);
    const total = countFromSeries(totalSeries[0] || zeroSeries);
    const pageStart = (pagination.page - 1) * pagination.limit;
    const paginatedIds = allConversationIds.slice(pageStart, pageStart + pagination.limit);

    return {
      conversationIds: paginatedIds,
      total,
      firstSeen: activityMap,
    };
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
    const modelSeries = this.extractSeries(resp, 'tokensByModel');
    const agentSeries = this.extractSeries(resp, 'tokensByAgent');
    const projectSeries = this.extractSeries(resp, 'tokensByProject');

    const aggregate = (
      series: Series[],
      labelKey: string
    ): Map<string, { inputTokens: number; outputTokens: number }> => {
      const stats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of series) {
        const key = s.labels?.[labelKey] || UNKNOWN_VALUE;
        const existing = stats.get(key) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += Number(s.values?.[0]?.value ?? 0) || 0;
        existing.outputTokens += Number(s.values?.[1]?.value ?? 0) || 0;
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

    const byModel = toSorted(aggregate(modelSeries, SPAN_KEYS.AI_MODEL_ID), (modelId, s) => ({
      modelId,
      ...s,
      totalTokens: s.inputTokens + s.outputTokens,
    }));
    const byAgent = toSorted(aggregate(agentSeries, SPAN_KEYS.AGENT_ID), (agentId, s) => ({
      agentId,
      ...s,
      totalTokens: s.inputTokens + s.outputTokens,
    }));
    const byProject = toSorted(aggregate(projectSeries, SPAN_KEYS.PROJECT_ID), (projectId, s) => ({
      projectId,
      ...s,
      totalTokens: s.inputTokens + s.outputTokens,
    }));

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
        const server = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME] || UNKNOWN_VALUE;
        const serverId = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        const errorKey = `${toolName}::${server}::${serverId}`;
        errorMap.set(errorKey, (errorMap.get(errorKey) || 0) + count);
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
        row.errorCount = errorMap.get(key) || 0;
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

  private async fetchAllConversationActivitySeries(
    buildPayload: (offset: number) => any,
    projectId: string | undefined,
    signal?: AbortSignal
  ): Promise<Series[]> {
    const pageSize = QUERY_DEFAULTS.CONVERSATION_ACTIVITY_PAGE_SIZE;
    const allSeries: Series[] = [];
    let offset = 0;

    do {
      const resp = await this.makeRequest(buildPayload(offset), projectId, signal);
      const page = this.extractSeries(resp, QUERY_EXPRESSIONS.LAST_ACTIVITY);
      allSeries.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    } while (offset < pageSize * QUERY_DEFAULTS.CONVERSATION_ACTIVITY_MAX_PAGES);

    return allSeries;
  }

  async getConversationsPerDay(
    startTime: number,
    endTime: number,
    agentId?: string,
    projectId?: string,
    origin?: string,
    signal?: AbortSignal
  ) {
    try {
      const activitySeries = await this.fetchAllConversationActivitySeries(
        (offset) =>
          this.buildConversationActivityPayload(
            startTime,
            endTime,
            agentId,
            projectId,
            origin,
            offset
          ),
        undefined,
        signal
      );

      const buckets = new Map<string, number>();
      for (const s of activitySeries) {
        const tsMs = timestampMsFromSeries(s);
        if (!tsMs) continue;
        const key = dateKeyFromMs(tsMs);
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
    projectId?: string,
    origin?: string,
    offset?: number
  ) {
    const filterItems: Array<{ key: string; op: string; value: unknown }> = [
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ...(agentId && agentId !== 'all'
        ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }]
        : []),
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
      ...(origin ? [{ key: SPAN_KEYS.INVOCATION_TYPE, op: OPERATORS.EQUALS, value: origin }] : []),
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
              limit: QUERY_DEFAULTS.CONVERSATION_ACTIVITY_PAGE_SIZE,
              ...(offset ? { offset } : {}),
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
    searchQuery: string | undefined,
    pagination?: { page: number; limit: number },
    hasErrors?: boolean,
    origin?: string,
    includeAggregates?: boolean
  ) {
    const sanitizedSearch = searchQuery?.trim() || undefined;

    const buildBaseFilterItems = (
      opts: { withOrigin?: boolean } = {}
    ): Array<{ key: string; op: string; value: unknown }> => {
      const items: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ];
      if (agentId && agentId !== 'all') {
        items.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
      }
      if (projectId) {
        items.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
      }
      if (opts.withOrigin && origin) {
        items.push({ key: SPAN_KEYS.INVOCATION_TYPE, op: OPERATORS.EQUALS, value: origin });
      }
      if (hasErrors) {
        items.push(
          { key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true },
          { key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: CRITICAL_ERROR_SPAN_NAMES }
        );
      } else {
        items.push({ key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: PAGINATION_SPAN_NAMES });
      }
      return items;
    };

    const buildBaseFilterExpr = (opts: { withOrigin?: boolean } = {}): string => {
      const baseExpr = buildFilterExpression(buildBaseFilterItems(opts));
      if (!sanitizedSearch) return baseExpr;

      const searchPattern = `%${sanitizedSearch}%`;
      const orClause = buildOrExpression([
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.LIKE, value: searchPattern },
        { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.LIKE, value: searchPattern },
        { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.LIKE, value: searchPattern },
      ]);
      return `${baseExpr} AND ${orClause}`;
    };

    const hasSpanFilters = !!(filters?.spanName || filters?.attributes?.length);
    const paginationWindowLimit = pagination
      ? pagination.page * pagination.limit
      : QUERY_DEFAULTS.LIMIT_UNLIMITED;

    const queries: any[] = [];

    if (hasSpanFilters) {
      const filteredConvItems: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ];

      if (filters?.spanName) {
        filteredConvItems.push({
          key: SPAN_KEYS.NAME,
          op: OPERATORS.EQUALS,
          value: filters.spanName,
        });
      }

      for (const attr of filters?.attributes ?? []) {
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

      queries.push(
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS_BASE,
            signal: SIGNALS.TRACES,
            aggregations: [{ expression: `max(${SPAN_KEYS.TIMESTAMP})` }],
            filter: { expression: buildBaseFilterExpr({ withOrigin: true }) },
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
        },
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: QUERY_EXPRESSIONS.SPAN_FILTER_BASE,
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
        },
        {
          type: QUERY_TYPES.BUILDER_TRACE_OPERATOR,
          spec: {
            name: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
            expression: `${QUERY_EXPRESSIONS.PAGE_CONVERSATIONS_BASE} && ${QUERY_EXPRESSIONS.SPAN_FILTER_BASE}`,
            aggregations: [{ expression: `max(${SPAN_KEYS.TIMESTAMP})` }],
            filter: { expression: '' },
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
          type: QUERY_TYPES.BUILDER_TRACE_OPERATOR,
          spec: {
            name: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
            expression: `${QUERY_EXPRESSIONS.PAGE_CONVERSATIONS_BASE} && ${QUERY_EXPRESSIONS.SPAN_FILTER_BASE}`,
            aggregations: [{ expression: `count_distinct(${SPAN_KEYS.CONVERSATION_ID})` }],
            filter: { expression: '' },
            groupBy: [],
            order: [],
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            limit: 1,
            disabled: QUERY_DEFAULTS.DISABLED,
          },
        }
      );
    } else {
      queries.push(
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
            signal: SIGNALS.TRACES,
            aggregations: [{ expression: `max(${SPAN_KEYS.TIMESTAMP})` }],
            filter: {
              expression: buildBaseFilterExpr({ withOrigin: true }),
            },
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
            filter: {
              expression: buildBaseFilterExpr({ withOrigin: true }),
            },
            groupBy: [],
            order: [],
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            limit: 1,
            disabled: QUERY_DEFAULTS.DISABLED,
          },
        }
      );
    }

    if (includeAggregates) {
      const aggBaseItems: Array<{ key: string; op: string; value: unknown }> = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
      ];
      if (agentId && agentId !== 'all') {
        aggBaseItems.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
      }
      if (projectId) {
        aggBaseItems.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
      }
      if (hasErrors) {
        aggBaseItems.push(
          { key: SPAN_KEYS.HAS_ERROR, op: OPERATORS.EQUALS, value: true },
          { key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: CRITICAL_ERROR_SPAN_NAMES }
        );
      }

      queries.push(
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: QUERY_EXPRESSIONS.AGG_TOOL_CALLS_BY_TYPE,
            signal: SIGNALS.TRACES,
            aggregations: [{ expression: 'count()' }],
            filter: {
              expression: buildFilterExpression([
                ...aggBaseItems,
                { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
              ]),
            },
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
        },
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: QUERY_EXPRESSIONS.AGG_AI_CALLS,
            signal: SIGNALS.TRACES,
            aggregations: [{ expression: 'count()' }],
            filter: {
              expression: buildFilterExpression([
                ...aggBaseItems,
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
        }
      );
    }

    return {
      start,
      end,
      requestType: REQUEST_TYPES.SCALAR,
      compositeQuery: { queries },
      variables: {},
      projectId,
    };
  }

  private buildOriginScopedAggregatePayload(
    start: number,
    end: number,
    projectId: string | undefined,
    agentId: string | undefined,
    conversationIds: string[]
  ) {
    const scopeItems: FilterItem[] = [
      { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.IN, value: conversationIds },
    ];
    if (projectId) {
      scopeItems.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
    }
    if (agentId && agentId !== 'all') {
      scopeItems.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
    }

    const toolItems: FilterItem[] = [
      ...scopeItems,
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
    ];

    const aiItems: FilterItem[] = [
      ...scopeItems,
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
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
              name: QUERY_EXPRESSIONS.AGG_TOOL_CALLS_BY_TYPE,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(toolItems) },
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
          },
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: QUERY_EXPRESSIONS.AGG_AI_CALLS,
              signal: SIGNALS.TRACES,
              aggregations: [{ expression: 'count()' }],
              filter: { expression: buildFilterExpression(aiItems) },
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
    const scopeItems: FilterItem[] = [];
    if (projectId)
      scopeItems.push({ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId });
    if (agentId) scopeItems.push({ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId });
    if (conversationIds && conversationIds.length > 0) {
      scopeItems.push({ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.IN, value: conversationIds });
    } else {
      scopeItems.push({ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' });
    }

    const relevantSpanFilter = buildOrExpression([
      { key: SPAN_KEYS.NAME, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
      { key: SPAN_KEYS.NAME, op: OPERATORS.IN, value: CRITICAL_ERROR_SPAN_NAMES },
      { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' },
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
    ]);

    const filterExpr = `${buildFilterExpression(scopeItems)} AND ${relevantSpanFilter}`;

    const attrCtx = FIELD_CONTEXTS.ATTRIBUTE;
    const spanCtx = FIELD_CONTEXTS.SPAN;
    const str = FIELD_DATA_TYPES.STRING;
    const bool = FIELD_DATA_TYPES.BOOL;

    return {
      start,
      end,
      requestType: REQUEST_TYPES.RAW,
      compositeQuery: {
        queries: [
          {
            type: QUERY_TYPES.BUILDER_QUERY,
            spec: {
              name: 'allSpans',
              signal: SIGNALS.TRACES,
              filter: { expression: filterExpr },
              selectFields: [
                { name: SPAN_KEYS.CONVERSATION_ID, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.NAME, fieldDataType: str, fieldContext: spanCtx },
                { name: SPAN_KEYS.TENANT_ID, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.AGENT_ID, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.AGENT_NAME, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.AI_TOOL_CALL_NAME, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.AI_TOOL_TYPE, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.MCP_TOOL_DESCRIPTION, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.HAS_ERROR, fieldDataType: bool, fieldContext: spanCtx },
                { name: SPAN_KEYS.MESSAGE_CONTENT, fieldDataType: str, fieldContext: attrCtx },
                { name: SPAN_KEYS.TIMESTAMP, fieldDataType: str, fieldContext: spanCtx },
                { name: SPAN_KEYS.AI_OPERATION_ID, fieldDataType: str, fieldContext: attrCtx },
                {
                  name: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
                  fieldDataType: str,
                  fieldContext: attrCtx,
                },
                {
                  name: SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD,
                  fieldDataType: FIELD_DATA_TYPES.FLOAT64,
                  fieldContext: attrCtx,
                },
              ],
              aggregations: [],
              groupBy: [],
              order: [{ key: { name: SPAN_KEYS.TIMESTAMP }, direction: ORDER_DIRECTIONS.ASC }],
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
      const activitySeries = await this.fetchAllConversationActivitySeries(
        (offset) =>
          this.buildProjectConversationActivityPayload(startTime, endTime, projectIds, offset),
        singleProjectId
      );

      const buckets = new Map<string, number>();
      for (const s of activitySeries) {
        const tsMs = timestampMsFromSeries(s);
        if (!tsMs) continue;
        const key = dateKeyFromMs(tsMs);
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
    projectIds?: string[],
    offset?: number
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
              limit: QUERY_DEFAULTS.CONVERSATION_ACTIVITY_PAGE_SIZE,
              ...(offset ? { offset } : {}),
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
    projectId?: string,
    agentId?: string
  ): Promise<Record<G, UsageCostSummaryRow[]>> {
    const empty = Object.fromEntries(
      groupings.map((g) => [g, [] as UsageCostSummaryRow[]])
    ) as Record<G, UsageCostSummaryRow[]>;
    if (groupings.length === 0) return empty;

    try {
      const resp = await this.makeRequest(
        this.buildUsageCostMultiGroupPayload(startTime, endTime, groupings, projectId, agentId),
        projectId
      );

      const out = { ...empty };
      for (const g of groupings) {
        out[g] = extractUsageCostSummaryRows(resp, usageCostQueryName(g), usageCostGroupByKey(g));
      }
      return out;
    } catch (e) {
      console.error('getUsageCostSummaries error:', e);
      throw e;
    }
  }

  async getUsageEventsList(
    startTime: number,
    endTime: number,
    {
      projectId,
      conversationId,
      agentId,
      limit = 25,
    }: {
      projectId?: string;
      conversationId?: string;
      agentId?: string;
      limit?: number;
    } = {}
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
      subAgentName: string;
      conversationId: string;
      projectId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
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
          value: [...NON_EVAL_USAGE_GENERATION_TYPES],
        },
        ...(projectId
          ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }]
          : []),
        ...(conversationId
          ? [{ key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EQUALS, value: conversationId }]
          : []),
        ...(agentId ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }] : []),
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
                  sf(SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME, str, attrCtx),
                  sf(SPAN_KEYS.CONVERSATION_ID, str, attrCtx),
                  sf(SPAN_KEYS.PROJECT_ID, str, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, float64, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, float64, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, float64, attrCtx),
                  sf(SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS, float64, attrCtx),
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
        const cacheReadTokens = Number(d[SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]) || 0;
        const cacheCreationTokens =
          Number(d[SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]) || 0;
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
          subAgentId: d[SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID] || d[SPAN_KEYS.SUB_AGENT_ID] || '',
          subAgentName: d[SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME] || '',
          conversationId: d[SPAN_KEYS.CONVERSATION_ID] || '',
          projectId: d[SPAN_KEYS.PROJECT_ID] || '',
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          estimatedCostUsd: cost,
          finishReason: d[SPAN_KEYS.AI_RESPONSE_FINISH_REASON] || '',
          status: d.hasError === true || d.hasError === 'true' ? 'failed' : 'succeeded',
        };
      });
    } catch (e) {
      console.error('getUsageEventsList error:', e);
      throw e;
    }
  }

  async getUsageCounts(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string
  ): Promise<{ messageCount: number; conversationCount: number }> {
    try {
      const scopeItems: FilterItem[] = [
        { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EXISTS, value: '' },
        ...(projectId
          ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }]
          : []),
        ...(agentId ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }] : []),
      ];
      const queryDefaults = {
        groupBy: [],
        order: [],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        disabled: QUERY_DEFAULTS.DISABLED,
      };
      const payload = {
        start: startTime,
        end: endTime,
        requestType: REQUEST_TYPES.SCALAR,
        ...(projectId && { projectId }),
        compositeQuery: {
          queries: [
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: 'totalUserMessages',
                signal: SIGNALS.TRACES,
                aggregations: [{ expression: 'count()' }],
                filter: {
                  expression: buildFilterExpression([
                    ...scopeItems,
                    { key: SPAN_KEYS.MESSAGE_CONTENT, op: OPERATORS.EXISTS, value: '' },
                  ]),
                },
                ...queryDefaults,
              },
            },
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: 'totalConversations',
                signal: SIGNALS.TRACES,
                aggregations: [{ expression: `count_distinct(${SPAN_KEYS.CONVERSATION_ID})` }],
                filter: { expression: buildFilterExpression(scopeItems) },
                ...queryDefaults,
              },
            },
          ],
        },
      };
      const resp = await this.makeRequest(payload, projectId);
      const zero = { values: [{ value: '0' }] } as Series;
      return {
        messageCount: countFromSeries(this.extractSeries(resp, 'totalUserMessages')[0] || zero),
        conversationCount: countFromSeries(
          this.extractSeries(resp, 'totalConversations')[0] || zero
        ),
      };
    } catch (e) {
      console.error('getUsageCounts error:', e);
      return { messageCount: 0, conversationCount: 0 };
    }
  }

  async getEvalUsageSummary(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string
  ): Promise<{
    totalCost: number;
    totalTokens: number;
    evalCallCount: number;
    conversationsEvaluated: number;
  }> {
    const empty = { totalCost: 0, totalTokens: 0, evalCallCount: 0, conversationsEvaluated: 0 };
    try {
      const filterExpression = buildFilterExpression([
        AI_OPERATION_FILTER,
        {
          key: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
          op: OPERATORS.IN,
          value: [...EVAL_GENERATION_TYPES],
        },
        ...(projectId
          ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }]
          : []),
        ...(agentId ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }] : []),
      ]);
      const queryName = 'evalUsageByConversation';
      const payload = {
        start: startTime,
        end: endTime,
        requestType: REQUEST_TYPES.SCALAR,
        ...(projectId && { projectId }),
        compositeQuery: {
          queries: [
            {
              type: QUERY_TYPES.BUILDER_QUERY,
              spec: {
                name: queryName,
                signal: SIGNALS.TRACES,
                aggregations: USAGE_COST_AGGREGATIONS.map((expression) => ({ expression })),
                filter: { expression: filterExpression },
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
            },
          ],
        },
      };
      const resp = await this.makeRequest(payload, projectId);
      const rows = extractUsageCostSummaryRows(resp, queryName, SPAN_KEYS.CONVERSATION_ID).filter(
        (r) => r.groupKey && r.groupKey !== UNKNOWN_VALUE
      );
      return rows.reduce(
        (acc, r) => ({
          totalCost: acc.totalCost + r.totalEstimatedCostUsd,
          totalTokens: acc.totalTokens + r.totalTokens,
          evalCallCount: acc.evalCallCount + r.eventCount,
          conversationsEvaluated: acc.conversationsEvaluated + 1,
        }),
        empty
      );
    } catch (e) {
      console.error('getEvalUsageSummary error:', e);
      throw e;
    }
  }

  async getUsageCostPerDay(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string
  ): Promise<Array<{ date: string; cost: number }>> {
    try {
      const baseFilterItems = buildScopedFilterItems('all-usage', projectId);
      const filterItems = agentId
        ? [...baseFilterItems, { key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }]
        : baseFilterItems;

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
                stepInterval: HOUR_IN_SECONDS,
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
      throw e;
    }
  }

  private buildUsageCostMultiGroupPayload(
    start: number,
    end: number,
    groupings: readonly UsageCostGroupBy[],
    projectId?: string,
    agentId?: string
  ) {
    const sharedItems: Array<{ key: string; op: string; value: unknown }> = [
      {
        key: SPAN_KEYS.AI_OPERATION_ID,
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
      ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
      ...(agentId ? [{ key: SPAN_KEYS.AGENT_ID, op: OPERATORS.EQUALS, value: agentId }] : []),
    ];

    // The "generation_type" breakdown keeps eval rows visible
    const filterExpressionFor = (g: UsageCostGroupBy) =>
      buildFilterExpression([
        ...sharedItems,
        {
          key: SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
          op: OPERATORS.IN,
          value:
            g === 'generation_type'
              ? [...USAGE_GENERATION_TYPES]
              : [...NON_EVAL_USAGE_GENERATION_TYPES],
        },
      ]);

    const queries = groupings.map((g) => ({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: usageCostQueryName(g),
        signal: SIGNALS.TRACES,
        aggregations: USAGE_COST_AGGREGATIONS.map((expression) => ({ expression })),
        filter: { expression: filterExpressionFor(g) },
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
    const makeTokenQuery = (queryName: string, groupByKey: string) => ({
      type: QUERY_TYPES.BUILDER_QUERY,
      spec: {
        name: queryName,
        signal: SIGNALS.TRACES,
        aggregations: [
          { expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS})` },
          { expression: `sum(${SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS})` },
        ],
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
          makeTokenQuery('tokensByModel', SPAN_KEYS.AI_MODEL_ID),
          makeTokenQuery('tokensByAgent', SPAN_KEYS.AGENT_ID),
          makeTokenQuery('tokensByProject', SPAN_KEYS.PROJECT_ID),
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
