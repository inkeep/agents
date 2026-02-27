import axios from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import {
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  OPERATORS,
  ORDER_DIRECTIONS,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
  V5_REQUEST_TYPES,
  aggregation,
  buildFilterExpression,
  extractV5Rows,
  extractV5Series,
  filterExpr,
  getV5LabelMap,
  groupByKey,
  orderBy,
  selectField,
  v5BuilderQuery,
  v5Payload,
} from '@/constants/signoz';

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

// ---------- Small utilities

const nsToMs = (ns: number) => Math.floor(ns / 1_000_000);

const asNumberIfNumeric = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

// Type-safe filter value schema and parser
const FilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

type FilterValue = z.infer<typeof FilterValueSchema>;

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

    const response = await axios.post<T>(`/api/signoz?tenantId=${this.tenantId}`, requestPayload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
      'axios-retry': {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error: import('axios').AxiosError) =>
          axiosRetry.isNetworkError(error) ||
          (error.response !== undefined && error.response.status >= 500),
      },
    } as any);
    return response.data;
  }

  private async makePipelineRequest(
    paginationPayload: any,
    detailPayloadTemplate: any
  ): Promise<{ paginationResponse: any; detailResponse: any }> {
    if (!this.tenantId) {
      throw new Error('TenantId not set. Call setTenantId() before making requests.');
    }

    const response = await axios.post(
      `/api/signoz?tenantId=${this.tenantId}&mode=batch`,
      { paginationPayload, detailPayloadTemplate },
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
        'axios-retry': {
          retries: 3,
          retryDelay: axiosRetry.exponentialDelay,
          retryCondition: (error: import('axios').AxiosError) =>
            axiosRetry.isNetworkError(error) ||
            (error.response !== undefined && error.response.status >= 500),
        },
      } as any
    );
    return response.data;
  }

  // --- Helpers to read SigNoz v5 response (with v4-compat label maps)
  private extractSeries(resp: any, name: string): Series[] {
    const v5Series = extractV5Series(resp, name);
    return v5Series.map((s) => ({
      labels: getV5LabelMap(s.labels),
      values: s.values?.map((v) => ({ value: String(v.value) })),
    }));
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
    agentId: string | undefined
  ): Promise<PaginatedConversationStats> {
    try {
      return await this.getConversationStatsPaginated(
        startTime,
        endTime,
        filters,
        projectId,
        pagination,
        searchQuery,
        agentId
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
      (msgsByConv.get(id) ?? msgsByConv.set(id, []).get(id))?.push({ t, c: content });
    }
    for (const [id, arr] of msgsByConv) {
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0];
      if (first) {
        const content = first.c.length > 100 ? `${first.c.slice(0, 100)}...` : first.c;
        firstMsgByConv.set(id, { content, timestamp: nsToMs(first.t) });
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
    agentId: string | undefined
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
        pagination
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
      const conversationIds = pageSeries
        .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
        .filter(Boolean) as string[];

      const totalSeries = this.extractSeries(
        paginationResponse,
        QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS
      );
      const total = countFromSeries(totalSeries[0] || zeroSeries);
      aggregateStats.totalConversations = total;

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
      agentId
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
    agentId: string | undefined
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
      undefined
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
          key: { key: SPAN_KEYS.NAME },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
      if (agentId && agentId !== 'all') {
        filterItems.push({
          key: { key: SPAN_KEYS.AGENT_ID },
          op: OPERATORS.EQUALS,
          value: agentId,
        });
      }
      if (projectId) {
        filterItems.push({
          key: { key: SPAN_KEYS.PROJECT_ID },
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }

      const payload = v5Payload({
        start: startTime,
        end: endTime,
        requestType: V5_REQUEST_TYPES.RAW,
        queries: [
          v5BuilderQuery({
            name: QUERY_EXPRESSIONS.SPAN_NAMES,
            aggregations: [],
            filter: filterExpr(buildFilterExpression(filterItems)),
            selectFields: [selectField(SPAN_KEYS.NAME)],
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
            order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
            offset: QUERY_DEFAULTS.OFFSET,
          }),
        ],
      });

      const resp = await this.makeRequest(payload);
      const rows = extractV5Rows(resp, 'spanNames');
      const names = new Set<string>();
      for (const row of rows) {
        const n = (row?.data as Record<string, unknown>)?.name ?? (row as any)?.name;
        if (n) names.add(String(n));
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

  private buildAgentModelBreakdownPayload(start: number, end: number, _projectId?: string) {
    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.AGENT_MODEL_CALLS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              {
                key: { key: SPAN_KEYS.AI_OPERATION_ID },
                op: OPERATORS.IN,
                value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
              },
              {
                key: { key: SPAN_KEYS.CONVERSATION_ID },
                op: OPERATORS.EXISTS,
                value: '',
              },
            ]),
          ),
          groupBy: [
            groupByKey(SPAN_KEYS.CONVERSATION_ID),
            groupByKey(SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID),
            groupByKey(SPAN_KEYS.AGENT_ID),
            groupByKey(SPAN_KEYS.AI_MODEL_ID),
          ],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildModelBreakdownPayload(start: number, end: number, _projectId?: string) {
    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.MODEL_CALLS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              {
                key: { key: SPAN_KEYS.AI_OPERATION_ID },
                op: OPERATORS.IN,
                value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
              },
              {
                key: { key: SPAN_KEYS.CONVERSATION_ID },
                op: OPERATORS.EXISTS,
                value: '',
              },
            ]),
          ),
          groupBy: [
            groupByKey(SPAN_KEYS.CONVERSATION_ID),
            groupByKey(SPAN_KEYS.AI_MODEL_ID),
            groupByKey(SPAN_KEYS.AGENT_ID),
          ],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildConversationActivityPayload(
    start: number,
    end: number,
    agentId?: string,
    _projectId?: string,
  ) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(agentId && agentId !== 'all'
        ? [
            {
              key: { key: SPAN_KEYS.AGENT_ID },
              op: OPERATORS.EQUALS,
              value: agentId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
          aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildFilteredConversationIdsPayload(
    start: number,
    end: number,
    filters: SpanFilterOptions | undefined,
    projectId: string | undefined,
    agentId: string | undefined,
    includeSearchData: boolean,
    pagination?: { page: number; limit: number }
  ) {
    const buildBaseFilters = (): any[] => {
      const items: any[] = [
        { key: { key: SPAN_KEYS.CONVERSATION_ID }, op: OPERATORS.EXISTS, value: '' },
      ];
      if (agentId && agentId !== 'all') {
        items.push({ key: { key: SPAN_KEYS.AGENT_ID }, op: OPERATORS.EQUALS, value: agentId });
      }
      if (projectId) {
        items.push({ key: { key: SPAN_KEYS.PROJECT_ID }, op: OPERATORS.EQUALS, value: projectId });
      }
      return items;
    };

    const paginationLimit =
      pagination && !includeSearchData ? pagination.limit : QUERY_DEFAULTS.LIMIT_UNLIMITED;
    const paginationOffset =
      pagination && !includeSearchData ? (pagination.page - 1) * pagination.limit : 0;

    const queries: any[] = [
      v5BuilderQuery({
        name: QUERY_EXPRESSIONS.PAGE_CONVERSATIONS,
        aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
        filter: filterExpr(buildFilterExpression(buildBaseFilters())),
        groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID)],
        order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        offset: paginationOffset,
        limit: paginationLimit,
      }),
      v5BuilderQuery({
        name: QUERY_EXPRESSIONS.TOTAL_CONVERSATIONS,
        aggregations: [aggregation(`count_distinct(${SPAN_KEYS.CONVERSATION_ID})`)],
        filter: filterExpr(buildFilterExpression(buildBaseFilters())),
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: 1,
      }),
    ];

    if (filters?.spanName || filters?.attributes?.length) {
      const filterItems: any[] = [
        { key: { key: SPAN_KEYS.CONVERSATION_ID }, op: OPERATORS.EXISTS, value: '' },
      ];
      if (filters.spanName) {
        filterItems.push({
          key: { key: SPAN_KEYS.NAME },
          op: OPERATORS.EQUALS,
          value: filters.spanName,
        });
      }
      for (const attr of filters.attributes ?? []) {
        const op = attr.operator ?? OPERATORS.EQUALS;
        let value: any = asTypedFilterValue(attr.value);
        if (op === OPERATORS.EXISTS || op === OPERATORS.NOT_EXISTS) {
          filterItems.push({ key: { key: attr.key }, op, value: '' });
          continue;
        }
        if (
          (op === OPERATORS.LIKE || op === OPERATORS.NOT_LIKE) &&
          typeof value === 'string' &&
          !value.includes('%')
        ) {
          value = `%${value}%`;
        }
        const isNumeric = typeof value === 'number';
        if (isNumeric && op === OPERATORS.EQUALS) {
          filterItems.push({ key: { key: attr.key }, op: OPERATORS.GREATER_THAN_OR_EQUAL, value });
          filterItems.push({ key: { key: attr.key }, op: OPERATORS.LESS_THAN_OR_EQUAL, value });
        } else {
          filterItems.push({ key: { key: attr.key }, op, value });
        }
      }
      if (projectId) {
        filterItems.push({
          key: { key: SPAN_KEYS.PROJECT_ID },
          op: OPERATORS.EQUALS,
          value: projectId,
        });
      }
      queries.push(
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(filterItems)),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        })
      );
    }

    if (includeSearchData) {
      const metadataFilters = [
        ...buildBaseFilters(),
        { key: { key: SPAN_KEYS.TENANT_ID }, op: OPERATORS.EXISTS, value: '' },
        { key: { key: SPAN_KEYS.AGENT_ID }, op: OPERATORS.EXISTS, value: '' },
      ];
      queries.push(
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(metadataFilters)),
          groupBy: [
            groupByKey(SPAN_KEYS.CONVERSATION_ID),
            groupByKey(SPAN_KEYS.TENANT_ID),
            groupByKey(SPAN_KEYS.AGENT_ID),
            groupByKey(SPAN_KEYS.AGENT_NAME),
          ],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        })
      );

      const userMsgFilters = [
        ...buildBaseFilters(),
        { key: { key: SPAN_KEYS.MESSAGE_CONTENT }, op: OPERATORS.EXISTS, value: '' },
      ];
      queries.push(
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.USER_MESSAGES,
          aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
          filter: filterExpr(buildFilterExpression(userMsgFilters)),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID), groupByKey(SPAN_KEYS.MESSAGE_CONTENT)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'asc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        })
      );
    }

    {
      const convIdFilter = buildBaseFilters();
      queries.push(
        v5BuilderQuery({
          name: 'aggToolCallsByType',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...convIdFilter,
              { key: { key: SPAN_KEYS.NAME }, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
            ])
          ),
          groupBy: [groupByKey(SPAN_KEYS.AI_TOOL_TYPE)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'aggAICalls',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...convIdFilter,
              {
                key: { key: SPAN_KEYS.AI_OPERATION_ID },
                op: OPERATORS.IN,
                value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        })
      );
    }

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries,
    });
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
      const filtered = [...items];
      if (projectId) {
        filtered.push({ key: { key: SPAN_KEYS.PROJECT_ID }, op: OPERATORS.EQUALS, value: projectId });
      }
      if (agentId) {
        filtered.push({ key: { key: SPAN_KEYS.AGENT_ID }, op: OPERATORS.EQUALS, value: agentId });
      }
      if (conversationIds && conversationIds.length > 0) {
        filtered.push({ key: { key: SPAN_KEYS.CONVERSATION_ID }, op: OPERATORS.IN, value: conversationIds });
      } else {
        filtered.push({ key: { key: SPAN_KEYS.CONVERSATION_ID }, op: OPERATORS.EXISTS, value: '' });
      }
      return filtered;
    };

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.TOOLS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression(
              withProjectAndAgent([
                { key: { key: SPAN_KEYS.NAME }, op: OPERATORS.EQUALS, value: SPAN_NAMES.AI_TOOL_CALL },
                { key: { key: SPAN_KEYS.AI_TOOL_TYPE }, op: OPERATORS.EQUALS, value: AI_TOOL_TYPES.MCP },
              ])
            )
          ),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID), groupByKey(SPAN_KEYS.AI_TOOL_CALL_NAME)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression(
              withProjectAndAgent([
                { key: { key: SPAN_KEYS.TENANT_ID }, op: OPERATORS.EXISTS, value: '' },
                { key: { key: SPAN_KEYS.AGENT_ID }, op: OPERATORS.EXISTS, value: '' },
              ])
            )
          ),
          groupBy: [
            groupByKey(SPAN_KEYS.CONVERSATION_ID),
            groupByKey(SPAN_KEYS.TENANT_ID),
            groupByKey(SPAN_KEYS.AGENT_ID),
            groupByKey(SPAN_KEYS.AGENT_NAME),
          ],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
          aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
          filter: filterExpr(buildFilterExpression(withProjectAndAgent([]))),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression(
              withProjectAndAgent([
                { key: { key: SPAN_KEYS.HAS_ERROR }, op: OPERATORS.EQUALS, value: true },
              ])
            )
          ),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID), groupByKey(SPAN_KEYS.NAME)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'desc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.USER_MESSAGES,
          aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
          filter: filterExpr(
            buildFilterExpression(
              withProjectAndAgent([
                { key: { key: SPAN_KEYS.MESSAGE_CONTENT }, op: OPERATORS.EXISTS, value: '' },
              ])
            )
          ),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID), groupByKey(SPAN_KEYS.MESSAGE_CONTENT)],
          order: [orderBy(SPAN_KEYS.TIMESTAMP, 'asc')],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildUniqueAgentsPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.AGENT_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AGENT_ID },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.UNIQUE_AGENTS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [groupByKey(SPAN_KEYS.AGENT_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.AGENT_ID, ORDER_DIRECTIONS.ASC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildUniqueModelsPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.AI_MODEL_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AI_MODEL_ID },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.UNIQUE_MODELS,
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [groupByKey(SPAN_KEYS.AI_MODEL_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.AI_MODEL_ID, ORDER_DIRECTIONS.ASC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildToolBreakdownPayload(start: number, end: number, projectId?: string) {
    const baseFilters: any[] = [
      {
        key: { key: SPAN_KEYS.NAME },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: 'toolCalls',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(baseFilters)),
          groupBy: [
            groupByKey(SPAN_KEYS.AI_TOOL_CALL_NAME),
            groupByKey(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME),
            groupByKey(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID),
          ],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'toolErrors',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...baseFilters,
              {
                key: { key: SPAN_KEYS.HAS_ERROR },
                op: OPERATORS.EQUALS,
                value: true,
              },
            ])
          ),
          groupBy: [groupByKey(SPAN_KEYS.AI_TOOL_CALL_NAME)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildUniqueToolServersPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.NAME },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: 'uniqueServers',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [
            groupByKey(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME),
            groupByKey(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID),
          ],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, ORDER_DIRECTIONS.ASC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildUniqueToolNamesPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.NAME },
        op: OPERATORS.EQUALS,
        value: SPAN_NAMES.AI_TOOL_CALL,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_TYPE },
        op: OPERATORS.EQUALS,
        value: AI_TOOL_TYPES.MCP,
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_NAME },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AI_TOOL_CALL_NAME },
        op: OPERATORS.NOT_EQUALS,
        value: UNKNOWN_VALUE,
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: 'uniqueTools',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [groupByKey(SPAN_KEYS.AI_TOOL_CALL_NAME)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.AI_TOOL_CALL_NAME, ORDER_DIRECTIONS.ASC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
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
      key: { key: SPAN_KEYS.TENANT_ID },
      op: OPERATORS.EQUALS,
      value: this.tenantId,
    };

    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const projectFilters = buildProjectFilters();

    const conversationBaseItems = [
      tenantFilter,
      ...projectFilters,
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: 'totalConversations',
          aggregations: [aggregation(`count_distinct(${SPAN_KEYS.CONVERSATION_ID})`)],
          filter: filterExpr(buildFilterExpression(conversationBaseItems)),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'totalUserMessages',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.MESSAGE_CONTENT },
                op: OPERATORS.EXISTS,
                value: '',
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'totalTriggerInvocations',
          aggregations: [aggregation(`count_distinct(${SPAN_KEYS.TRIGGER_INVOCATION_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              tenantFilter,
              ...projectFilters,
              {
                key: { key: SPAN_KEYS.INVOCATION_TYPE },
                op: OPERATORS.EQUALS,
                value: 'trigger',
              },
              {
                key: { key: SPAN_KEYS.TRIGGER_INVOCATION_ID },
                op: OPERATORS.EXISTS,
                value: '',
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'totalSlackMessages',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.MESSAGE_CONTENT },
                op: OPERATORS.EXISTS,
                value: '',
              },
              {
                key: { key: SPAN_KEYS.INVOCATION_TYPE },
                op: OPERATORS.EQUALS,
                value: 'slack',
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'totalAICalls',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.AI_OPERATION_ID },
                op: OPERATORS.IN,
                value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'totalMCPCalls',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.NAME },
                op: OPERATORS.EQUALS,
                value: SPAN_NAMES.AI_TOOL_CALL,
              },
              {
                key: { key: SPAN_KEYS.AI_TOOL_TYPE },
                op: OPERATORS.EQUALS,
                value: AI_TOOL_TYPES.MCP,
              },
            ])
          ),
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
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
            key: { key: SPAN_KEYS.PROJECT_ID },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const items: any[] = [
      {
        key: { key: SPAN_KEYS.TENANT_ID },
        op: OPERATORS.EQUALS,
        value: this.tenantId,
      },
      ...buildProjectFilters(),
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: QUERY_EXPRESSIONS.LAST_ACTIVITY,
          aggregations: [aggregation(`min(${SPAN_KEYS.TIMESTAMP})`)],
          filter: filterExpr(buildFilterExpression(items)),
          groupBy: [groupByKey(SPAN_KEYS.CONVERSATION_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          order: [orderBy(SPAN_KEYS.TIMESTAMP, ORDER_DIRECTIONS.DESC)],
          offset: QUERY_DEFAULTS.OFFSET,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildStatsByProjectPayload(start: number, end: number, projectIds?: string[]) {
    const tenantFilter = {
      key: { key: SPAN_KEYS.TENANT_ID },
      op: OPERATORS.EQUALS,
      value: this.tenantId,
    };

    const buildProjectFilters = (): any[] => {
      if (projectIds && projectIds.length > 0) {
        return [
          {
            key: { key: SPAN_KEYS.PROJECT_ID },
            op: OPERATORS.IN,
            value: projectIds,
          },
        ];
      }
      return [
        {
          key: { key: SPAN_KEYS.PROJECT_ID },
          op: OPERATORS.EXISTS,
          value: '',
        },
      ];
    };

    const projectFilters = buildProjectFilters();

    const conversationBaseItems = [
      tenantFilter,
      ...projectFilters,
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
    ];

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        v5BuilderQuery({
          name: 'conversationsByProject',
          aggregations: [aggregation(`count_distinct(${SPAN_KEYS.CONVERSATION_ID})`)],
          filter: filterExpr(buildFilterExpression(conversationBaseItems)),
          groupBy: [groupByKey(SPAN_KEYS.PROJECT_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'aiCallsByProject',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.AI_OPERATION_ID },
                op: OPERATORS.IN,
                value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
              },
            ])
          ),
          groupBy: [groupByKey(SPAN_KEYS.PROJECT_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
        v5BuilderQuery({
          name: 'mcpCallsByProject',
          aggregations: [aggregation(`count(${SPAN_KEYS.SPAN_ID})`)],
          filter: filterExpr(
            buildFilterExpression([
              ...conversationBaseItems,
              {
                key: { key: SPAN_KEYS.NAME },
                op: OPERATORS.EQUALS,
                value: SPAN_NAMES.AI_TOOL_CALL,
              },
              {
                key: { key: SPAN_KEYS.AI_TOOL_TYPE },
                op: OPERATORS.EQUALS,
                value: AI_TOOL_TYPES.MCP,
              },
            ])
          ),
          groupBy: [groupByKey(SPAN_KEYS.PROJECT_ID)],
          stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
          limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
        }),
      ],
    });
  }

  private buildTokenUsagePayload(start: number, end: number, projectId?: string) {
    const baseFilters = [
      {
        key: { key: SPAN_KEYS.AI_OPERATION_ID },
        op: OPERATORS.IN,
        value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
      },
      {
        key: { key: SPAN_KEYS.CONVERSATION_ID },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(projectId
        ? [
            {
              key: { key: SPAN_KEYS.PROJECT_ID },
              op: OPERATORS.EQUALS,
              value: projectId,
            },
          ]
        : []),
    ];

    const filterStr = buildFilterExpression(baseFilters);

    const buildQuery = (name: string, aggregateKey: string, groupByField: string) =>
      v5BuilderQuery({
        name,
        aggregations: [aggregation(`sum(${aggregateKey})`)],
        filter: filterExpr(filterStr),
        groupBy: [groupByKey(groupByField)],
        stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
        limit: QUERY_DEFAULTS.LIMIT_UNLIMITED,
      });

    return v5Payload({
      start,
      end,
      requestType: V5_REQUEST_TYPES.SCALAR,
      queries: [
        buildQuery('inputTokensByModel', SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, SPAN_KEYS.AI_MODEL_ID),
        buildQuery('outputTokensByModel', SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, SPAN_KEYS.AI_MODEL_ID),
        buildQuery('inputTokensByAgent', SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, SPAN_KEYS.AGENT_ID),
        buildQuery('outputTokensByAgent', SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, SPAN_KEYS.AGENT_ID),
        buildQuery('inputTokensByProject', SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, SPAN_KEYS.PROJECT_ID),
        buildQuery('outputTokensByProject', SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, SPAN_KEYS.PROJECT_ID),
      ],
    });
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
