import axios from 'axios';
import axiosRetry from 'axios-retry';
import {
  AI_OPERATIONS,
  AI_TOOL_TYPES,
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

const byFirstActivity = (a: number = 0, b: number = 0) => b - a;

type Series = {
  labels?: Record<string, string>;
  values?: Array<{ value?: string }>;
};

const countFromSeries = (s: Series) =>
  parseInt(s.labels?.value ?? s.values?.[0]?.value ?? '0', 10) || 0;
const numberFromSeries = (s: Series) => Number(s.labels?.value ?? s.values?.[0]?.value ?? 0) || 0;

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

const T = 'signoz_traces.distributed_signoz_index_v3';
const TS = `timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
    AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}`;

function esc(v: string): string {
  return v.replace(/'/g, "''");
}

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

  // --- Helpers to read SigNoz response
  private extractSeries(resp: any, name: string): Series[] {
    return resp?.data?.result?.find((r: any) => r?.queryName === name)?.series ?? [];
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
    const toolsSeries = this.extractSeries(resp, 'tools');
    const lastActivitySeries = this.extractSeries(resp, 'lastActivity');
    const metadataSeries = this.extractSeries(resp, 'conversationMetadata');
    const spansWithErrorsSeries = this.extractSeries(resp, 'spansWithErrors');
    const userMessagesSeries = this.extractSeries(resp, 'userMessages');

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

    const firstSeen = new Map<string, number>();
    for (const s of lastActivitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      firstSeen.set(id, numberFromSeries(s));
    }

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

    const statsMap = new Map(stats.map((s) => [s.conversationId, s]));
    const orderedStats = conversationIds
      .map((id) => statsMap.get(id))
      .filter((s): s is ConversationStats => s !== undefined);

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

      const pageSeries = this.extractSeries(paginationResponse, 'pageConversations');
      const conversationIds = pageSeries
        .map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID])
        .filter(Boolean) as string[];

      const totalSeries = this.extractSeries(paginationResponse, 'totalConversations');
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

    const activitySeries = this.extractSeries(consolidatedResp, 'pageConversations');
    const activityMap = new Map<string, number>();
    for (const s of activitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      activityMap.set(id, numberFromSeries(s));
    }

    let conversationIds = Array.from(activityMap.keys());

    if (hasSpanFilters) {
      const filteredSeries = this.extractSeries(consolidatedResp, 'filteredConversations');
      const filteredIds = new Set(
        filteredSeries.map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID]).filter(Boolean) as string[]
      );
      conversationIds = conversationIds.filter((id) => filteredIds.has(id));
    }

    if (hasSearchQuery) {
      const metadataSeries = this.extractSeries(consolidatedResp, 'conversationMetadata');
      const metadataMap = new Map<string, { agentId: string; conversationId: string }>();
      for (const s of metadataSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        const agentIdValue = s.labels?.[SPAN_KEYS.AGENT_ID];
        if (!id) continue;
        metadataMap.set(id, { agentId: agentIdValue ?? '', conversationId: id });
      }

      const userMessagesSeries = this.extractSeries(consolidatedResp, 'userMessages');
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

      const tokensByModelSeries = this.extractSeries(resp, 'tokensByModel');
      const tokensByAgentSeries = this.extractSeries(resp, 'tokensByAgent');
      const tokensByProjectSeries = this.extractSeries(resp, 'tokensByProject');

      const modelStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of tokensByModelSeries) {
        const modelId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const input = Number(s.labels?.input_tokens ?? 0) || 0;
        const output = Number(s.labels?.output_tokens ?? 0) || 0;
        const existing = modelStats.get(modelId) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += input;
        existing.outputTokens += output;
        modelStats.set(modelId, existing);
      }

      const agentStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of tokensByAgentSeries) {
        const aid = s.labels?.[SPAN_KEYS.AGENT_ID] || UNKNOWN_VALUE;
        const input = Number(s.labels?.input_tokens ?? 0) || 0;
        const output = Number(s.labels?.output_tokens ?? 0) || 0;
        const existing = agentStats.get(aid) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += input;
        existing.outputTokens += output;
        agentStats.set(aid, existing);
      }

      const projectStats = new Map<string, { inputTokens: number; outputTokens: number }>();
      for (const s of tokensByProjectSeries) {
        const pId = s.labels?.[SPAN_KEYS.PROJECT_ID] || UNKNOWN_VALUE;
        const input = Number(s.labels?.input_tokens ?? 0) || 0;
        const output = Number(s.labels?.output_tokens ?? 0) || 0;
        const existing = projectStats.get(pId) || { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += input;
        existing.outputTokens += output;
        projectStats.set(pId, existing);
      }

      const byModel = [...modelStats.entries()]
        .map(([modelId, stats]) => ({
          modelId,
          inputTokens: stats.inputTokens,
          outputTokens: stats.outputTokens,
          totalTokens: stats.inputTokens + stats.outputTokens,
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens);

      const byAgent = [...agentStats.entries()]
        .map(([aid, stats]) => ({
          agentId: aid,
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
      const agentFilter =
        agentId && agentId !== 'all' ? `AND attributes_string['agent.id'] = '${esc(agentId)}'` : '';
      const projectFilter = projectId
        ? `AND attributes_string['project.id'] = '${esc(projectId)}'`
        : '';

      const payload = this.chPayload(startTime, endTime, {
        spanNames: `
          SELECT now() as ts, name
          FROM ${T}
          WHERE name != ''
            AND attributes_string['tenant.id'] = {{.tenant_id}}
            ${agentFilter}
            ${projectFilter}
            AND ${TS}
          GROUP BY name, ts
          ORDER BY name ASC
          LIMIT 1000
        `,
      });

      const resp = await this.makeRequest(payload);
      const series = this.extractSeries(resp, 'spanNames');
      const names = new Set<string>();
      for (const s of series) {
        const n = s.labels?.name;
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

  // ---------- ClickHouse SQL payload helpers

  private chPayload(
    start: number,
    end: number,
    queries: Record<string, string>,
    projectId?: string
  ) {
    return {
      start,
      end,
      step: 60,
      variables: {},
      compositeQuery: {
        queryType: 'clickhouse_sql',
        panelType: 'table',
        chQueries: Object.fromEntries(
          Object.entries(queries).map(([name, query]) => [name, { query }])
        ),
      },
      projectId,
    };
  }

  private baseWhere(projectId?: string, agentId?: string): string {
    const parts = [`attributes_string['tenant.id'] = {{.tenant_id}}`];
    if (projectId) parts.push(`attributes_string['project.id'] = '${esc(projectId)}'`);
    if (agentId && agentId !== 'all')
      parts.push(`attributes_string['agent.id'] = '${esc(agentId)}'`);
    parts.push(TS);
    return parts.join('\n    AND ');
  }

  private convWhere(projectId?: string, agentId?: string): string {
    return `attributes_string['conversation.id'] != ''
    AND ${this.baseWhere(projectId, agentId)}`;
  }

  private buildAttrFilterSql(filters?: SpanFilterOptions): string {
    if (!filters) return '';
    const parts: string[] = [];

    if (filters.spanName) {
      parts.push(`name = '${esc(filters.spanName)}'`);
    }

    for (const attr of filters.attributes ?? []) {
      const op = attr.operator ?? '=';
      const val = attr.value;
      const isNumeric = /^-?\d+(\.\d+)?$/.test(val);
      const isBool = val === 'true' || val === 'false';

      if (op === 'exists') {
        parts.push(`mapContains(attributes_string, '${esc(attr.key)}')`);
        continue;
      }
      if (op === 'nexists') {
        parts.push(`NOT mapContains(attributes_string, '${esc(attr.key)}')`);
        continue;
      }

      let col: string;
      if (isBool) col = `attributes_bool['${esc(attr.key)}']`;
      else if (isNumeric) col = `attributes_number['${esc(attr.key)}']`;
      else col = `attributes_string['${esc(attr.key)}']`;

      const sqlVal = isNumeric || isBool ? val : `'${esc(val)}'`;

      switch (op) {
        case '=':
        case '!=':
        case '<':
        case '>':
        case '<=':
        case '>=':
          parts.push(`${col} ${op} ${sqlVal}`);
          break;
        case 'contains':
          parts.push(`${col} LIKE '%${esc(val)}%'`);
          break;
        case 'ncontains':
          parts.push(`${col} NOT LIKE '%${esc(val)}%'`);
          break;
        case 'like':
          parts.push(`${col} LIKE '${esc(val)}'`);
          break;
        case 'nlike':
          parts.push(`${col} NOT LIKE '${esc(val)}'`);
          break;
        case 'regex':
          parts.push(`match(${col}, '${esc(val)}')`);
          break;
        case 'nregex':
          parts.push(`NOT match(${col}, '${esc(val)}')`);
          break;
        default:
          parts.push(`${col} = ${sqlVal}`);
      }
    }

    return parts.length > 0 ? `AND ${parts.join('\n    AND ')}` : '';
  }

  // ---------- ClickHouse SQL payload builders

  private buildAgentModelBreakdownPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        agentModelCalls: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['ai.telemetry.functionId'] AS \`ai.telemetry.functionId\`,
          attributes_string['agent.id'] AS \`agent.id\`,
          attributes_string['ai.model.id'] AS \`ai.model.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${this.convWhere(projectId)}
        GROUP BY \`conversation.id\`, \`ai.telemetry.functionId\`, \`agent.id\`, \`ai.model.id\`, ts
      `,
      },
      projectId
    );
  }

  private buildModelBreakdownPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        modelCalls: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['ai.model.id'] AS \`ai.model.id\`,
          attributes_string['agent.id'] AS \`agent.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${this.convWhere(projectId)}
        GROUP BY \`conversation.id\`, \`ai.model.id\`, \`agent.id\`, ts
      `,
      },
      projectId
    );
  }

  private buildConversationActivityPayload(
    start: number,
    end: number,
    agentId?: string,
    projectId?: string
  ) {
    return this.chPayload(
      start,
      end,
      {
        lastActivity: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE ${this.convWhere(projectId, agentId)}
        GROUP BY \`conversation.id\`, ts
        ORDER BY value DESC
      `,
      },
      projectId
    );
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
    const paginationLimit = pagination && !includeSearchData ? pagination.limit : 100000;
    const paginationOffset =
      pagination && !includeSearchData ? (pagination.page - 1) * pagination.limit : 0;

    const queries: Record<string, string> = {
      pageConversations: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE ${this.convWhere(projectId, agentId)}
        GROUP BY \`conversation.id\`, ts
        ORDER BY value DESC
        LIMIT ${paginationLimit}
        OFFSET ${paginationOffset}
      `,
      totalConversations: `
        SELECT now() as ts,
          toFloat64(count(DISTINCT attributes_string['conversation.id'])) AS value
        FROM ${T}
        WHERE ${this.convWhere(projectId, agentId)}
      `,
      aggToolCallsByType: `
        SELECT now() as ts,
          attributes_string['ai.toolType'] AS \`ai.toolType\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND ${this.convWhere(projectId, agentId)}
        GROUP BY \`ai.toolType\`, ts
      `,
      aggAICalls: `
        SELECT now() as ts,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${this.convWhere(projectId, agentId)}
      `,
    };

    if (filters?.spanName || filters?.attributes?.length) {
      const attrFilter = this.buildAttrFilterSql(filters);
      queries.filteredConversations = `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND ${this.baseWhere(projectId)}
          ${attrFilter}
        GROUP BY \`conversation.id\`, ts
      `;
    }

    if (includeSearchData) {
      queries.conversationMetadata = `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['tenant.id'] AS \`tenant.id\`,
          attributes_string['agent.id'] AS \`agent.id\`,
          attributes_string['agent.name'] AS \`agent.name\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['tenant.id'] != ''
          AND attributes_string['agent.id'] != ''
          AND ${this.convWhere(projectId, agentId)}
        GROUP BY \`conversation.id\`, \`tenant.id\`, \`agent.id\`, \`agent.name\`, ts
      `;

      queries.userMessages = `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['message.content'] AS \`message.content\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE attributes_string['message.content'] != ''
          AND ${this.convWhere(projectId, agentId)}
        GROUP BY \`conversation.id\`, \`message.content\`, ts
        ORDER BY value ASC
      `;
    }

    return this.chPayload(start, end, queries, projectId);
  }

  private buildCombinedPayload(
    start: number,
    end: number,
    _filters?: SpanFilterOptions,
    projectId?: string,
    agentId?: string,
    conversationIds?: string[]
  ) {
    let convFilter: string;
    if (conversationIds && conversationIds.length > 0) {
      const inClause = conversationIds.map((id) => `'${esc(id)}'`).join(',');
      convFilter = `attributes_string['conversation.id'] IN (${inClause})`;
    } else {
      convFilter = `attributes_string['conversation.id'] IN (__CONVERSATION_IDS__)`;
    }

    const base = `${convFilter}
    AND ${this.baseWhere(projectId, agentId)}`;

    return this.chPayload(
      start,
      end,
      {
        tools: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['ai.toolCall.name'] AS \`ai.toolCall.name\`,
          attributes_string['mcp.tool.description'] AS \`mcp.tool.description\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND ${base}
        GROUP BY \`conversation.id\`, \`ai.toolCall.name\`, \`mcp.tool.description\`, ts
      `,

        conversationMetadata: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['tenant.id'] AS \`tenant.id\`,
          attributes_string['agent.id'] AS \`agent.id\`,
          attributes_string['agent.name'] AS \`agent.name\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['tenant.id'] != ''
          AND attributes_string['agent.id'] != ''
          AND ${base}
        GROUP BY \`conversation.id\`, \`tenant.id\`, \`agent.id\`, \`agent.name\`, ts
      `,

        lastActivity: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE ${base}
        GROUP BY \`conversation.id\`, ts
        ORDER BY value DESC
      `,

        spansWithErrors: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          name,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE has_error = true
          AND ${base}
        GROUP BY \`conversation.id\`, name, ts
      `,

        userMessages: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          attributes_string['message.content'] AS \`message.content\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE attributes_string['message.content'] != ''
          AND ${base}
        GROUP BY \`conversation.id\`, \`message.content\`, ts
        ORDER BY value ASC
      `,
      },
      projectId
    );
  }

  private buildUniqueAgentsPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        uniqueAgents: `
        SELECT now() as ts,
          attributes_string['agent.id'] AS \`agent.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['agent.id'] != ''
          AND attributes_string['agent.id'] != '${UNKNOWN_VALUE}'
          AND ${this.baseWhere(projectId)}
        GROUP BY \`agent.id\`, ts
        ORDER BY \`agent.id\` ASC
      `,
      },
      projectId
    );
  }

  private buildUniqueModelsPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        uniqueModels: `
        SELECT now() as ts,
          attributes_string['ai.model.id'] AS \`ai.model.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['ai.model.id'] != ''
          AND attributes_string['ai.model.id'] != '${UNKNOWN_VALUE}'
          AND ${this.baseWhere(projectId)}
        GROUP BY \`ai.model.id\`, ts
        ORDER BY \`ai.model.id\` ASC
      `,
      },
      projectId
    );
  }

  private buildToolBreakdownPayload(start: number, end: number, projectId?: string) {
    const toolBase = `name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND ${this.convWhere(projectId)}`;

    return this.chPayload(
      start,
      end,
      {
        toolCalls: `
        SELECT now() as ts,
          attributes_string['ai.toolCall.name'] AS \`ai.toolCall.name\`,
          attributes_string['ai.toolCall.mcpServerName'] AS \`ai.toolCall.mcpServerName\`,
          attributes_string['ai.toolCall.mcpServerId'] AS \`ai.toolCall.mcpServerId\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE ${toolBase}
        GROUP BY \`ai.toolCall.name\`, \`ai.toolCall.mcpServerName\`, \`ai.toolCall.mcpServerId\`, ts
      `,
        toolErrors: `
        SELECT now() as ts,
          attributes_string['ai.toolCall.name'] AS \`ai.toolCall.name\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE has_error = true
          AND ${toolBase}
        GROUP BY \`ai.toolCall.name\`, ts
      `,
      },
      projectId
    );
  }

  private buildUniqueToolServersPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        uniqueServers: `
        SELECT now() as ts,
          attributes_string['ai.toolCall.mcpServerName'] AS \`ai.toolCall.mcpServerName\`,
          attributes_string['ai.toolCall.mcpServerId'] AS \`ai.toolCall.mcpServerId\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND attributes_string['ai.toolCall.mcpServerName'] != ''
          AND attributes_string['ai.toolCall.mcpServerName'] != '${UNKNOWN_VALUE}'
          AND ${this.baseWhere(projectId)}
        GROUP BY \`ai.toolCall.mcpServerName\`, \`ai.toolCall.mcpServerId\`, ts
        ORDER BY \`ai.toolCall.mcpServerName\` ASC
      `,
      },
      projectId
    );
  }

  private buildUniqueToolNamesPayload(start: number, end: number, projectId?: string) {
    return this.chPayload(
      start,
      end,
      {
        uniqueTools: `
        SELECT now() as ts,
          attributes_string['ai.toolCall.name'] AS \`ai.toolCall.name\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND attributes_string['ai.toolCall.name'] != ''
          AND attributes_string['ai.toolCall.name'] != '${UNKNOWN_VALUE}'
          AND ${this.baseWhere(projectId)}
        GROUP BY \`ai.toolCall.name\`, ts
        ORDER BY \`ai.toolCall.name\` ASC
      `,
      },
      projectId
    );
  }

  private buildTokenUsagePayload(start: number, end: number, projectId?: string) {
    const tokenBase = `attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${this.convWhere(projectId)}`;

    return this.chPayload(
      start,
      end,
      {
        tokensByModel: `
        SELECT now() as ts,
          attributes_string['ai.model.id'] AS \`ai.model.id\`,
          toFloat64(sum(attributes_number['gen_ai.usage.input_tokens'])) AS input_tokens,
          toFloat64(sum(attributes_number['gen_ai.usage.output_tokens'])) AS output_tokens
        FROM ${T}
        WHERE ${tokenBase}
        GROUP BY \`ai.model.id\`, ts
      `,
        tokensByAgent: `
        SELECT now() as ts,
          attributes_string['agent.id'] AS \`agent.id\`,
          toFloat64(sum(attributes_number['gen_ai.usage.input_tokens'])) AS input_tokens,
          toFloat64(sum(attributes_number['gen_ai.usage.output_tokens'])) AS output_tokens
        FROM ${T}
        WHERE ${tokenBase}
        GROUP BY \`agent.id\`, ts
      `,
        tokensByProject: `
        SELECT now() as ts,
          attributes_string['project.id'] AS \`project.id\`,
          toFloat64(sum(attributes_number['gen_ai.usage.input_tokens'])) AS input_tokens,
          toFloat64(sum(attributes_number['gen_ai.usage.output_tokens'])) AS output_tokens
        FROM ${T}
        WHERE ${tokenBase}
        GROUP BY \`project.id\`, ts
      `,
      },
      projectId
    );
  }

  // ============= Project Overview Stats Methods =============

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
      const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined;
      const payload = this.buildProjectOverviewStatsPayload(startTime, endTime, projectIds);
      const resp = await this.makeRequest(payload, singleProjectId);

      const totalConversations = countFromSeries(
        this.extractSeries(resp, 'totalConversations')[0] ||
          ({ values: [{ value: '0' }] } as Series)
      );
      const totalUserMessages = countFromSeries(
        this.extractSeries(resp, 'totalUserMessages')[0] || ({ values: [{ value: '0' }] } as Series)
      );
      const totalTriggerInvocations = countFromSeries(
        this.extractSeries(resp, 'totalTriggerInvocations')[0] ||
          ({ values: [{ value: '0' }] } as Series)
      );
      const totalSlackMessages = countFromSeries(
        this.extractSeries(resp, 'totalSlackMessages')[0] ||
          ({ values: [{ value: '0' }] } as Series)
      );
      const totalAICalls = countFromSeries(
        this.extractSeries(resp, 'totalAICalls')[0] || ({ values: [{ value: '0' }] } as Series)
      );
      const totalMCPCalls = countFromSeries(
        this.extractSeries(resp, 'totalMCPCalls')[0] || ({ values: [{ value: '0' }] } as Series)
      );

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
        const pid = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!pid) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(pid) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalConversations = count;
        projectStats.set(pid, existing);
      }

      for (const s of aiCallsSeries) {
        const pid = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!pid) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(pid) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalAICalls = count;
        projectStats.set(pid, existing);
      }

      for (const s of mcpCallsSeries) {
        const pid = s.labels?.[SPAN_KEYS.PROJECT_ID];
        if (!pid) continue;
        const count = countFromSeries(s);
        const existing = projectStats.get(pid) || {
          totalConversations: 0,
          totalAICalls: 0,
          totalMCPCalls: 0,
        };
        existing.totalMCPCalls = count;
        projectStats.set(pid, existing);
      }

      return Array.from(projectStats.entries())
        .map(([pid, stats]) => ({ projectId: pid, ...stats }))
        .sort((a, b) => b.totalConversations - a.totalConversations);
    } catch (e) {
      console.error('getStatsByProject error:', e);
      return [];
    }
  }

  // ============= Project Overview Payload Builders =============

  private projectFilter(projectIds?: string[]): string {
    if (projectIds && projectIds.length > 0) {
      const inClause = projectIds.map((id) => `'${esc(id)}'`).join(',');
      return `attributes_string['project.id'] IN (${inClause})`;
    }
    return `attributes_string['project.id'] != ''`;
  }

  private buildProjectOverviewStatsPayload(start: number, end: number, projectIds?: string[]) {
    const pf = this.projectFilter(projectIds);
    const base = `attributes_string['tenant.id'] = {{.tenant_id}}
          AND ${pf}
          AND ${TS}`;

    return this.chPayload(start, end, {
      totalConversations: `
        SELECT now() as ts,
          toFloat64(count(DISTINCT attributes_string['conversation.id'])) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND ${base}
      `,
      totalUserMessages: `
        SELECT now() as ts,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND attributes_string['message.content'] != ''
          AND ${base}
      `,
      totalTriggerInvocations: `
        SELECT now() as ts,
          toFloat64(count(DISTINCT attributes_string['trigger.invocation.id'])) AS value
        FROM ${T}
        WHERE attributes_string['invocation.type'] = 'trigger'
          AND attributes_string['trigger.invocation.id'] != ''
          AND ${base}
      `,
      totalSlackMessages: `
        SELECT now() as ts,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND attributes_string['message.content'] != ''
          AND attributes_string['invocation.type'] = 'slack'
          AND ${base}
      `,
      totalAICalls: `
        SELECT now() as ts,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${base}
      `,
      totalMCPCalls: `
        SELECT now() as ts,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND ${base}
      `,
    });
  }

  private buildProjectConversationActivityPayload(
    start: number,
    end: number,
    projectIds?: string[]
  ) {
    const pf = this.projectFilter(projectIds);

    return this.chPayload(start, end, {
      lastActivity: `
        SELECT now() as ts,
          attributes_string['conversation.id'] AS \`conversation.id\`,
          toUnixTimestamp64Nano(min(timestamp)) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND attributes_string['tenant.id'] = {{.tenant_id}}
          AND ${pf}
          AND ${TS}
        GROUP BY \`conversation.id\`, ts
        ORDER BY value DESC
      `,
    });
  }

  private buildStatsByProjectPayload(start: number, end: number, projectIds?: string[]) {
    const pf = this.projectFilter(projectIds);
    const base = `attributes_string['tenant.id'] = {{.tenant_id}}
          AND ${pf}
          AND ${TS}`;

    return this.chPayload(start, end, {
      conversationsByProject: `
        SELECT now() as ts,
          attributes_string['project.id'] AS \`project.id\`,
          toFloat64(count(DISTINCT attributes_string['conversation.id'])) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND ${base}
        GROUP BY \`project.id\`, ts
      `,
      aiCallsByProject: `
        SELECT now() as ts,
          attributes_string['project.id'] AS \`project.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND attributes_string['ai.operationId'] IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')
          AND ${base}
        GROUP BY \`project.id\`, ts
      `,
      mcpCallsByProject: `
        SELECT now() as ts,
          attributes_string['project.id'] AS \`project.id\`,
          toFloat64(count()) AS value
        FROM ${T}
        WHERE attributes_string['conversation.id'] != ''
          AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = '${AI_TOOL_TYPES.MCP}'
          AND ${base}
        GROUP BY \`project.id\`, ts
      `,
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
