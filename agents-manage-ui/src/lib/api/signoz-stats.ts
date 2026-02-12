import axios from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import {
  AGGREGATE_OPERATORS,
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  DATA_SOURCES,
  DATA_TYPES,
  OPERATORS,
  ORDER_DIRECTIONS,
  PANEL_TYPES,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  QUERY_FIELD_CONFIGS,
  QUERY_TYPES,
  REDUCE_OPERATIONS,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
} from '@/constants/signoz';

// ---------- String Constants for Type Safety

export interface ConversationStats {
  conversationId: string;
  tenantId: string;
  agentId: string;
  agentName: string;
  totalToolCalls: number;
  toolsUsed: Array<{ name: string; calls: number; description: string }>;
  transfers: Array<{ from: string; to: string; count: number }>;
  totalTransfers: number;
  delegations: Array<{ from: string; to: string; count: number }>;
  totalDelegations: number;
  totalAICalls: number;
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

// ---------- Small utilities

const nsToMs = (ns: number) => Math.floor(ns / 1_000_000);

const asNumberIfNumeric = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

// Type-safe filter value schema and parser
const FilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

type FilterValue = z.infer<typeof FilterValueSchema>;

type DataType = (typeof DATA_TYPES)[keyof typeof DATA_TYPES];

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

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

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

    // Call Next.js route which validates and forwards to agents-api
    const response = await axios.post<T>(`/api/signoz?tenantId=${this.tenantId}`, requestPayload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
    return response.data;
  }

  // --- Helpers to read SigNoz response
  private extractSeries(resp: any, name: string): Series[] {
    return resp?.data?.result?.find((r: any) => r?.queryName === name)?.series ?? [];
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
    includeAggregates?: boolean
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
        includeAggregates
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

  private async getConversationStatsPaginated(
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    pagination: { page: number; limit: number },
    searchQuery: string | undefined,
    agentId: string | undefined,
    includeAggregates?: boolean
  ): Promise<PaginatedConversationStats> {
    // Step 1: Get total count, paginated conversation IDs, and (optionally) aggregate stats
    const { conversationIds, total, aggregateStats } = await this.getPaginatedConversationIds(
      startTime,
      endTime,
      filters,
      projectId,
      pagination,
      searchQuery,
      agentId,
      includeAggregates
    );

    if (conversationIds.length === 0) {
      return {
        data: [],
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasNextPage: pagination.page < Math.ceil(total / pagination.limit),
          hasPreviousPage: pagination.page > 1,
        },
        aggregateStats,
      };
    }

    // Step 2: Fetch detailed stats only for the paginated conversation IDs
    const payload = this.buildCombinedPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      conversationIds
    );
    const resp = await this.makeRequest(payload);

    const toolsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TOOLS);
    const transfersSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TRANSFERS);
    const delegationsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.DELEGATIONS);
    const aiCallsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.AI_CALLS);
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
      firstSeen.set(id, numberFromSeries(s));
    }

    // first user message per conversation
    const firstMsgByConv = new Map<string, { content: string; timestamp: number }>();
    const msgsByConv = new Map<string, Array<{ t: number; c: string }>>();
    for (const s of userMessagesSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      const content = s.labels?.[SPAN_KEYS.MESSAGE_CONTENT];
      const t = numberFromSeries(s);
      if (!id || !content) continue;
      (msgsByConv.get(id) ?? msgsByConv.set(id, []).get(id))?.push({
        t,
        c: content,
      });
    }
    for (const [id, arr] of msgsByConv) {
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0];
      if (first) {
        const content = first.c.length > 100 ? `${first.c.slice(0, 100)}...` : first.c;
        firstMsgByConv.set(id, { content, timestamp: nsToMs(first.t) });
      }
    }

    // build stats
    const stats = this.toConversationStats(
      toolsSeries,
      transfersSeries,
      delegationsSeries,
      aiCallsSeries,
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

    return {
      data: orderedStats,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
        hasNextPage: pagination.page < Math.ceil(total / pagination.limit),
        hasPreviousPage: pagination.page > 1,
      },
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
    includeAggregates?: boolean
  ): Promise<{ conversationIds: string[]; total: number; aggregateStats?: AggregateStats }> {
    const hasSearchQuery = !!searchQuery?.trim();
    const hasSpanFilters = !!(filters?.spanName || filters?.attributes?.length);
    const useServerSidePagination = !hasSearchQuery && !hasSpanFilters;

    const consolidatedPayload = this.buildFilteredConversationIdsPayload(
      startTime,
      endTime,
      filters,
      projectId,
      agentId,
      hasSearchQuery,
      useServerSidePagination ? pagination : undefined,
      includeAggregates
    );

    const consolidatedResp = await this.makeRequest(consolidatedPayload);

    const extractAggregates = (): AggregateStats | undefined => {
      if (!includeAggregates) return undefined;
      const zeroSeries = { values: [{ value: '0' }] } as Series;
      return {
        totalToolCalls: countFromSeries(
          this.extractSeries(consolidatedResp, 'aggToolCalls')[0] || zeroSeries
        ),
        totalTransfers: countFromSeries(
          this.extractSeries(consolidatedResp, 'aggTransfers')[0] || zeroSeries
        ),
        totalDelegations: countFromSeries(
          this.extractSeries(consolidatedResp, 'aggDelegations')[0] || zeroSeries
        ),
        totalAICalls: countFromSeries(
          this.extractSeries(consolidatedResp, 'aggAICalls')[0] || zeroSeries
        ),
        totalConversations: 0,
      };
    };

    // Fast path: server-side pagination (no search, no span filters)
    if (useServerSidePagination) {
      const pageSeries = this.extractSeries(consolidatedResp, QUERY_EXPRESSIONS.PAGE_CONVERSATIONS);
      const conversationIds = pageSeries
        .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
        .filter(Boolean) as string[];

      const totalSeries = this.extractSeries(
        consolidatedResp,
        QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS
      );
      const total = countFromSeries(totalSeries[0] || { values: [{ value: '0' }] });

      const aggregateStats = extractAggregates();
      if (aggregateStats) aggregateStats.totalConversations = total;

      return { conversationIds, total, aggregateStats };
    }

    // Slow path: client-side filtering needed for search or span filters
    const activitySeries = this.extractSeries(
      consolidatedResp,
      QUERY_EXPRESSIONS.PAGE_CONVERSATIONS
    );
    const activityMap = new Map<string, number>();
    for (const s of activitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      activityMap.set(id, numberFromSeries(s));
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
    if (aggregateStats) aggregateStats.totalConversations = total;

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
        this.buildModelBreakdownPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'modelCalls');
      const totals = new Map<string, number>();

      for (const s of series) {
        const mId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const gId = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        if (!count) continue;
        if (agentId && agentId !== 'all' && gId !== agentId) continue;
        totals.set(mId, (totals.get(mId) || 0) + count);
      }

      return [...totals]
        .map(([modelId, totalCalls]) => ({ modelId, totalCalls }))
        .sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getAICallsByModel error:', e);
      return [];
    }
  }

  async getTokenUsageStats(
    startTime: number,
    endTime: number,
    projectId?: string
  ): Promise<{
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
  }> {
    try {
      const resp = await this.makeRequest(
        this.buildTokenUsagePayload(startTime, endTime, projectId)
      );

      const inputByModelSeries = this.extractSeries(resp, 'inputTokensByModel');
      const outputByModelSeries = this.extractSeries(resp, 'outputTokensByModel');
      const inputByAgentSeries = this.extractSeries(resp, 'inputTokensByAgent');
      const outputByAgentSeries = this.extractSeries(resp, 'outputTokensByAgent');
      const inputByProjectSeries = this.extractSeries(resp, 'inputTokensByProject');
      const outputByProjectSeries = this.extractSeries(resp, 'outputTokensByProject');

      // Aggregate by model
      const modelStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of inputByModelSeries) {
        const modelId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = modelStats.get(modelId) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += tokens;
        modelStats.set(modelId, existing);
      }
      for (const s of outputByModelSeries) {
        const modelId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = modelStats.get(modelId) || { inputTokens: 0, outputTokens: 0 };
        existing.outputTokens += tokens;
        modelStats.set(modelId, existing);
      }

      // Aggregate by agent
      const agentStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of inputByAgentSeries) {
        const agentId = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = agentStats.get(agentId) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += tokens;
        agentStats.set(agentId, existing);
      }
      for (const s of outputByAgentSeries) {
        const agentId = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = agentStats.get(agentId) || { inputTokens: 0, outputTokens: 0 };
        existing.outputTokens += tokens;
        agentStats.set(agentId, existing);
      }

      // Aggregate by project
      const projectStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of inputByProjectSeries) {
        const pId = s.labels?.[SPAN_KEYS.PROJECT_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = projectStats.get(pId) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += tokens;
        projectStats.set(pId, existing);
      }
      for (const s of outputByProjectSeries) {
        const pId = s.labels?.[SPAN_KEYS.PROJECT_ID] || UNKNOWN_VALUE;
        const tokens = numberFromSeries(s);
        const existing = projectStats.get(pId) || { inputTokens: 0, outputTokens: 0 };
        existing.outputTokens += tokens;
        projectStats.set(pId, existing);
      }

      // Convert to arrays and calculate totals
      const byModel = [...modelStats.entries()]
        .map(([modelId, stats]) => ({
          modelId,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          totalTokens: stats.inputTokens + stats.outputTokens,
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);

      const byAgent = [...agentStats.entries()]
        .map(([agentId, stats]) => ({
          agentId,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          totalTokens: stats.inputTokens + stats.outputTokens,
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);

      const byProject = [...projectStats.entries()]
        .map(([pId, stats]) => ({
          projectId: pId,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          totalTokens: stats.inputTokens + stats.outputTokens,
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);

      const totals = {
        inputTokens: byModel.reduce((sum, m) => sum + m.inputTokens, 0),
        outputTokens: byModel.reduce((sum, m) => sum + m.outputTokens, 0),
        totalTokens: byModel.reduce((sum, m) => sum + m.totalTokens, 0),
      };

      return { byModel, byAgent, byProject, totals };
    } catch (e) {
      console.error('getTokenUsageStats error:', e);
      return {
        byModel: [],
        byAgent: [],
        byProject: [],
        totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
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

  async getToolCallsByServer(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildToolServerBreakdownPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'serverCalls');
      const errorSeries = this.extractSeries(resp, 'serverErrors');

      const errorMap = new Map<string, number>();
      for (const s of errorSeries) {
        const serverName = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        errorMap.set(serverName, (errorMap.get(serverName) || 0) + count);
      }

      const totals = new Map<string, { totalCalls: number; errorCount: number }>();
      for (const s of series) {
        const serverName = s.labels?.[SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        if (!count) continue;
        const existing = totals.get(serverName) || { totalCalls: 0, errorCount: 0 };
        existing.totalCalls += count;
        existing.errorCount = errorMap.get(serverName) || 0;
        totals.set(serverName, existing);
      }

      return [...totals]
        .map(([serverName, data]) => ({
          serverName,
          totalCalls: data.totalCalls,
          errorCount: data.errorCount,
          errorRate: data.totalCalls > 0 ? (data.errorCount / data.totalCalls) * 100 : 0,
        }))
        .sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getToolCallsByServer error:', e);
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
        const tsMs = nsToMs(numberFromSeries(s));
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
      const filterItems: any[] = [
        {
          key: {
            key: SPAN_KEYS.NAME,
            ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
          },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
      if (agentId && agentId !== 'all') {
        filterItems.push({
          key: { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EQUALS,
          value: agentId,
        });
      }
      if (projectId) {
        filterItems.push({
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }

      const payload = {
        start: startTime,
        end: endTime,
        step: QUERY_DEFAULTS.STEP,
        variables: {},
        compositeQuery: {
          queryType: QUERY_TYPES.BUILDER,
          panelType: PANEL_TYPES.LIST,
          builderQueries: {
            spanNames: {
              dataSource: DATA_SOURCES.TRACES,
              queryName: QUERY_EXPRESSIONS.SPAN_NAMES,
              aggregateOperator: AGGREGATE_OPERATORS.NOOP,
              aggregateAttribute: {},
              filters: { op: OPERATORS.AND, items: filterItems },
              selectColumns: [
                {
                  key: SPAN_KEYS.NAME,
                  ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                },
              ],
              expression: QUERY_EXPRESSIONS.SPAN_NAMES,
              disabled: QUERY_DEFAULTS.DISABLED,
              having: QUERY_DEFAULTS.HAVING,
              stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
              limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
              orderBy: [
                {
                  columnName: SPAN_KEYS.TIMESTAMP,
                  order: ORDER_DIRECTIONS.DESC,
                },
              ],
              groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
              offset: QUERY_DEFAULTS.OFFSET,
            },
          },
        },
        dataSource: DATA_SOURCES.TRACES,
        projectId,
      };

      const resp = await this.makeRequest(payload);
      const list = resp?.data?.result?.find((r: any) => r?.queryName === 'spanNames')?.list ?? [];
      const names = new Set<string>();
      for (const row of list) {
        const n = row?.data?.name ?? row?.name;
        if (n) names.add(n);
      }
      return [...names].sort();
    } catch (e) {
      console.error('getAvailableSpanNames error:', e);
      return [];
    }
  }

  // ---------- Private: transform + filter

  private toConversationStats(
    toolCallsSeries: Series[],
    transferSeries: Series[],
    delegationSeries: Series[],
    aiCallsSeries: Series[],
    metaByConv: Map<string, { tenantId: string; agentId: string; agentName: string }>,
    spansWithErrorsSeries: Series[],
    firstMsgByConv: Map<string, { content: string; timestamp: number }>
  ): ConversationStats[] {
    type Acc = {
      totalToolCalls: number;
      toolsUsed: Map<string, { name: string; calls: number; description: string }>;
      transfers: Map<string, { from: string; to: string; count: number }>;
      totalTransfers: number;
      delegations: Map<string, { from: string; to: string; count: number }>;
      totalDelegations: number;
      totalAICalls: number;
      totalErrors: number;
    };

    const byConv = new Map<string, Acc>();

    const ensure = (id: string) => {
      const cur = byConv.get(id);
      if (cur) return cur;
      const blank: Acc = {
        totalToolCalls: 0,
        toolsUsed: new Map(),
        transfers: new Map(),
        totalTransfers: 0,
        delegations: new Map(),
        totalDelegations: 0,
        totalAICalls: 0,
        totalErrors: 0,
      };
      byConv.set(id, blank);
      return blank;
    };

    // tools
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

    // transfers
    for (const s of transferSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const from = s.labels?.[SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID];
      const to = s.labels?.[SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID];
      const count = countFromSeries(s);
      if (!from || !to || !count) continue;
      const acc = ensure(id);
      acc.totalTransfers += count;
      const key = `${from}→${to}`;
      const h = acc.transfers.get(key) || { from, to, count: 0 };
      h.count += count;
      acc.transfers.set(key, h);
    }

    // delegations
    for (const s of delegationSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const from = s.labels?.[SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID];
      const to = s.labels?.[SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID];
      const count = countFromSeries(s);
      if (!from || !to || !count) continue;
      const acc = ensure(id);
      acc.totalDelegations += count;
      const key = `${from}→${to}`;
      const d = acc.delegations.get(key) || { from, to, count: 0 };
      d.count += count;
      acc.delegations.set(key, d);
    }

    // AI calls
    for (const s of aiCallsSeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const count = countFromSeries(s);
      if (!count) continue;
      ensure(id).totalAICalls += count;
    }

    // errors - only count critical errors
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

    // finalize
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
        transfers: [...acc.transfers.values()],
        totalTransfers: acc.totalTransfers,
        delegations: [...acc.delegations.values()],
        totalDelegations: acc.totalDelegations,
        totalAICalls: acc.totalAICalls,
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
    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          agentModelCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.AGENT_MODEL_CALLS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                {
                  key: {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.IN,
                  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                },
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                ...(projectId
                  ? [
                      {
                        key: {
                          key: SPAN_KEYS.PROJECT_ID,
                          ...QUERY_FIELD_CONFIGS.STRING_TAG,
                        },
                        op: OPERATORS.EQUALS,
                        value: projectId,
                      },
                    ]
                  : []),
              ],
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              {
                key: SPAN_KEYS.AI_MODEL_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.AGENT_MODEL_CALLS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildModelBreakdownPayload(start: number, end: number, projectId?: string) {
    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          modelCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.MODEL_CALLS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                {
                  key: {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.IN,
                  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                },
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                ...(projectId
                  ? [
                      {
                        key: {
                          key: SPAN_KEYS.PROJECT_ID,
                          ...QUERY_FIELD_CONFIGS.STRING_TAG,
                        },
                        op: OPERATORS.EQUALS,
                        value: projectId,
                      },
                    ]
                  : []),
              ],
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.AI_MODEL_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.MODEL_CALLS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildConversationActivityPayload(
    start: number,
    end: number,
    agentId?: string,
    projectId?: string
  ) {
    const items: any[] = [
      {
        key: {
          key: SPAN_KEYS.CONVERSATION_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG,
        },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(agentId && agentId !== 'all'
        ? [
            {
              key: {
                key: SPAN_KEYS.AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: agentId,
            },
          ]
        : []),
      ...(projectId
        ? [
            {
              key: {
                key: SPAN_KEYS.PROJECT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          lastActivity: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            aggregateOperator: AGGREGATE_OPERATORS.MIN,
            aggregateAttribute: {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            reduceTo: REDUCE_OPERATIONS.MIN,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
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
    includeAggregates?: boolean
  ) {
    const buildBaseFilters = (): any[] => {
      const items: any[] = [
        {
          key: {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];

      if (agentId && agentId !== 'all') {
        items.push({
          key: {
            key: SPAN_KEYS.AGENT_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          op: OPERATORS.EQUALS,
          value: agentId,
        });
      }

      if (projectId) {
        items.push({
          key: {
            key: SPAN_KEYS.PROJECT_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }

      return items;
    };

    const paginationLimit =
      pagination && !includeSearchData ? pagination.limit : QUERY_DEFAULTS.LIMIT_UNLIMITED;
    const paginationOffset =
      pagination && !includeSearchData ? (pagination.page - 1) * pagination.limit : 0;

    const builderQueries: Record<string, any> = {
      pageConversations: {
        dataSource: DATA_SOURCES.TRACES,
        queryName: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
        aggregateOperator: AGGREGATE_OPERATORS.MIN,
        aggregateAttribute: {
          key: SPAN_KEYS.TIMESTAMP,
          ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
        },
        filters: { op: OPERATORS.AND, items: buildBaseFilters() },
        groupBy: [
          {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
        ],
        expression: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
        reduceTo: REDUCE_OPERATIONS.MIN,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
        offset: paginationOffset,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: paginationLimit,
      },
      totalConversations: {
        dataSource: DATA_SOURCES.TRACES,
        queryName: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
        aggregateOperator: AGGREGATE_OPERATORS.COUNT_DISTINCT,
        aggregateAttribute: {
          key: SPAN_KEYS.CONVERSATION_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG,
        },
        filters: { op: OPERATORS.AND, items: buildBaseFilters() },
        groupBy: [],
        expression: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: 1,
      },
    };

    // Add filtered conversations query if filters are provided
    if (filters?.spanName || filters?.attributes?.length) {
      const filterItems: any[] = [
        {
          key: {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];

      if (filters.spanName) {
        filterItems.push({
          key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
          op: OPERATORS.EQUALS,
          value: filters.spanName,
        });
      }

      // Attribute filters
      for (const attr of filters.attributes ?? []) {
        const op = attr.operator ?? OPERATORS.EQUALS;
        let value: any = asTypedFilterValue(attr.value);
        let dataType: DataType = DATA_TYPES.STRING;
        if (typeof value === 'boolean') dataType = DATA_TYPES.BOOL;
        else if (typeof value === 'number')
          dataType = Number.isInteger(value) ? DATA_TYPES.INT64 : DATA_TYPES.FLOAT64;

        if (op === OPERATORS.EXISTS || op === OPERATORS.NOT_EXISTS) {
          filterItems.push({
            key: { key: attr.key, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            op,
            value: '',
          });
          continue;
        }

        if (
          (op === OPERATORS.LIKE || op === OPERATORS.NOT_LIKE) &&
          typeof value === 'string' &&
          !value.includes('%')
        ) {
          value = `%${value}%`;
        }

        if (
          (dataType === DATA_TYPES.INT64 || dataType === DATA_TYPES.FLOAT64) &&
          op === OPERATORS.EQUALS
        ) {
          const config =
            dataType === DATA_TYPES.INT64
              ? QUERY_FIELD_CONFIGS.INT64_TAG
              : QUERY_FIELD_CONFIGS.FLOAT64_TAG;
          filterItems.push({
            key: { key: attr.key, ...config },
            op: OPERATORS.GREATER_THAN_OR_EQUAL,
            value,
          });
          filterItems.push({
            key: { key: attr.key, ...config },
            op: OPERATORS.LESS_THAN_OR_EQUAL,
            value,
          });
        } else {
          const config =
            dataType === DATA_TYPES.STRING
              ? QUERY_FIELD_CONFIGS.STRING_TAG
              : dataType === DATA_TYPES.INT64
                ? QUERY_FIELD_CONFIGS.INT64_TAG
                : dataType === DATA_TYPES.FLOAT64
                  ? QUERY_FIELD_CONFIGS.FLOAT64_TAG
                  : QUERY_FIELD_CONFIGS.BOOL_TAG;
          filterItems.push({ key: { key: attr.key, ...config }, op, value });
        }
      }

      if (projectId) {
        filterItems.push({
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }

      builderQueries.filteredConversations = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS,
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: { op: OPERATORS.AND, items: filterItems },
        groupBy: [
          {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
        ],
        expression: QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS,
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };
    }

    // Add metadata and user messages queries if search is needed
    if (includeSearchData) {
      const metadataFilters = buildBaseFilters();
      metadataFilters.push(
        {
          key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        },
        {
          key: { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        }
      );

      builderQueries.conversationMetadata = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: { op: OPERATORS.AND, items: metadataFilters },
        groupBy: [
          {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          { key: SPAN_KEYS.AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        ],
        expression: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };

      const userMessagesFilters = buildBaseFilters();
      userMessagesFilters.push({
        key: {
          key: SPAN_KEYS.MESSAGE_CONTENT,
          ...QUERY_FIELD_CONFIGS.STRING_TAG,
        },
        op: OPERATORS.EXISTS,
        value: '',
      });

      builderQueries.userMessages = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: QUERY_EXPRESSIONS.USER_MESSAGES,
        aggregateOperator: AGGREGATE_OPERATORS.MIN,
        aggregateAttribute: {
          key: SPAN_KEYS.TIMESTAMP,
          ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
        },
        filters: { op: OPERATORS.AND, items: userMessagesFilters },
        groupBy: [
          {
            key: SPAN_KEYS.CONVERSATION_ID,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
          {
            key: SPAN_KEYS.MESSAGE_CONTENT,
            ...QUERY_FIELD_CONFIGS.STRING_TAG,
          },
        ],
        expression: QUERY_EXPRESSIONS.USER_MESSAGES,
        reduceTo: REDUCE_OPERATIONS.MIN,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.ASC }],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };
    }

    if (includeAggregates) {
      const convIdFilter = buildBaseFilters();

      builderQueries.aggToolCalls = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: 'aggToolCalls',
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: {
          op: OPERATORS.AND,
          items: [
            ...convIdFilter,
            {
              key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.AI_TOOL_CALL,
            },
            {
              key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: AI_TOOL_TYPES.MCP,
            },
          ],
        },
        groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
        expression: 'aggToolCalls',
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };

      builderQueries.aggTransfers = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: 'aggTransfers',
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: {
          op: OPERATORS.AND,
          items: [
            ...convIdFilter,
            {
              key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.AI_TOOL_CALL,
            },
            {
              key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: AI_TOOL_TYPES.TRANSFER,
            },
          ],
        },
        groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
        expression: 'aggTransfers',
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };

      builderQueries.aggDelegations = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: 'aggDelegations',
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: {
          op: OPERATORS.AND,
          items: [
            ...convIdFilter,
            {
              key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.AI_TOOL_CALL,
            },
            {
              key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: AI_TOOL_TYPES.DELEGATION,
            },
          ],
        },
        groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
        expression: 'aggDelegations',
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };

      builderQueries.aggAICalls = {
        dataSource: DATA_SOURCES.TRACES,
        queryName: 'aggAICalls',
        aggregateOperator: AGGREGATE_OPERATORS.COUNT,
        aggregateAttribute: {
          key: SPAN_KEYS.SPAN_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        filters: {
          op: OPERATORS.AND,
          items: [
            ...convIdFilter,
            {
              key: { key: SPAN_KEYS.AI_OPERATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.IN,
              value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
            },
          ],
        },
        groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
        expression: 'aggAICalls',
        reduceTo: REDUCE_OPERATIONS.SUM,
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        orderBy: [],
        offset: QUERY_DEFAULTS.OFFSET,
        disabled: QUERY_DEFAULTS.DISABLED,
        having: QUERY_DEFAULTS.HAVING,
        legend: QUERY_DEFAULTS.LEGEND,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      };
    }

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries,
      },
      dataSource: DATA_SOURCES.TRACES,
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
    const withProjectAndAgent = (items: any[]) => {
      let filtered = items;
      if (projectId) {
        filtered = [
          ...filtered,
          {
            key: {
              key: SPAN_KEYS.PROJECT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            op: OPERATORS.EQUALS,
            value: projectId,
          },
        ];
      }
      if (agentId) {
        filtered = [
          ...filtered,
          {
            key: {
              key: SPAN_KEYS.AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            op: OPERATORS.EQUALS,
            value: agentId,
          },
        ];
      }
      // Add conversation ID filters if provided (for pagination optimization)
      if (conversationIds && conversationIds.length > 0) {
        filtered = [
          ...filtered,
          {
            key: {
              key: SPAN_KEYS.CONVERSATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            op: OPERATORS.IN,
            value: conversationIds,
          },
        ];
      } else {
        // Only add EXISTS check if no specific IDs provided
        filtered = [
          ...filtered,
          {
            key: {
              key: SPAN_KEYS.CONVERSATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            op: OPERATORS.EXISTS,
            value: '',
          },
        ];
      }
      return filtered;
    };

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          tools: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.TOOLS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.NAME,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AI_TOOL_CALL,
                },
                {
                  key: {
                    key: SPAN_KEYS.AI_TOOL_TYPE,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_TOOL_TYPES.MCP,
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.AI_TOOL_CALL_NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.TOOLS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          transfers: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.TRANSFERS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.NAME,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AI_TOOL_CALL,
                },
                {
                  key: {
                    key: SPAN_KEYS.AI_TOOL_TYPE,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_TOOL_TYPES.TRANSFER,
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.TRANSFERS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          delegations: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.DELEGATIONS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.NAME,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AI_TOOL_CALL,
                },
                {
                  key: {
                    key: SPAN_KEYS.AI_TOOL_TYPE,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_TOOL_TYPES.DELEGATION,
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.DELEGATIONS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          conversationMetadata: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.TENANT_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: {
                    key: SPAN_KEYS.AGENT_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          aiCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.AI_CALLS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.IN,
                  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              {
                key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.AI_CALLS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          lastActivity: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            aggregateOperator: AGGREGATE_OPERATORS.MIN,
            aggregateAttribute: {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            reduceTo: REDUCE_OPERATIONS.MIN,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          spansWithErrors: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.HAS_ERROR,
                    ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: true,
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
            ],
            expression: QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          userMessages: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.USER_MESSAGES,
            aggregateOperator: AGGREGATE_OPERATORS.MIN,
            aggregateAttribute: {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndAgent([
                {
                  key: {
                    key: SPAN_KEYS.MESSAGE_CONTENT,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ]),
            },
            groupBy: [
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.MESSAGE_CONTENT,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.USER_MESSAGES,
            reduceTo: REDUCE_OPERATIONS.MIN,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.ASC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildUniqueAgentsPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: {
                key: SPAN_KEYS.PROJECT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          uniqueAgents: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.UNIQUE_AGENTS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [{ key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: QUERY_EXPRESSIONS.UNIQUE_AGENTS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.AGENT_ID, order: ORDER_DIRECTIONS.ASC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildUniqueModelsPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: {
          key: SPAN_KEYS.AI_MODEL_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG,
        },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: {
          key: SPAN_KEYS.AI_MODEL_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG,
        },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: {
                key: SPAN_KEYS.PROJECT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          uniqueModels: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.UNIQUE_MODELS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [
              {
                key: SPAN_KEYS.AI_MODEL_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
            ],
            expression: QUERY_EXPRESSIONS.UNIQUE_MODELS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [
              {
                columnName: SPAN_KEYS.AI_MODEL_ID,
                order: ORDER_DIRECTIONS.ASC,
              },
            ],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildToolBreakdownPayload(start: number, end: number, projectId?: string) {
    const baseFilters: any[] = [
      {
        key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          toolCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'toolCalls',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items: baseFilters },
            groupBy: [
              { key: SPAN_KEYS.AI_TOOL_CALL_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: 'toolCalls',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
          toolErrors: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'toolErrors',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                ...baseFilters,
                {
                  key: { key: SPAN_KEYS.HAS_ERROR, ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN },
                  op: OPERATORS.EQUALS,
                  value: true,
                },
              ],
            },
            groupBy: [{ key: SPAN_KEYS.AI_TOOL_CALL_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: 'toolErrors',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildToolServerBreakdownPayload(start: number, end: number, projectId?: string) {
    const baseFilters: any[] = [
      {
        key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          serverCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'serverCalls',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items: baseFilters },
            groupBy: [
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: 'serverCalls',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
          serverErrors: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'serverErrors',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                ...baseFilters,
                {
                  key: { key: SPAN_KEYS.HAS_ERROR, ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN },
                  op: OPERATORS.EQUALS,
                  value: true,
                },
              ],
            },
            groupBy: [
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: 'serverErrors',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildUniqueToolServersPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          uniqueServers: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'uniqueServers',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: 'uniqueServers',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [
              { columnName: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, order: ORDER_DIRECTIONS.ASC },
            ],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildUniqueToolNamesPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          uniqueTools: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'uniqueTools',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [{ key: SPAN_KEYS.AI_TOOL_CALL_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: 'uniqueTools',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.AI_TOOL_CALL_NAME, order: ORDER_DIRECTIONS.ASC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
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
      const totalAICalls = countFromSeries(totalAICallsSeries[0] || { values: [{ value: '0' }] });
      const totalMCPCalls = countFromSeries(totalMCPCallsSeries[0] || { values: [{ value: '0' }] });

      const avgUserMessagesPerConversation =
        totalConversations > 0 ? Math.round((totalUserMessages / totalConversations) * 10) / 10 : 0;

      return {
        totalConversations,
        avgUserMessagesPerConversation,
        totalUserMessages,
        totalTriggerInvocations,
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
      // When filtering by a single project, pass it to makeRequest for server-side filtering
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const metaResp = await this.makeRequest(
        this.buildProjectConversationMetadataPayload(startTime, endTime, projectIds),
        singleProjectId
      );
      const metaSeries = this.extractSeries(metaResp, 'conversationMetadata');

      const activitySeries = metaSeries.length
        ? this.extractSeries(
            await this.makeRequest(
              this.buildProjectConversationActivityPayload(startTime, endTime, projectIds),
              singleProjectId
            ),
            'lastActivity'
          )
        : [];

      const buckets = new Map<string, number>();
      for (const s of activitySeries) {
        const tsMs = nsToMs(numberFromSeries(s));
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
  async getStatsByProject(
    startTime: number,
    endTime: number,
    projectIds?: string[]
  ): Promise<
    Array<{
      projectId: string;
      totalConversations: number;
      totalAICalls: number;
      totalMCPCalls: number;
    }>
  > {
    try {
      // When filtering by a single project, pass it to makeRequest for server-side filtering
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const payload = this.buildStatsByProjectPayload(startTime, endTime, projectIds);
      const resp = await this.makeRequest(payload, singleProjectId);

      const conversationsSeries = this.extractSeries(resp, 'conversationsByProject');
      const aiCallsSeries = this.extractSeries(resp, 'aiCallsByProject');
      const mcpCallsSeries = this.extractSeries(resp, 'mcpCallsByProject');

      const projectStats = new Map<
        string,
        { totalConversations: number; totalAICalls: number; totalMCPCalls: number }
      >();

      for (const s of conversationsSeries) {
        const projectId = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!projectId) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(projectId) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalConversations = count;
        projectStats.set(projectId, existing);
      }

      for (const s of aiCallsSeries) {
        const projectId = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!projectId) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(projectId) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalAICalls = count;
        projectStats.set(projectId, existing);
      }

      for (const s of mcpCallsSeries) {
        const projectId = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!projectId) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(projectId) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalMCPCalls = count;
        projectStats.set(projectId, existing);
      }

      return Array.from(projectStats.entries())
        .map(([projectId, stats]) => ({ projectId, ...stats }))
        .sort((a, b) => b.totalConversations - a.totalConversations);
    } catch (e) {
      console.error('getStatsByProject error:', e);
      return [];
    }
  }

  // ============= Project Overview Payload Builders =============

  private buildProjectOverviewStatsPayload(start: number, end: number, projectIds?: string[]) {
    const tenantFilter = {
      key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
      op: OPERATORS.EQUALS,
      value: this.tenantId,
    };

    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const projectFilters = buildProjectFilters();

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          totalConversations: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'totalConversations',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT_DISTINCT,
            aggregateAttribute: {
              key: SPAN_KEYS.CONVERSATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ],
            },
            groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
            expression: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          totalUserMessages: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'totalUserMessages',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: { key: SPAN_KEYS.MESSAGE_CONTENT, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ],
            },
            groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
            expression: 'totalUserMessages',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          totalTriggerInvocations: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'totalTriggerInvocations',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT_DISTINCT,
            aggregateAttribute: {
              key: SPAN_KEYS.TRIGGER_INVOCATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.INVOCATION_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EQUALS,
                  value: 'trigger',
                },
                {
                  key: { key: SPAN_KEYS.TRIGGER_INVOCATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ],
            },
            groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
            expression: 'totalTriggerInvocations',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          totalAICalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'totalAICalls',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: { key: SPAN_KEYS.AI_OPERATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.IN,
                  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                },
              ],
            },
            groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
            expression: 'totalAICalls',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          totalMCPCalls: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'totalMCPCalls',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AI_TOOL_CALL,
                },
                {
                  key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EQUALS,
                  value: AI_TOOL_TYPES.MCP,
                },
              ],
            },
            groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
            expression: 'totalMCPCalls',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
    };
  }

  private buildProjectConversationMetadataPayload(
    start: number,
    end: number,
    projectIds?: string[]
  ) {
    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const items: any[] = [
      {
        key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: this.tenantId,
      },
      ...buildProjectFilters(),
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          conversationMetadata: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [
              { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
    };
  }

  private buildProjectConversationActivityPayload(
    start: number,
    end: number,
    projectIds?: string[]
  ) {
    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const items: any[] = [
      {
        key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: this.tenantId,
      },
      ...buildProjectFilters(),
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
    ];

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          lastActivity: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            aggregateOperator: AGGREGATE_OPERATORS.MIN,
            aggregateAttribute: {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [{ key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            reduceTo: REDUCE_OPERATIONS.MIN,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
    };
  }

  private buildStatsByProjectPayload(start: number, end: number, projectIds?: string[]) {
    const tenantFilter = {
      key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
      op: OPERATORS.EQUALS,
      value: this.tenantId,
    };

    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const projectFilters = buildProjectFilters();

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          conversationsByProject: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'conversationsByProject',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT_DISTINCT,
            aggregateAttribute: {
              key: SPAN_KEYS.CONVERSATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
              ],
            },
            groupBy: [{ key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: 'conversationsByProject',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          aiCallsByProject: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'aiCallsByProject',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: { key: SPAN_KEYS.AI_OPERATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.IN,
                  value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
                },
              ],
            },
            groupBy: [{ key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: 'aiCallsByProject',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },

          mcpCallsByProject: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: 'mcpCallsByProject',
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: [
                tenantFilter,
                ...projectFilters,
                {
                  key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AI_TOOL_CALL,
                },
                {
                  key: { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
                  op: OPERATORS.EQUALS,
                  value: AI_TOOL_TYPES.MCP,
                },
              ],
            },
            groupBy: [{ key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: 'mcpCallsByProject',
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
    };
  }

  private buildTokenUsagePayload(start: number, end: number, projectId?: string) {
    const baseFilters = [
      {
        key: { key: SPAN_KEYS.AI_OPERATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    const buildQuery = (
      queryName: string,
      aggregateKey: string,
      groupByKey: string,
      groupByConfig: typeof QUERY_FIELD_CONFIGS.STRING_TAG
    ) => ({
      dataSource: DATA_SOURCES.TRACES,
      queryName,
      aggregateOperator: AGGREGATE_OPERATORS.SUM,
      aggregateAttribute: {
        key: aggregateKey,
        dataType: DATA_TYPES.FLOAT64,
        type: 'tag',
        isColumn: false,
        isJSON: false,
      },
      filters: { op: OPERATORS.AND, items: baseFilters },
      groupBy: [{ key: groupByKey, ...groupByConfig }],
      expression: queryName,
      reduceTo: REDUCE_OPERATIONS.SUM,
      stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
      orderBy: [],
      offset: QUERY_DEFAULTS.OFFSET,
      disabled: QUERY_DEFAULTS.DISABLED,
      having: QUERY_DEFAULTS.HAVING,
      legend: QUERY_DEFAULTS.LEGEND,
      limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
    });

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          inputTokensByModel: buildQuery(
            'inputTokensByModel',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.AI_MODEL_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
          outputTokensByModel: buildQuery(
            'outputTokensByModel',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.AI_MODEL_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
          inputTokensByAgent: buildQuery(
            'inputTokensByAgent',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.AGENT_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
          outputTokensByAgent: buildQuery(
            'outputTokensByAgent',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.AGENT_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
          inputTokensByProject: buildQuery(
            'inputTokensByProject',
            SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
            SPAN_KEYS.PROJECT_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
          outputTokensByProject: buildQuery(
            'outputTokensByProject',
            SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
            SPAN_KEYS.PROJECT_ID,
            QUERY_FIELD_CONFIGS.STRING_TAG
          ),
        },
      },
      dataSource: DATA_SOURCES.TRACES,
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
