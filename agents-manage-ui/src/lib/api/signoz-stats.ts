import axios from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import {
  AGGREGATE_OPERATORS,
  AI_OPERATIONS,
  CRITICAL_ERROR_SPAN_NAMES,
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
  agentId: string;
  agentName: string;
  totalToolCalls: number;
  toolsUsed: Array<{ name: string; calls: number }>;
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
    agentId?: string
  ): Promise<ConversationStats[] | PaginatedConversationStats> {
    try {
      // Fetch ALL conversation stats using ClickHouse - no pagination at DB level
      // We'll paginate in memory after fetching everything
      let stats = await this.fetchAllConversationStatsWithClickHouse(
        startTime,
        endTime,
        filters,
        projectId,
        agentId
      );

      // Apply search filter
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase().trim();
        stats = stats.filter(
          (s) =>
            s.firstUserMessage?.toLowerCase().includes(q) ||
            s.conversationId.toLowerCase().includes(q) ||
            s.agentId.toLowerCase().includes(q)
        );
      }

      // Apply span filters if needed
      if (filters?.spanName || filters?.attributes?.length) {
        stats = await this.applySpanFilters(stats, startTime, endTime, filters, projectId);
      }

      // Sort by first activity (descending - most recent first)
      stats.sort((a, b) => byFirstActivity(a.startTime, b.startTime));

      // If no pagination requested, return all
      if (!pagination) {
        return stats;
      }

      // Paginate in memory
      const { page, limit } = pagination;
      const total = stats.length;
      const totalPages = Math.ceil(total / limit);
      const startIdx = (page - 1) * limit;
      const data = stats.slice(startIdx, startIdx + limit);

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
      console.error('[getConversationStats] ERROR:', e);
      console.error(
        '[getConversationStats] Error stack:',
        e instanceof Error ? e.stack : 'No stack'
      );
      return pagination
        ? {
            data: [],
            pagination: {
              page: pagination.page,
              limit: pagination.limit,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          }
        : [];
    }
  }

  private async fetchAllConversationStatsWithClickHouse(
    startTime: number,
    endTime: number,
    _filters?: SpanFilterOptions,
    projectId?: string,
    agentId?: string
  ): Promise<ConversationStats[]> {
    // Build base WHERE clause
    let baseWhere = `
      timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
      AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
      AND attributes_string['conversation.id'] != ''
    `;

    const variables: Record<string, any> = {
      start_datetime: new Date(startTime).toISOString().replace('T', ' ').slice(0, -1),
      end_datetime: new Date(endTime).toISOString().replace('T', ' ').slice(0, -1),
      start_timestamp: startTime * 1000000,
      end_timestamp: endTime * 1000000,
    };

    if (projectId) {
      baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
      variables.project_id = projectId;
    }
    if (agentId && agentId !== 'all') {
      baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
      variables.agent_id = agentId;
    }

    // Build multiple ClickHouse queries for different stats
    // We'll use a composite query with multiple chQueries
    const queries = {
      // Tools: COUNT by conversation_id and tool_name
      tools: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          attributes_string['ai.toolCall.name'] as tool_name,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = 'mcp'
        GROUP BY conversation_id, tool_name
      `,

      // Transfers: COUNT by conversation_id, from, to
      transfers: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          attributes_string['transfer.from_sub_agent_id'] as from_agent,
          attributes_string['transfer.to_sub_agent_id'] as to_agent,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = 'transfer'
        GROUP BY conversation_id, from_agent, to_agent
      `,

      // Delegations: COUNT by conversation_id, from, to
      delegations: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          attributes_string['delegation.from_sub_agent_id'] as from_agent,
          attributes_string['delegation.to_sub_agent_id'] as to_agent,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
          AND attributes_string['ai.toolType'] = 'delegation'
        GROUP BY conversation_id, from_agent, to_agent
      `,

      // AI Calls: COUNT by conversation_id
      aiCalls: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND attributes_string['ai.operationId'] = 'ai.generateText.doGenerate'
        GROUP BY conversation_id
      `,

      // Last Activity: MIN timestamp by conversation_id
      // Convert to Unix timestamp in nanoseconds explicitly for numeric extraction
      lastActivity: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          toUnixTimestamp64Nano(MIN(timestamp)) as first_timestamp_nano
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
        GROUP BY conversation_id
      `,

      // Metadata: Get tenant_id, agent_id, agent_name per conversation
      // Same as original: GROUP BY conversation_id, tenant_id, agent_id, agent_name
      metadata: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          attributes_string['tenant.id'] as tenant_id,
          attributes_string['agent.id'] as agent_id,
          attributes_string['agent.name'] as agent_name
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND attributes_string['tenant.id'] != ''
          AND attributes_string['agent.id'] != ''
        GROUP BY conversation_id, tenant_id, agent_id, agent_name
      `,

      // Errors: Get spans with errors (including span name and count) to filter by critical span names in JS
      // This matches the approach used in the conversation detail route
      spansWithErrors: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          name as span_name,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND has_error = true
        GROUP BY conversation_id, span_name
      `,

      // User Messages: Get first message per conversation
      // Convert to Unix timestamp in nanoseconds explicitly for numeric extraction
      userMessages: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          attributes_string['message.content'] as message_content,
          toUnixTimestamp64Nano(MIN(timestamp)) as first_timestamp_nano
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND attributes_string['message.content'] != ''
          AND attributes_string['message.content'] IS NOT NULL
        GROUP BY conversation_id, message_content
      `,
    };

    // Execute all queries in parallel
    const queryPromises = Object.entries(queries).map(async ([key, query]) => {
      const payload = {
        start: startTime,
        end: endTime,
        step: QUERY_DEFAULTS.STEP,
        variables,
        compositeQuery: {
          queryType: 'clickhouse_sql',
          panelType: 'table',
          chQueries: {
            [key]: {
              query: query.trim(),
            },
          },
        },
        dataSource: DATA_SOURCES.TRACES,
        projectId,
      };

      try {
        const resp = await this.makeRequest(payload);
        return { key, resp };
      } catch (error) {
        console.error(`[fetchAllConversationStatsWithClickHouse] Error in ${key} query:`, error);
        return { key, resp: null };
      }
    });

    const results = await Promise.all(queryPromises);
    const resultsMap = new Map(results.map((r) => [r.key, r.resp]));

    // Extract data from responses
    // For ClickHouse table queries, data comes in series format
    // Each series item represents a row, with columns in labels
    const extractTableData = (resp: any) => {
      const result = resp?.data?.result?.[0];
      if (!result?.series) {
        return [];
      }
      const data = result.series.map((s: any) => {
        // For table format, columns are in labels
        // Also check values[0] as fallback
        const row = s.labels || {};
        if (s.values && s.values.length > 0 && s.values[0]) {
          // Merge values into row if labels don't have the data
          Object.assign(row, s.values[0]);
        }
        return row;
      });
      return data;
    };

    const toolsData = extractTableData(resultsMap.get('tools'));
    const transfersData = extractTableData(resultsMap.get('transfers'));
    const delegationsData = extractTableData(resultsMap.get('delegations'));
    const aiCallsData = extractTableData(resultsMap.get('aiCalls'));
    const lastActivityData = extractTableData(resultsMap.get('lastActivity'));
    const metadataData = extractTableData(resultsMap.get('metadata'));
    const spansWithErrorsData = extractTableData(resultsMap.get('spansWithErrors'));
    const userMessagesData = extractTableData(resultsMap.get('userMessages'));

    // Build maps for aggregation
    const metaByConv = new Map<string, { tenantId: string; agentId: string; agentName: string }>();
    for (const row of metadataData) {
      const id = row.conversation_id || row.conversationId;
      if (id) {
        const agentId = row.agent_id || row.agentId || UNKNOWN_VALUE;
        const agentName = row.agent_name || row.agentName;
        // If agent_name is empty, try to use agent_id as fallback (better than "unknown")
        const finalAgentName =
          agentName && agentName !== ''
            ? agentName
            : agentId !== UNKNOWN_VALUE
              ? agentId
              : UNKNOWN_VALUE;

        metaByConv.set(id, {
          tenantId: row.tenant_id || row.tenantId || UNKNOWN_VALUE,
          agentId,
          agentName: finalAgentName,
        });
      }
    }

    const firstSeen = new Map<string, number>();
    for (const row of lastActivityData) {
      const id = row.conversation_id || row.conversationId;
      // The aggregated value comes in the 'value' field from ClickHouse table format
      const ts = row.value || row.first_timestamp_nano || row.firstTimestampNano;
      if (id && ts !== null && ts !== undefined) {
        // Timestamp from toUnixTimestamp64Nano returns nanoseconds as a number (or string number)
        let timestamp: number;
        if (typeof ts === 'string') {
          const num = parseFloat(ts);
          if (!Number.isNaN(num) && num > 0) {
            timestamp = num;
          } else {
            console.warn(
              '[fetchAllConversationStatsWithClickHouse] Invalid timestamp string for',
              id,
              ':',
              ts
            );
            continue;
          }
        } else if (typeof ts === 'number' && ts > 0) {
          timestamp = ts;
        } else {
          console.warn(
            '[fetchAllConversationStatsWithClickHouse] Invalid timestamp type for',
            id,
            ':',
            typeof ts,
            ts
          );
          continue;
        }
        firstSeen.set(id, timestamp);
      }
    }
    if (firstSeen.size === 0 && lastActivityData.length > 0) {
      console.error(
        '[fetchAllConversationStatsWithClickHouse] No timestamps extracted but had',
        lastActivityData.length,
        'rows. Sample row:',
        lastActivityData[0]
      );
    }

    // Aggregate tools by conversation
    const toolsByConv = new Map<string, Map<string, number>>();
    for (const row of toolsData) {
      const convId = row.conversation_id;
      const toolName = row.tool_name;
      const count = parseInt(row.count || '0', 10);
      if (convId && toolName && !Number.isNaN(count)) {
        if (!toolsByConv.has(convId)) {
          toolsByConv.set(convId, new Map());
        }
        const toolMap = toolsByConv.get(convId);
        if (toolMap) {
          toolMap.set(toolName, (toolMap.get(toolName) || 0) + count);
        }
      }
    }

    // Aggregate transfers by conversation
    const transfersByConv = new Map<string, Map<string, Map<string, number>>>();
    for (const row of transfersData) {
      const convId = row.conversation_id;
      const from = row.from_agent || UNKNOWN_VALUE;
      const to = row.to_agent || UNKNOWN_VALUE;
      const count = parseInt(row.count || '0', 10);
      if (convId && !Number.isNaN(count)) {
        if (!transfersByConv.has(convId)) {
          transfersByConv.set(convId, new Map());
        }
        const convMap = transfersByConv.get(convId);
        if (convMap) {
          if (!convMap.has(from)) {
            convMap.set(from, new Map());
          }
          const fromMap = convMap.get(from);
          if (fromMap) {
            fromMap.set(to, count);
          }
        }
      }
    }

    // Aggregate delegations by conversation
    const delegationsByConv = new Map<string, Map<string, Map<string, number>>>();
    for (const row of delegationsData) {
      const convId = row.conversation_id;
      const from = row.from_agent || UNKNOWN_VALUE;
      const to = row.to_agent || UNKNOWN_VALUE;
      const count = parseInt(row.count || '0', 10);
      if (convId && !Number.isNaN(count)) {
        if (!delegationsByConv.has(convId)) {
          delegationsByConv.set(convId, new Map());
        }
        const convMap = delegationsByConv.get(convId);
        if (convMap) {
          if (!convMap.has(from)) {
            convMap.set(from, new Map());
          }
          const fromMap = convMap.get(from);
          if (fromMap) {
            fromMap.set(to, count);
          }
        }
      }
    }

    // Aggregate AI calls by conversation
    const aiCallsByConv = new Map<string, number>();
    for (const row of aiCallsData) {
      const convId = row.conversation_id;
      const count = parseInt(row.count || '0', 10);
      if (convId && !Number.isNaN(count)) {
        aiCallsByConv.set(convId, (aiCallsByConv.get(convId) || 0) + count);
      }
    }

    // Aggregate errors by conversation
    const errorsByConv = new Map<string, number>();
    for (const row of spansWithErrorsData) {
      const convId = row.conversation_id;
      const spanName = row.span_name || row.spanName;
      const count = parseInt(row.count || '1', 10);
      if (convId && spanName && CRITICAL_ERROR_SPAN_NAMES.includes(spanName)) {
        errorsByConv.set(convId, (errorsByConv.get(convId) || 0) + count);
      }
    }

    // Get first user message per conversation
    const firstMsgByConv = new Map<string, { content: string; timestamp: number }>();
    const msgsByConv = new Map<string, Array<{ t: number; c: string }>>();
    for (const row of userMessagesData) {
      const convId = row.conversation_id || row.conversationId;
      const content = row.message_content || row.messageContent;
      // The aggregated value comes in the 'value' field from ClickHouse table format
      const ts = row.value || row.first_timestamp_nano || row.firstTimestampNano;

      if (!convId) {
        console.warn(
          '[fetchAllConversationStatsWithClickHouse] Row missing conversation_id:',
          Object.keys(row),
          row
        );
        continue;
      }

      if (!content || content === '') {
        console.warn(
          '[fetchAllConversationStatsWithClickHouse] Row missing message_content for convId:',
          convId,
          'row keys:',
          Object.keys(row)
        );
        continue;
      }

      // Timestamp from toUnixTimestamp64Nano returns nanoseconds as a number (or string number)
      let timestamp: number | null = null;
      if (ts !== null && ts !== undefined && ts !== '') {
        if (typeof ts === 'string') {
          const num = parseFloat(ts);
          if (!Number.isNaN(num) && num > 0) {
            timestamp = num;
          }
        } else if (typeof ts === 'number' && ts > 0) {
          timestamp = ts;
        }
      }

      // Add message even if timestamp is missing (we'll use span timestamp as fallback)
      if (!msgsByConv.has(convId)) {
        msgsByConv.set(convId, []);
      }
      const msgArr = msgsByConv.get(convId);
      if (msgArr) {
        // Use timestamp if available, otherwise use 0 (will be sorted later)
        msgArr.push({ t: timestamp || 0, c: content });
      }
    }

    for (const [id, arr] of msgsByConv) {
      // Sort by timestamp (ascending - earliest first)
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0];
      if (first?.c) {
        const content = first.c.length > 100 ? `${first.c.slice(0, 100)}...` : first.c;
        const timestampMs = first.t > 0 ? nsToMs(first.t) : undefined;
        firstMsgByConv.set(id, { content, timestamp: timestampMs || 0 });
      }
    }

    // Build ConversationStats objects
    // Get all unique conversation IDs
    const allConvIds = new Set<string>();
    for (const id of metaByConv.keys()) allConvIds.add(id);
    for (const id of firstSeen.keys()) allConvIds.add(id);
    for (const id of toolsByConv.keys()) allConvIds.add(id);
    for (const id of transfersByConv.keys()) allConvIds.add(id);
    for (const id of delegationsByConv.keys()) allConvIds.add(id);
    for (const id of aiCallsByConv.keys()) allConvIds.add(id);
    for (const id of errorsByConv.keys()) allConvIds.add(id);
    for (const id of firstMsgByConv.keys()) allConvIds.add(id);

    const stats: ConversationStats[] = [];
    for (const convId of allConvIds) {
      const meta = metaByConv.get(convId);

      // Build tools array
      const toolsMap = toolsByConv.get(convId) || new Map();
      const toolsUsed = Array.from(toolsMap.entries()).map(([name, calls]) => ({
        name,
        calls,
      }));

      // Build transfers array
      const transfersMap = transfersByConv.get(convId) || new Map();
      const transfers: Array<{ from: string; to: string; count: number }> = [];
      for (const [from, toMap] of transfersMap) {
        for (const [to, count] of toMap) {
          transfers.push({ from, to, count });
        }
      }

      // Build delegations array
      const delegationsMap = delegationsByConv.get(convId) || new Map();
      const delegations: Array<{ from: string; to: string; count: number }> = [];
      for (const [from, toMap] of delegationsMap) {
        for (const [to, count] of toMap) {
          delegations.push({ from, to, count });
        }
      }

      const firstMsg = firstMsgByConv.get(convId);
      const firstTimestamp = firstSeen.get(convId);

      // Use first message timestamp if available and valid, otherwise use first seen timestamp
      // Convert nanoseconds to milliseconds for startTime
      const startTimeMs =
        firstMsg?.timestamp && firstMsg.timestamp > 0
          ? firstMsg.timestamp
          : firstTimestamp
            ? nsToMs(firstTimestamp)
            : undefined;

      stats.push({
        conversationId: convId,
        tenantId: meta?.tenantId || UNKNOWN_VALUE,
        agentId: meta?.agentId || UNKNOWN_VALUE,
        agentName: meta?.agentName || UNKNOWN_VALUE,
        totalToolCalls: Array.from(toolsMap.values()).reduce((sum, count) => sum + count, 0),
        toolsUsed,
        transfers,
        totalTransfers: transfers.reduce((sum, t) => sum + t.count, 0),
        delegations,
        totalDelegations: delegations.reduce((sum, d) => sum + d.count, 0),
        totalAICalls: aiCallsByConv.get(convId) || 0,
        totalErrors: errorsByConv.get(convId) || 0,
        hasErrors: (errorsByConv.get(convId) || 0) > 0,
        firstUserMessage: firstMsg?.content || undefined,
        startTime: startTimeMs,
      });
    }

    return stats;
  }

  async getAICallsByAgent(startTime: number, endTime: number, projectId?: string) {
    try {
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
        AND attributes_string['ai.operationId'] = 'ai.generateText.doGenerate'
      `;

      const variables: Record<string, any> = {
        start_datetime: new Date(startTime).toISOString().replace('T', ' ').slice(0, -1),
        end_datetime: new Date(endTime).toISOString().replace('T', ' ').slice(0, -1),
        start_timestamp: startTime * 1000000,
        end_timestamp: endTime * 1000000,
      };

      if (projectId) {
        baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
        variables.project_id = projectId;
      }

      // ClickHouse query: GROUP BY agent.id and count
      const query = `
        SELECT 
          COALESCE(attributes_string['agent.id'], '${UNKNOWN_VALUE}') as agent_id,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
        GROUP BY agent_id
        ORDER BY count DESC
      `;

      const payload = {
        start: startTime,
        end: endTime,
        step: QUERY_DEFAULTS.STEP,
        variables,
        compositeQuery: {
          queryType: 'clickhouse_sql',
          panelType: 'table',
          chQueries: {
            aiCallsByAgent: {
              query: query.trim(),
            },
          },
        },
        dataSource: DATA_SOURCES.TRACES,
        projectId,
      };

      const resp = await this.makeRequest(payload);
      const result = resp?.data?.result?.[0];

      // Extract results - handle both table and timeseries formats
      const totals: Array<{ agentId: string; totalCalls: number }> = [];
      if (result?.series && result.series.length > 0) {
        // Check if this is timeseries format (one series with multiple values)
        // or table format (multiple series, one per group)
        const firstSeries = result.series[0];

        if (
          result.series.length === 1 &&
          firstSeries.values &&
          Array.isArray(firstSeries.values) &&
          firstSeries.values.length > 1
        ) {
          // Timeseries format: one series with array of values
          // This shouldn't happen for GROUP BY without time dimension
          console.warn(
            '[getAICallsByAgent] Unexpected timeseries format for GROUP BY query, got',
            firstSeries.values.length,
            'values'
          );
        } else {
          // Table format: multiple series or single series with one value
          for (const seriesItem of result.series) {
            const agentId =
              seriesItem.labels?.agent_id || seriesItem.labels?.agentId || UNKNOWN_VALUE;
            const countValue =
              seriesItem.values?.[0]?.value ?? seriesItem.values?.[0] ?? seriesItem.labels?.count;

            if (countValue !== null && countValue !== undefined) {
              const count =
                typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
              if (!Number.isNaN(count)) {
                totals.push({ agentId, totalCalls: count });
              }
            }
          }
        }
      }

      return totals.sort((a, b) => b.totalCalls - a.totalCalls);
    } catch (e) {
      console.error('getAICallsByAgent error:', e);
      return [];
    }
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

  async getConversationsPerDay(
    startTime: number,
    endTime: number,
    agentId?: string,
    projectId?: string
  ) {
    try {
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
      `;

      const variables: Record<string, any> = {
        start_datetime: new Date(startTime).toISOString().replace('T', ' ').slice(0, -1),
        end_datetime: new Date(endTime).toISOString().replace('T', ' ').slice(0, -1),
        start_timestamp: startTime * 1000000,
        end_timestamp: endTime * 1000000,
      };

      if (projectId) {
        baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
        variables.project_id = projectId;
      }
      if (agentId && agentId !== 'all') {
        baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
        variables.agent_id = agentId;
      }

      // ClickHouse query: GROUP BY date and count distinct conversations
      const query = `
        SELECT 
          toDate(timestamp) as date,
          COUNT(DISTINCT attributes_string['conversation.id']) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
        GROUP BY date
        ORDER BY date ASC
      `;

      const payload = {
        start: startTime,
        end: endTime,
        step: QUERY_DEFAULTS.STEP,
        variables,
        compositeQuery: {
          queryType: 'clickhouse_sql',
          panelType: 'table',
          chQueries: {
            conversationsPerDay: {
              query: query.trim(),
            },
          },
        },
        dataSource: DATA_SOURCES.TRACES,
        projectId,
      };

      const resp = await this.makeRequest(payload);
      const result = resp?.data?.result?.[0];

      // Extract results from timeseries format
      // ClickHouse returns ONE series item with multiple values (one per timestamp)
      const buckets = new Map<string, number>();
      if (result?.series && result.series.length > 0) {
        const seriesItem = result.series[0]; // Get the first (and typically only) series

        if (seriesItem.values && Array.isArray(seriesItem.values)) {
          for (const valueItem of seriesItem.values) {
            // Each valueItem has: { timestamp: <milliseconds>, value: "<count>" }
            const timestamp = valueItem.timestamp;
            const countValue = valueItem.value;

            if (timestamp && countValue !== null && countValue !== undefined) {
              // Timestamp is in milliseconds (not nanoseconds) for timeseries format
              const dateMs = typeof timestamp === 'number' ? timestamp : parseFloat(timestamp);
              const dateStr = new Date(dateMs).toISOString().split('T')[0];

              const count =
                typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
              if (!Number.isNaN(count)) {
                buckets.set(dateStr, count);
              }
            }
          }
        }
      } else {
        console.warn('[getConversationsPerDay] No series data in result');
      }

      // Fill in all dates in range (including zeros)
      const finalData = datesRange(startTime, endTime).map((date) => ({
        date,
        count: buckets.get(date) || 0,
      }));

      return finalData;
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
    agentId?: string
  ) {
    try {
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
      `;

      const variables: Record<string, any> = {
        start_datetime: new Date(startTime).toISOString().replace('T', ' ').slice(0, -1),
        end_datetime: new Date(endTime).toISOString().replace('T', ' ').slice(0, -1),
        start_timestamp: startTime * 1000000,
        end_timestamp: endTime * 1000000,
      };

      if (projectId) {
        baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
        variables.project_id = projectId;
      }
      if (agentId && agentId !== 'all') {
        baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
        variables.agent_id = agentId;
      }
      let filteredConversationIds: Set<string> | null = null;
      if (filters?.spanName || filters?.attributes?.length) {
        try {
          const payload = this.buildFilteredConversationsPayload(
            startTime,
            endTime,
            filters,
            projectId
          );
          const resp = await this.makeRequest(payload);

          // Extract conversation IDs from ClickHouse table format
          const result = resp?.data?.result?.[0];
          filteredConversationIds = new Set<string>();
          if (result?.series && result.series.length > 0) {
            for (const seriesItem of result.series) {
              const convId = seriesItem.labels?.conversation_id;
              if (convId && typeof convId === 'string') {
                filteredConversationIds.add(convId);
              }
            }
          }

          // If no conversations match the filter, return zeros
          if (filteredConversationIds.size === 0) {
            return {
              totalToolCalls: 0,
              totalTransfers: 0,
              totalDelegations: 0,
              totalConversations: 0,
              totalAICalls: 0,
            };
          }

          // Add conversation ID filter to baseWhere
          const convIdsArray = Array.from(filteredConversationIds);
          const convIdVars = convIdsArray
            .map((id, idx) => {
              const varKey = `conv_id_${idx}`;
              variables[varKey] = id;
              return `{{.${varKey}}}`;
            })
            .join(', ');
          baseWhere += ` AND attributes_string['conversation.id'] IN (${convIdVars})`;
        } catch (error) {
          console.error('[getAggregateStats] Error getting filtered conversations:', error);
          // If filter query fails, return zeros to be safe
          return {
            totalToolCalls: 0,
            totalTransfers: 0,
            totalDelegations: 0,
            totalConversations: 0,
            totalAICalls: 0,
          };
        }
      }

      // Build queries for each metric
      const queries = {
        totalConversations: `
          SELECT COUNT(DISTINCT attributes_string['conversation.id']) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
        `,
        totalToolCalls: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
            AND attributes_string['ai.toolType'] = 'mcp'
        `,
        totalTransfers: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
            AND attributes_string['ai.toolType'] = 'transfer'
        `,
        totalDelegations: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND name = '${SPAN_NAMES.AI_TOOL_CALL}'
            AND attributes_string['ai.toolType'] = 'delegation'
        `,
        totalAICalls: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND attributes_string['ai.operationId'] = 'ai.generateText.doGenerate'
        `,
      };

      // Execute all queries in parallel
      const queryPromises = Object.entries(queries).map(async ([key, query]) => {
        const payload = {
          start: startTime,
          end: endTime,
          step: QUERY_DEFAULTS.STEP,
          variables,
          compositeQuery: {
            queryType: 'clickhouse_sql',
            panelType: 'table',
            chQueries: {
              [key]: {
                query: query.trim(),
              },
            },
          },
          dataSource: DATA_SOURCES.TRACES,
          projectId,
        };

        try {
          const resp = await this.makeRequest(payload);
          const result = resp?.data?.result?.[0];
          if (result?.series && result.series.length > 0) {
            const firstSeries = result.series[0];
            // Extract count from values[0].value
            if (
              firstSeries.values &&
              firstSeries.values.length > 0 &&
              firstSeries.values[0].value
            ) {
              const count = parseInt(firstSeries.values[0].value, 10);
              if (!Number.isNaN(count)) {
                return { key, count };
              }
            }
          }
          console.warn(`[getAggregateStats] Failed to extract ${key}, defaulting to 0`);
          return { key, count: 0 };
        } catch (error) {
          console.error(`[getAggregateStats] Error getting ${key}:`, error);
          return { key, count: 0 };
        }
      });

      const results = await Promise.all(queryPromises);
      const statsMap = new Map(results.map((r) => [r.key, r.count]));

      return {
        totalToolCalls: statsMap.get('totalToolCalls') || 0,
        totalTransfers: statsMap.get('totalTransfers') || 0,
        totalDelegations: statsMap.get('totalDelegations') || 0,
        totalConversations: statsMap.get('totalConversations') || 0,
        totalAICalls: statsMap.get('totalAICalls') || 0,
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
    agentId?: string,
    projectId?: string
  ) {
    try {
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND name != ''
      `;

      const variables: Record<string, any> = {
        start_datetime: new Date(startTime).toISOString().replace('T', ' ').slice(0, -1),
        end_datetime: new Date(endTime).toISOString().replace('T', ' ').slice(0, -1),
        start_timestamp: startTime * 1000000,
        end_timestamp: endTime * 1000000,
      };

      if (projectId) {
        baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
        variables.project_id = projectId;
      }
      if (agentId && agentId !== 'all') {
        baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
        variables.agent_id = agentId;
      }

      // ClickHouse query: DISTINCT span names
      const query = `
        SELECT DISTINCT name
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
        ORDER BY name ASC
      `;

      const payload = {
        start: startTime,
        end: endTime,
        step: QUERY_DEFAULTS.STEP,
        variables,
        compositeQuery: {
          queryType: 'clickhouse_sql',
          panelType: 'table',
          chQueries: {
            spanNames: {
              query: query.trim(),
            },
          },
        },
        dataSource: DATA_SOURCES.TRACES,
        projectId,
      };

      const resp = await this.makeRequest(payload);
      const result = resp?.data?.result?.[0];

      // Extract span names from series format
      const names = new Set<string>();
      if (result?.series && result.series.length > 0) {
        for (const seriesItem of result.series) {
          const name = seriesItem.labels?.name || seriesItem.values?.[0]?.value;
          if (name && typeof name === 'string') {
            names.add(name);
          }
        }
      }

      return [...names].sort();
    } catch (e) {
      console.error('[getAvailableSpanNames] ERROR:', e);
      console.error('[getAvailableSpanNames] Error details:', {
        message: e instanceof Error ? e.message : 'Unknown',
        stack: e instanceof Error ? e.stack : undefined,
        isAxiosError: axios.isAxiosError(e),
        axiosStatus: axios.isAxiosError(e) ? e.response?.status : undefined,
        axiosData: axios.isAxiosError(e) ? e.response?.data : undefined,
      });
      return [];
    }
  }

  private async applySpanFilters(
    stats: ConversationStats[],
    startTime: number,
    endTime: number,
    filters: SpanFilterOptions,
    projectId?: string
  ) {
    try {
      const payload = this.buildFilteredConversationsPayload(
        startTime,
        endTime,
        filters,
        projectId
      );
      const resp = await this.makeRequest(payload);

      // Extract conversation IDs from ClickHouse table format
      const result = resp?.data?.result?.[0];
      const allowed = new Set<string>();
      if (result?.series && result.series.length > 0) {
        for (const seriesItem of result.series) {
          const convId = seriesItem.labels?.conversation_id;

          if (convId && typeof convId === 'string') {
            allowed.add(convId);
          }
        }
      }

      return stats.filter((s) => allowed.has(s.conversationId));
    } catch (e) {
      console.error('[applySpanFilters] ERROR:', e);
      return [];
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
                    ...QUERY_FIELD_CONFIGS.STRING_TAG,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
    // Build base WHERE clause
    let baseWhere = `
      timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
      AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
      AND attributes_string['conversation.id'] != ''
    `;

    const variables: Record<string, any> = {
      start_datetime: new Date(start).toISOString().replace('T', ' ').slice(0, -1),
      end_datetime: new Date(end).toISOString().replace('T', ' ').slice(0, -1),
      start_timestamp: start * 1000000,
      end_timestamp: end * 1000000,
    };

    if (projectId) {
      baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
      variables.project_id = projectId;
    }

    // Add span name filter - this is critical for filtering
    if (filters.spanName) {
      baseWhere += ` AND name = {{.span_name}}`;
      variables.span_name = filters.spanName;
    }

    // Add attribute filters
    const attributes = filters.attributes ?? [];
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      const op = attr.operator ?? OPERATORS.EQUALS;
      let value: any = asTypedFilterValue(attr.value);
      const varKey = `attr_${i}`;

      // Convert operator to ClickHouse SQL
      if (op === OPERATORS.EXISTS) {
        baseWhere += ` AND attributes_string['${attr.key}'] != ''`;
      } else if (op === OPERATORS.NOT_EXISTS) {
        baseWhere += ` AND attributes_string['${attr.key}'] = ''`;
      } else if (op === OPERATORS.EQUALS) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] = {{.${varKey}}}`;
          variables[varKey] = value;
        } else if (typeof value === 'boolean') {
          baseWhere += ` AND attributes_bool['${attr.key}'] = {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] = {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === OPERATORS.NOT_EQUALS) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] != {{.${varKey}}}`;
          variables[varKey] = value;
        } else if (typeof value === 'boolean') {
          baseWhere += ` AND attributes_bool['${attr.key}'] != {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] != {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === OPERATORS.LIKE) {
        if (typeof value === 'string' && !value.includes('%')) {
          value = `%${value}%`;
        }
        baseWhere += ` AND attributes_string['${attr.key}'] LIKE {{.${varKey}}}`;
        variables[varKey] = value;
      } else if (op === OPERATORS.NOT_LIKE) {
        if (typeof value === 'string' && !value.includes('%')) {
          value = `%${value}%`;
        }
        baseWhere += ` AND attributes_string['${attr.key}'] NOT LIKE {{.${varKey}}}`;
        variables[varKey] = value;
      } else if (op === OPERATORS.GREATER_THAN) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] > {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] > {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === OPERATORS.LESS_THAN) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] < {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] < {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === OPERATORS.GREATER_THAN_OR_EQUAL) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] >= {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] >= {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === OPERATORS.LESS_THAN_OR_EQUAL) {
        if (typeof value === 'number') {
          baseWhere += ` AND attributes_number['${attr.key}'] <= {{.${varKey}}}`;
          variables[varKey] = value;
        } else {
          baseWhere += ` AND attributes_string['${attr.key}'] <= {{.${varKey}}}`;
          variables[varKey] = value;
        }
      } else if (op === 'in') {
        // Handle IN operator - convert array to SQL IN clause
        if (Array.isArray(value)) {
          const inValues = value
            .map((v, idx) => {
              const inVarKey = `${varKey}_${idx}`;
              variables[inVarKey] = v;
              return `{{.${inVarKey}}}`;
            })
            .join(', ');
          baseWhere += ` AND attributes_string['${attr.key}'] IN (${inValues})`;
        }
      } else if (op === 'nin') {
        // Handle NOT IN operator
        if (Array.isArray(value)) {
          const inValues = value
            .map((v, idx) => {
              const inVarKey = `${varKey}_${idx}`;
              variables[inVarKey] = v;
              return `{{.${inVarKey}}}`;
            })
            .join(', ');
          baseWhere += ` AND attributes_string['${attr.key}'] NOT IN (${inValues})`;
        }
      }
    }

    // ClickHouse query: Get distinct conversation IDs that match filters
    // This ensures we only get conversations that actually have spans matching the filter
    const query = `
      SELECT DISTINCT attributes_string['conversation.id'] as conversation_id
      FROM signoz_traces.distributed_signoz_index_v3
      WHERE ${baseWhere}
    `.trim();

    return {
      start,
      end,
      step: QUERY_DEFAULTS.STEP,
      variables,
      compositeQuery: {
        queryType: 'clickhouse_sql',
        panelType: 'table',
        chQueries: {
          filteredConversations: {
            query,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
