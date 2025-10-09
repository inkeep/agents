import axios from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import {
  AGGREGATE_OPERATORS,
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  DATA_SOURCES,
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
  graphId: string;
  graphName: string;
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

    // Return as validated string
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
  private async makeRequest<T = any>(payload: any): Promise<T> {
    const response = await axios.post<T>('/api/signoz', payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
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
    filters?: SpanFilterOptions,
    projectId?: string,
    pagination?: { page: number; limit: number },
    searchQuery?: string,
    graphId?: string
  ): Promise<ConversationStats[] | PaginatedConversationStats> {
    try {
      const payload = this.buildCombinedPayload(startTime, endTime, filters, projectId, graphId);
      const resp = await this.makeRequest(payload);

      const toolsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TOOLS);
      const transfersSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.TRANSFERS);
      const delegationsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.DELEGATIONS);
      const aiCallsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.AI_CALLS);
      const lastActivitySeries = this.extractSeries(resp, QUERY_EXPRESSIONS.LAST_ACTIVITY);
      const metadataSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.CONVERSATION_METADATA);
      const contextErrorsSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.CONTEXT_ERRORS);
      const agentGenerationErrorsSeries = this.extractSeries(
        resp,
        QUERY_EXPRESSIONS.AGENT_GENERATION_ERRORS
      );
      const userMessagesSeries = this.extractSeries(resp, QUERY_EXPRESSIONS.USER_MESSAGES);

      // metadata map
      const metaByConv = new Map<
        string,
        { tenantId: string; graphId: string; graphName: string }
      >();
      for (const s of metadataSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        if (!id) continue;
        metaByConv.set(id, {
          tenantId: s.labels?.[SPAN_KEYS.TENANT_ID] ?? UNKNOWN_VALUE,
          graphId: s.labels?.[SPAN_KEYS.GRAPH_ID] ?? UNKNOWN_VALUE,
          graphName: s.labels?.[SPAN_KEYS.GRAPH_NAME] ?? UNKNOWN_VALUE,
        });
      }

      // first seen map
      const firstSeen = new Map<string, number>();
      for (const s of lastActivitySeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        if (!id) continue;
        firstSeen.set(id, numberFromSeries(s));
      }

      // first user message per conversation (min timestamp already grouped)
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
      let stats = this.toConversationStats(
        toolsSeries,
        transfersSeries,
        delegationsSeries,
        aiCallsSeries,
        metaByConv,
        contextErrorsSeries,
        agentGenerationErrorsSeries,
        firstMsgByConv
      );

      // optional secondary filter pass via span filters
      if (filters?.spanName || filters?.attributes?.length) {
        stats = await this.applySpanFilters(stats, startTime, endTime, filters, projectId);
      }

      // search filter
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase().trim();
        stats = stats.filter(
          (s) =>
            s.firstUserMessage?.toLowerCase().includes(q) ||
            s.conversationId.toLowerCase().includes(q) ||
            s.graphId.toLowerCase().includes(q)
        );
      }

      // sort by first activity
      stats.sort((a, b) =>
        byFirstActivity(firstSeen.get(a.conversationId), firstSeen.get(b.conversationId))
      );

      if (!pagination) return stats;

      const { page, limit } = pagination;
      const total = stats.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const data = stats.slice(start, start + limit);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (e) {
      console.error('getConversationStats error:', e);
      return [];
    }
  }

  async getAICallsByGraph(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildCombinedPayload(startTime, endTime, undefined, projectId)
      );
      const series = this.extractSeries(resp, QUERY_EXPRESSIONS.AI_CALLS);
      const totals = new Map<string, number>();
      for (const s of series) {
        const graphId = s.labels?.[SPAN_KEYS.GRAPH_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        if (count) totals.set(graphId, (totals.get(graphId) || 0) + count);
      }
      return [...totals]
        .map(([graphId, totalCalls]) => ({ graphId, totalCalls }))
        .sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getAICallsByGraph error:', e);
      return [];
    }
  }

  async getAICallsByAgent(
    startTime: number,
    endTime: number,
    graphId?: string,
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
          graphId: string;
          modelId: string;
          totalCalls: number;
        }
      >();

      for (const s of series) {
        const agent = s.labels?.[SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID] || UNKNOWN_VALUE;
        const gId = s.labels?.[SPAN_KEYS.GRAPH_ID] || UNKNOWN_VALUE;
        const mId = s.labels?.[SPAN_KEYS.AI_MODEL_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);

        if (!count) continue;
        if (graphId && graphId !== 'all' && gId !== graphId) continue;
        if (modelId && modelId !== 'all' && mId !== modelId) continue;

        const key = `${agent}::${gId}::${mId}`;
        const row = acc.get(key) || {
          subAgentId: agent,
          graphId: gId,
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
    graphId?: string,
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
        const gId = s.labels?.[SPAN_KEYS.GRAPH_ID] || UNKNOWN_VALUE;
        const count = countFromSeries(s);
        if (!count) continue;
        if (graphId && graphId !== 'all' && gId !== graphId) continue;
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

  async getUniqueGraphs(startTime: number, endTime: number, projectId?: string) {
    try {
      const resp = await this.makeRequest(
        this.buildUniqueGraphsPayload(startTime, endTime, projectId)
      );
      const series = this.extractSeries(resp, 'uniqueGraphs');
      const graphs = series
        .map((s) => s.labels?.[SPAN_KEYS.GRAPH_ID])
        .filter((id): id is string => Boolean(id) && id !== UNKNOWN_VALUE)
        .sort();
      return [...new Set(graphs)];
    } catch (e) {
      console.error('getUniqueGraphs error:', e);
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

  async getConversationsPerDay(
    startTime: number,
    endTime: number,
    graphId?: string,
    projectId?: string
  ) {
    try {
      // 1) which conversations exist?
      const metaResp = await this.makeRequest(
        this.buildConversationMetadataPayload(startTime, endTime, graphId, projectId)
      );
      const metaSeries = this.extractSeries(metaResp, 'conversationMetadata');

      // 2) if any, fetch their last activity
      const activitySeries = metaSeries.length
        ? this.extractSeries(
            await this.makeRequest(
              this.buildConversationActivityPayload(startTime, endTime, graphId, projectId)
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
      console.error('getConversationsPerDay error:', e);
      return datesRange(startTime, endTime).map((date) => ({ date, count: 0 }));
    }
  }

  async getAggregateStats(
    startTime: number,
    endTime: number,
    filters?: SpanFilterOptions,
    projectId?: string,
    graphId?: string
  ) {
    try {
      const resp = await this.makeRequest(
        this.buildCombinedPayload(startTime, endTime, filters, projectId, graphId)
      );

      const toolsSeries = this.extractSeries(resp, 'tools');
      const transfersSeries = this.extractSeries(resp, 'transfers');
      const delegationsSeries = this.extractSeries(resp, 'delegations');
      const aiCallsSeries = this.extractSeries(resp, 'aiCalls');
      const metadataSeries = this.extractSeries(resp, 'conversationMetadata');
      const contextErrSeries = this.extractSeries(resp, 'contextErrors');
      const agentGenErrSeries = this.extractSeries(resp, 'agentGenerationErrors');

      const metaByConv = new Map<
        string,
        { tenantId: string; graphId: string; graphName: string }
      >();
      for (const s of metadataSeries) {
        const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
        if (!id) continue;
        metaByConv.set(id, {
          tenantId: s.labels?.[SPAN_KEYS.TENANT_ID] ?? UNKNOWN_VALUE,
          graphId: s.labels?.[SPAN_KEYS.GRAPH_ID] ?? UNKNOWN_VALUE,
          graphName: s.labels?.[SPAN_KEYS.GRAPH_NAME] ?? UNKNOWN_VALUE,
        });
      }

      let stats = this.toConversationStats(
        toolsSeries,
        transfersSeries,
        delegationsSeries,
        aiCallsSeries,
        metaByConv,
        contextErrSeries,
        agentGenErrSeries,
        new Map<string, { content: string; timestamp: number }>()
      );

      if (filters?.spanName || filters?.attributes?.length) {
        stats = await this.applySpanFilters(stats, startTime, endTime, filters, projectId);
      }

      return {
        totalToolCalls: stats.reduce((s, r) => s + r.totalToolCalls, 0),
        totalTransfers: stats.reduce((s, r) => s + r.totalTransfers, 0),
        totalDelegations: stats.reduce((s, r) => s + r.totalDelegations, 0),
        totalConversations: stats.length,
        totalAICalls: stats.reduce((s, r) => s + r.totalAICalls, 0),
      };
    } catch (e) {
      console.error('getAggregateStats error:', e);
      return {
        totalToolCalls: 0,
        totalTransfers: 0,
        totalDelegations: 0,
        totalConversations: 0,
        totalAICalls: 0,
      };
    }
  }

  async getAvailableSpanNames(
    startTime: number,
    endTime: number,
    graphId?: string,
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
      if (graphId && graphId !== 'all') {
        filterItems.push({
          key: { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op: OPERATORS.EQUALS,
          value: graphId,
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
              limit: QUERY_DEFAULTS.LIMIT_1000,
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
    metaByConv: Map<string, { tenantId: string; graphId: string; graphName: string }>,
    contextErrSeries: Series[],
    agentGenErrSeries: Series[],
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
      const from = s.labels?.[SPAN_KEYS.TRANSFER_FROM_AGENT_ID];
      const to = s.labels?.[SPAN_KEYS.TRANSFER_TO_AGENT_ID];
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
      const from = s.labels?.[SPAN_KEYS.DELEGATION_FROM_AGENT_ID];
      const to = s.labels?.[SPAN_KEYS.DELEGATION_TO_AGENT_ID];
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

    // errors
    for (const s of [...contextErrSeries, ...agentGenErrSeries]) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (!id) continue;
      const count = countFromSeries(s);
      if (!count) continue;
      ensure(id).totalErrors += count;
    }

    // finalize
    const out: ConversationStats[] = [];
    const allConvIds = new Set<string>([...byConv.keys(), ...metaByConv.keys()]);
    for (const id of allConvIds) {
      const acc = byConv.get(id) || ensure(id);
      const meta = metaByConv.get(id) || {
        tenantId: UNKNOWN_VALUE,
        graphId: UNKNOWN_VALUE,
        graphName: UNKNOWN_VALUE,
      };
      out.push({
        conversationId: id,
        tenantId: meta.tenantId,
        graphId: meta.graphId,
        graphName: meta.graphName || '',
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

  private async applySpanFilters(
    stats: ConversationStats[],
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions,
    projectId?: string
  ) {
    try {
      const resp = await this.makeRequest(
        this.buildFilteredConversationsPayload(startTime, endTime, filters, projectId)
      );
      const series = this.extractSeries(resp, 'filteredConversations');
      const allowed = new Set<string>(
        series.map((s) => s.labels?.[SPAN_KEYS.CONVERSATION_ID]).filter(Boolean) as string[]
      );
      return stats.filter((s) => allowed.has(s.conversationId));
    } catch (e) {
      console.error('applySpanFilters error:', e);
      return stats;
    }
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
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_OPERATIONS.GENERATE_TEXT,
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
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              {
                key: SPAN_KEYS.AI_MODEL_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_OPERATIONS.GENERATE_TEXT,
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
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.MODEL_CALLS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_ZERO,
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
    graphId?: string,
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
      ...(graphId && graphId !== 'all'
        ? [
            {
              key: {
                key: SPAN_KEYS.GRAPH_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: graphId,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildConversationMetadataPayload(
    start: number,
    end: number,
    graphId?: string,
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
      {
        key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      ...(graphId && graphId !== 'all'
        ? [
            {
              key: {
                key: SPAN_KEYS.GRAPH_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: graphId,
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
              {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.GRAPH_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildFilteredConversationsPayload(
    start: number,
    end: number,
    filters: SpanFilterOptions,
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
    ];

    if (filters.spanName) {
      items.push({
        key: { key: SPAN_KEYS.NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN },
        op: OPERATORS.EQUALS,
        value: filters.spanName,
      });
    }

    // Attribute filters — pass typed booleans/numbers where possible
    for (const attr of filters.attributes ?? []) {
      const op = attr.operator ?? OPERATORS.EQUALS;
      let value: any = asTypedFilterValue(attr.value);
      let dataType: 'string' | 'int64' | 'float64' | 'bool' = 'string';
      if (typeof value === 'boolean') dataType = 'bool';
      else if (typeof value === 'number') dataType = Number.isInteger(value) ? 'int64' : 'float64';

      // exists/nexists ignore value
      if (op === OPERATORS.EXISTS || op === OPERATORS.NOT_EXISTS) {
        items.push({
          key: { key: attr.key, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          op,
          value: '',
        });
        continue;
      }

      // LIKE operators add wildcards if absent
      if (
        (op === OPERATORS.LIKE || op === OPERATORS.NOT_LIKE) &&
        typeof value === 'string' &&
        !value.includes('%')
      ) {
        value = `%${value}%`;
      }

      // For numeric equality, keep exact-match pair (>= & <=) for robustness
      if ((dataType === 'int64' || dataType === 'float64') && op === OPERATORS.EQUALS) {
        const config =
          dataType === 'int64' ? QUERY_FIELD_CONFIGS.INT64_TAG : QUERY_FIELD_CONFIGS.FLOAT64_TAG;
        items.push({
          key: { key: attr.key, ...config },
          op: OPERATORS.GREATER_THAN_OR_EQUAL,
          value,
        });
        items.push({
          key: { key: attr.key, ...config },
          op: OPERATORS.LESS_THAN_OR_EQUAL,
          value,
        });
      } else {
        const config =
          dataType === 'string'
            ? QUERY_FIELD_CONFIGS.STRING_TAG
            : dataType === 'int64'
              ? QUERY_FIELD_CONFIGS.INT64_TAG
              : dataType === 'float64'
                ? QUERY_FIELD_CONFIGS.FLOAT64_TAG
                : QUERY_FIELD_CONFIGS.BOOL_TAG;
        items.push({ key: { key: attr.key, ...config }, op, value });
      }
    }

    if (projectId) {
      items.push({
        key: { key: SPAN_KEYS.PROJECT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EQUALS,
        value: projectId,
      });
    }

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables: {},
      compositeQuery: {
        queryType: QUERY_TYPES.BUILDER,
        panelType: PANEL_TYPES.TABLE,
        builderQueries: {
          filteredConversations: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.FILTERED_CONVERSATIONS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },
        },
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
    graphId?: string
  ) {
    const withProjectAndGraph = (items: any[]) => {
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
      if (graphId) {
        filtered = [
          ...filtered,
          {
            key: {
              key: SPAN_KEYS.GRAPH_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            op: OPERATORS.EQUALS,
            value: graphId,
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
              items: withProjectAndGraph([
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
                    key: SPAN_KEYS.CONVERSATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
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
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
                key: SPAN_KEYS.TRANSFER_FROM_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.TRANSFER_TO_AGENT_ID,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
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
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
                key: SPAN_KEYS.DELEGATION_FROM_AGENT_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              {
                key: SPAN_KEYS.DELEGATION_TO_AGENT_ID,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
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
                    key: SPAN_KEYS.GRAPH_ID,
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
              { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              { key: SPAN_KEYS.GRAPH_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            ],
            expression: QUERY_EXPRESSIONS.CONVERSATION_METADATA,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.AI_OPERATION_ID,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: AI_OPERATIONS.GENERATE_TEXT,
                },
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
              { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
              {
                key: 'ai.telemetry.functionId',
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
            ],
            expression: QUERY_EXPRESSIONS.LAST_ACTIVITY,
            reduceTo: REDUCE_OPERATIONS.MIN,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },

          contextErrors: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.CONTEXT_ERRORS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.NAME,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.CONTEXT_HANDLE,
                },
                {
                  key: {
                    key: SPAN_KEYS.HAS_ERROR,
                    ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: true,
                }, // real boolean
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
            ],
            expression: QUERY_EXPRESSIONS.CONTEXT_ERRORS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },

          agentGenerationErrors: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.AGENT_GENERATION_ERRORS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: {
              op: OPERATORS.AND,
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.NAME,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: SPAN_NAMES.AGENT_GENERATION,
                },
                {
                  key: {
                    key: SPAN_KEYS.HAS_ERROR,
                    ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
                  },
                  op: OPERATORS.EQUALS,
                  value: true,
                }, // real boolean
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
            ],
            expression: QUERY_EXPRESSIONS.AGENT_GENERATION_ERRORS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
              items: withProjectAndGraph([
                {
                  key: {
                    key: SPAN_KEYS.MESSAGE_CONTENT,
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
                  },
                  op: OPERATORS.EXISTS,
                  value: '',
                },
                {
                  key: {
                    key: SPAN_KEYS.CONVERSATION_ID,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }

  private buildUniqueGraphsPayload(start: number, end: number, projectId?: string) {
    const items: any[] = [
      {
        key: { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
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
          uniqueGraphs: {
            dataSource: DATA_SOURCES.TRACES,
            queryName: QUERY_EXPRESSIONS.UNIQUE_GRAPHS,
            aggregateOperator: AGGREGATE_OPERATORS.COUNT,
            aggregateAttribute: {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            filters: { op: OPERATORS.AND, items },
            groupBy: [{ key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG }],
            expression: QUERY_EXPRESSIONS.UNIQUE_GRAPHS,
            reduceTo: REDUCE_OPERATIONS.SUM,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            orderBy: [{ columnName: SPAN_KEYS.GRAPH_ID, order: ORDER_DIRECTIONS.ASC }],
            offset: QUERY_DEFAULTS.OFFSET,
            disabled: QUERY_DEFAULTS.DISABLED,
            having: QUERY_DEFAULTS.HAVING,
            legend: QUERY_DEFAULTS.LEGEND,
            limit: QUERY_DEFAULTS.LIMIT_NULL,
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
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
        },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: {
          key: SPAN_KEYS.AI_MODEL_ID,
          ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
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
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
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
            limit: QUERY_DEFAULTS.LIMIT_NULL,
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
  }
}

// ---------- Singleton export

let signozStatsClient: SigNozStatsAPI | null = null;

export function getSigNozStatsClient(): SigNozStatsAPI {
  return (signozStatsClient ??= new SigNozStatsAPI());
}

export { SigNozStatsAPI };
