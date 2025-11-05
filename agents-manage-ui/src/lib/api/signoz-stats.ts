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
    console.log('[SigNoz] Making request with payload:', {
      queryNames: Object.keys(payload.compositeQuery?.builderQueries || {}),
      start: new Date(payload.start).toISOString(),
      end: new Date(payload.end).toISOString(),
    });
    
    const response = await axios.post<T>('/api/signoz', payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[SigNoz] Request successful, response status:', response.status);
    return response.data;
  }

  private async makeRequestWithPagination<T = any>(
    payload: any,
    batchSize: number = 1000
  ): Promise<T> {
    console.log('[SigNoz] Starting paginated request with batchSize:', batchSize);
    let offset = 0;
    let allResults: any = null;
    let hasMore = true;
    let requestCount = 0;
    let totalResultsCollected = 0;
    
    while (hasMore) {
      requestCount++;
      console.log(`[SigNoz] Pagination batch ${requestCount}: offset=${offset}, limit=${batchSize}`);
      
      const paginatedPayload = JSON.parse(JSON.stringify(payload));

      // Apply pagination to all builder queries
      if (paginatedPayload.compositeQuery?.builderQueries) {
        for (const queryKey of Object.keys(paginatedPayload.compositeQuery.builderQueries)) {
          const query = paginatedPayload.compositeQuery.builderQueries[queryKey];
          query.limit = batchSize;
          query.offset = offset;
        }
      }

      try {
        const response = await this.makeRequest<any>(paginatedPayload);

        if (!allResults) {
          allResults = response;
        } else {
          allResults = this.mergeResponses(allResults, response);
        }

        const resultCount = this.getResultCount(response);
        totalResultsCollected += resultCount;
        console.log(`[SigNoz] Batch ${requestCount} returned ${resultCount} results (total collected: ${totalResultsCollected})`);
        
        // Continue pagination if we got a full batch, or if we got some results but less than batchSize
        // Stop only if we got 0 results
        hasMore = resultCount >= batchSize;
        offset += batchSize;

        if (resultCount === 0) {
          console.log('[SigNoz] No more results, stopping pagination');
          break;
        }
      } catch (error) {
        // If we hit SigNoz's limit, try to continue with smaller batch size
        if (axios.isAxiosError(error) && error.response?.status === 500) {
          const errorMsg = JSON.stringify(error.response?.data || '');
          if (errorMsg.includes('maximum traces that can be paginated') || errorMsg.includes('limit')) {
            const collectedCount = allResults ? this.getResultCount(allResults) : 0;
            console.warn(`[SigNoz] Hit SigNoz pagination limit at offset=${offset} with batchSize=${batchSize}. Collected ${collectedCount} results.`);
            
            // If we haven't collected any results yet, try with a smaller batch size
            if (!allResults && batchSize > 100) {
              console.log(`[SigNoz] Retrying with smaller batchSize: ${Math.floor(batchSize / 2)}`);
              return this.makeRequestWithPagination(payload, Math.floor(batchSize / 2));
            }
            
            // If we have some results but hit the limit, try to continue with smaller batches
            if (allResults && batchSize > 100) {
              const smallerBatchSize = Math.floor(batchSize / 2);
              console.log(`[SigNoz] Continuing pagination with smaller batchSize: ${smallerBatchSize} from offset=${offset}`);
              // Try to continue from where we left off with a smaller batch size
              try {
                const continuePayload = JSON.parse(JSON.stringify(payload));
                if (continuePayload.compositeQuery?.builderQueries) {
                  for (const queryKey of Object.keys(continuePayload.compositeQuery.builderQueries)) {
                    const query = continuePayload.compositeQuery.builderQueries[queryKey];
                    query.limit = smallerBatchSize;
                    query.offset = offset;
                  }
                }
                const continueResponse = await this.makeRequest<any>(continuePayload);
                const merged = this.mergeResponses(allResults, continueResponse);
                const continueCount = this.getResultCount(continueResponse);
                console.log(`[SigNoz] Continued pagination collected ${continueCount} more results`);
                
                // Continue pagination from the new offset with smaller batch size
                let continueOffset = offset + continueCount;
                let continueHasMore = continueCount >= smallerBatchSize;
                
                while (continueHasMore) {
                  const nextPayload = JSON.parse(JSON.stringify(payload));
                  if (nextPayload.compositeQuery?.builderQueries) {
                    for (const queryKey of Object.keys(nextPayload.compositeQuery.builderQueries)) {
                      const query = nextPayload.compositeQuery.builderQueries[queryKey];
                      query.limit = smallerBatchSize;
                      query.offset = continueOffset;
                    }
                  }
                  
                  try {
                    const nextResponse = await this.makeRequest<any>(nextPayload);
                    const nextMerged = this.mergeResponses(merged, nextResponse);
                    const nextCount = this.getResultCount(nextResponse);
                    console.log(`[SigNoz] Continued batch collected ${nextCount} more results`);
                    
                    if (nextCount === 0) {
                      break;
                    }
                    
                    Object.assign(merged, nextMerged);
                    continueHasMore = nextCount >= smallerBatchSize;
                    continueOffset += smallerBatchSize;
                  } catch {
                    // If we hit limit again, stop and return what we have
                    console.warn(`[SigNoz] Hit limit again during continuation, stopping`);
                    break;
                  }
                }
                
                return merged as T;
              } catch {
                // If continuing also fails, return what we have
                console.warn(`[SigNoz] Could not continue pagination, returning ${collectedCount} collected results`);
                return allResults as T;
              }
            }
            
            // Return what we've collected so far if we can't continue
            if (allResults) {
              console.warn(`[SigNoz] Returning incomplete results: ${collectedCount} collected`);
              return allResults as T;
            }
            // If we have no results and hit the limit on first request, throw the error
            throw error;
          }
        }
        // Re-throw other errors
        throw error;
      }
    }

    const finalCount = allResults ? this.getResultCount(allResults) : 0;
    console.log(`[SigNoz] Pagination complete: ${requestCount} requests, total results collected: ${finalCount}`);
    return allResults as T;
  }

  private mergeResponses(existing: any, newData: any): any {
    if (!existing?.data?.result || !newData?.data?.result) {
      return existing;
    }

    const merged = JSON.parse(JSON.stringify(existing));

    for (const newResult of newData.data.result) {
      const existingResult = merged.data.result.find(
        (r: any) => r.queryName === newResult.queryName
      );

      if (existingResult) {
        if (newResult.series) {
          existingResult.series = [...(existingResult.series || []), ...(newResult.series || [])];
        }
        if (newResult.list) {
          existingResult.list = [...(existingResult.list || []), ...(newResult.list || [])];
        }
      } else {
        merged.data.result.push(newResult);
      }
    }

    return merged;
  }

  private getResultCount(response: any): number {
    if (!response?.data?.result) return 0;

    let totalCount = 0;
    for (const result of response.data.result) {
      if (result.series) {
        totalCount += result.series.length;
      }
      if (result.list) {
        totalCount += result.list.length;
      }
    }
    return totalCount;
  }

  // --- Helpers to read SigNoz response
  private extractSeries(resp: any, name: string): Series[] {
    return resp?.data?.result?.find((r: any) => r?.queryName === name)?.series ?? [];
  }

  private async fetchPaginatedConversationIds(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<string[]> {
    const offset = (page - 1) * limit;
    console.log('[fetchPaginatedConversationIds] Using ClickHouse query with LIMIT/OFFSET:', { page, limit, offset });
    
    // Convert timestamps
    const startTimeNano = startTime * 1000000;
    const endTimeNano = endTime * 1000000;
    const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
    const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
    
    // Build base WHERE clause
    let baseWhere = `
      timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
      AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
      AND attributes_string['conversation.id'] != ''
    `;
    
    const variables: Record<string, any> = {
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      start_timestamp: startTimeNano,
      end_timestamp: endTimeNano,
      limit_value: limit,
      offset_value: offset,
    };
    
    if (projectId) {
      baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
      variables.project_id = projectId;
    }
    if (agentId && agentId !== 'all') {
      baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
      variables.agent_id = agentId;
    }
    
    // ClickHouse query: Get conversation IDs ordered by MIN(timestamp) DESC with pagination
    const query = `
      SELECT 
        attributes_string['conversation.id'] as conversation_id,
        MIN(timestamp) as first_timestamp
      FROM signoz_traces.distributed_signoz_index_v3
      WHERE ${baseWhere}
      GROUP BY conversation_id
      ORDER BY first_timestamp DESC
      LIMIT {{.limit_value}} OFFSET {{.offset_value}}
    `;
    
    const payload = {
      start: startTime,
      end: endTime,
      step: 60,
      variables,
      compositeQuery: {
        queryType: 'clickhouse_sql',
        panelType: 'table',
        chQueries: {
          paginatedConversationIds: {
            query: query.trim(),
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
    
    const resp = await this.makeRequest(payload);
    const result = resp?.data?.result?.[0];
    
    // Extract conversation IDs from series format
    const conversationIds: string[] = [];
    if (result?.series && result.series.length > 0) {
      for (const seriesItem of result.series) {
        const id = seriesItem.labels?.conversation_id || seriesItem.values?.[0]?.value;
        if (id && typeof id === 'string' && !conversationIds.includes(id)) {
          conversationIds.push(id);
        }
      }
    }
    
    console.log('[fetchPaginatedConversationIds] Extracted', conversationIds.length, 'unique conversation IDs');
    return conversationIds;
  }

  private async getTotalConversationCount(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string
  ): Promise<number> {
    console.log('[getTotalConversationCount] Using ClickHouse SQL query for accurate count');
    
    // Convert timestamps to nanoseconds and ISO datetime strings
    const startTimeNano = startTime * 1000000;
    const endTimeNano = endTime * 1000000;
    const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
    const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
    
    // Build ClickHouse SQL query using template variables
    let query = `
      SELECT COUNT(DISTINCT attributes_string['conversation.id']) as count
      FROM signoz_traces.distributed_signoz_index_v3
      WHERE timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
    `;
    
    // Add filters if provided (using template variables)
    const variables: Record<string, any> = {
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      start_timestamp: startTimeNano,
      end_timestamp: endTimeNano,
    };
    
    if (projectId) {
      query += ` AND attributes_string['project.id'] = {{.project_id}}`;
      variables.project_id = projectId;
    }
    if (agentId && agentId !== 'all') {
      query += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
      variables.agent_id = agentId;
    }
    
    const payload = {
      start: startTime,
      end: endTime,
      step: 60,
      variables,
      compositeQuery: {
        queryType: 'clickhouse_sql',
        panelType: 'table',
        chQueries: {
          conversationCount: {
            query: query.trim(),
          },
        },
      },
      dataSource: DATA_SOURCES.TRACES,
      projectId,
    };
    
    console.log('[getTotalConversationCount] ClickHouse query:', query.trim());
    console.log('[getTotalConversationCount] Variables:', variables);
    
    try {
      const resp = await this.makeRequest(payload);
      console.log('[getTotalConversationCount] ClickHouse response:', JSON.stringify(resp, null, 2));
      
      // Extract count from ClickHouse response
      // For COUNT queries, the value is in series[0].values[0].value
      const result = resp?.data?.result?.[0];
      if (result?.series && result.series.length > 0) {
        const firstSeries = result.series[0];
        
        // Try values[0].value first (standard format for COUNT queries)
        if (firstSeries.values && firstSeries.values.length > 0 && firstSeries.values[0].value) {
          const count = parseInt(firstSeries.values[0].value, 10);
          if (!Number.isNaN(count)) {
            console.log(`[getTotalConversationCount] ClickHouse COUNT DISTINCT returned: ${count}`);
            return count;
          }
        }
        
        // Fallback: try labels.count (some formats might put it there)
        if (firstSeries.labels?.count) {
          const count = parseInt(firstSeries.labels.count, 10);
          if (!Number.isNaN(count)) {
            console.log(`[getTotalConversationCount] ClickHouse COUNT DISTINCT returned (from labels): ${count}`);
            return count;
          }
        }
      }
      
      // Fallback if extraction fails
      console.warn('[getTotalConversationCount] ClickHouse query returned unexpected format, using fallback');
      return this.getTotalConversationCountWithSmallBatch(startTime, endTime, projectId, agentId);
      
    } catch (error) {
      console.error('[getTotalConversationCount] ClickHouse query error:', error);
      // Fallback to pagination method
      return this.getTotalConversationCountWithSmallBatch(startTime, endTime, projectId, agentId);
    }
  }
  
  private async getTotalConversationCountWithSmallBatch(
    startTime: number,
    endTime: number,
    projectId?: string,
    agentId?: string
  ): Promise<number> {
    console.log('[getTotalConversationCountWithSmallBatch] Retrying with batch size 1000');
    const payload = this.buildConversationActivityPayload(startTime, endTime, agentId, projectId);
    const resp = await this.makeRequestWithPagination(payload, 1000);
    const activitySeries = this.extractSeries(resp, 'lastActivity');
    
    const conversationIds = new Set<string>();
    for (const s of activitySeries) {
      const id = s.labels?.[SPAN_KEYS.CONVERSATION_ID];
      if (id) conversationIds.add(id);
    }
    
    const count = conversationIds.size;
    console.log('[getTotalConversationCountWithSmallBatch] Count with small batch:', count);
    return count;
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
      console.log('[getConversationStats] Using ClickHouse queries - fetching ALL conversations, paginating in memory');
      console.log('[getConversationStats] Called with:', {
        timeRange: {
          start: new Date(startTime).toISOString(),
          end: new Date(endTime).toISOString(),
        },
        pagination,
        filters,
        projectId,
        agentId,
        searchQuery,
      });
      
      // Fetch ALL conversation stats using ClickHouse - no pagination at DB level
      // We'll paginate in memory after fetching everything
      const stats = await this.fetchAllConversationStatsWithClickHouse(
        startTime,
        endTime,
        filters,
        projectId,
        agentId
      );
      
      console.log('[getConversationStats] Fetched', stats.length, 'total conversations');

      // Apply search filter
      let filteredStats = stats;
      if (searchQuery?.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredStats = filteredStats.filter(
          (s) =>
            s.firstUserMessage?.toLowerCase().includes(q) ||
            s.conversationId.toLowerCase().includes(q) ||
            s.agentId.toLowerCase().includes(q)
        );
      }

      // Apply span filters if needed
      if (filters?.spanName || filters?.attributes?.length) {
        filteredStats = await this.applySpanFilters(filteredStats, startTime, endTime, filters, projectId);
      }

      // Sort by first activity (descending - most recent first)
      filteredStats.sort((a, b) =>
        byFirstActivity(a.startTime, b.startTime)
      );

      // If no pagination requested, return all
      if (!pagination) {
        return filteredStats;
      }

      // Paginate in memory
      const { page, limit } = pagination;
      const total = filteredStats.length;
      const totalPages = Math.ceil(total / limit);
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedData = filteredStats.slice(startIdx, endIdx);

      console.log('[getConversationStats] Returning', paginatedData.length, 'stats for page', page, 'of', totalPages);
      return {
        data: paginatedData,
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
      console.error('[getConversationStats] Error stack:', e instanceof Error ? e.stack : 'No stack');
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
    // Convert timestamps
    const startTimeNano = startTime * 1000000;
    const endTimeNano = endTime * 1000000;
    const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
    const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
    
    // Build base WHERE clause
    let baseWhere = `
      timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
      AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
      AND attributes_string['conversation.id'] != ''
    `;
    
    const variables: Record<string, any> = {
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      start_timestamp: startTimeNano,
      end_timestamp: endTimeNano,
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
          AND name = 'ai.toolCall'
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
          AND name = 'ai.toolCall'
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
          AND name = 'ai.toolCall'
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
      
      // Errors: COUNT by conversation_id
      errors: `
        SELECT 
          attributes_string['conversation.id'] as conversation_id,
          COUNT(*) as count
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE ${baseWhere}
          AND has_error = true
        GROUP BY conversation_id
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
        step: 60,
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
    const resultsMap = new Map(results.map(r => [r.key, r.resp]));

    // Extract data from responses
    // For ClickHouse table queries, data comes in series format
    // Each series item represents a row, with columns in labels
    const extractTableData = (resp: any, queryName: string) => {
      const result = resp?.data?.result?.[0];
      if (!result?.series) {
        console.log(`[fetchAllConversationStatsWithClickHouse] No series data for ${queryName}`);
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
      console.log(`[fetchAllConversationStatsWithClickHouse] Extracted ${data.length} rows for ${queryName}, sample:`, data[0] || 'none');
      return data;
    };

    const toolsData = extractTableData(resultsMap.get('tools'), 'tools');
    const transfersData = extractTableData(resultsMap.get('transfers'), 'transfers');
    const delegationsData = extractTableData(resultsMap.get('delegations'), 'delegations');
    const aiCallsData = extractTableData(resultsMap.get('aiCalls'), 'aiCalls');
    const lastActivityData = extractTableData(resultsMap.get('lastActivity'), 'lastActivity');
    const metadataData = extractTableData(resultsMap.get('metadata'), 'metadata');
    const errorsData = extractTableData(resultsMap.get('errors'), 'errors');
    const userMessagesData = extractTableData(resultsMap.get('userMessages'), 'userMessages');

    // Build maps for aggregation
    const metaByConv = new Map<string, { tenantId: string; agentId: string; agentName: string }>();
    for (const row of metadataData) {
      const id = row.conversation_id || row.conversationId;
      if (id) {
        const agentId = row.agent_id || row.agentId || UNKNOWN_VALUE;
        const agentName = row.agent_name || row.agentName;
        // If agent_name is empty, try to use agent_id as fallback (better than "unknown")
        const finalAgentName = agentName && agentName !== '' ? agentName : (agentId !== UNKNOWN_VALUE ? agentId : UNKNOWN_VALUE);
        
        metaByConv.set(id, {
          tenantId: row.tenant_id || row.tenantId || UNKNOWN_VALUE,
          agentId,
          agentName: finalAgentName,
        });
      }
    }
    console.log('[fetchAllConversationStatsWithClickHouse] Extracted metadata for', metaByConv.size, 'conversations');

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
            console.warn('[fetchAllConversationStatsWithClickHouse] Invalid timestamp string for', id, ':', ts);
            continue;
          }
        } else if (typeof ts === 'number' && ts > 0) {
          timestamp = ts;
        } else {
          console.warn('[fetchAllConversationStatsWithClickHouse] Invalid timestamp type for', id, ':', typeof ts, ts);
          continue;
        }
        firstSeen.set(id, timestamp);
      }
    }
    console.log('[fetchAllConversationStatsWithClickHouse] Extracted timestamps for', firstSeen.size, 'conversations');
    if (firstSeen.size === 0 && lastActivityData.length > 0) {
      console.error('[fetchAllConversationStatsWithClickHouse] No timestamps extracted but had', lastActivityData.length, 'rows. Sample row:', lastActivityData[0]);
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
    for (const row of errorsData) {
      const convId = row.conversation_id;
      const count = parseInt(row.count || '0', 10);
      if (convId && !Number.isNaN(count)) {
        errorsByConv.set(convId, count);
      }
    }

    // Get first user message per conversation
    const firstMsgByConv = new Map<string, { content: string; timestamp: number }>();
    const msgsByConv = new Map<string, Array<{ t: number; c: string }>>();
    console.log('[fetchAllConversationStatsWithClickHouse] Processing', userMessagesData.length, 'user message rows');
    for (const row of userMessagesData) {
      const convId = row.conversation_id || row.conversationId;
      const content = row.message_content || row.messageContent;
      // The aggregated value comes in the 'value' field from ClickHouse table format
      const ts = row.value || row.first_timestamp_nano || row.firstTimestampNano;
      
      if (!convId) {
        console.warn('[fetchAllConversationStatsWithClickHouse] Row missing conversation_id:', Object.keys(row), row);
        continue;
      }
      
      if (!content || content === '') {
        console.warn('[fetchAllConversationStatsWithClickHouse] Row missing message_content for convId:', convId, 'row keys:', Object.keys(row));
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
    
    console.log('[fetchAllConversationStatsWithClickHouse] Grouped messages for', msgsByConv.size, 'conversations');
    
    for (const [id, arr] of msgsByConv) {
      // Sort by timestamp (ascending - earliest first)
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0];
      if (first?.c) {
        const content = first.c.length > 100 ? `${first.c.slice(0, 100)}...` : first.c;
        // Convert nanoseconds to milliseconds for timestamp
        const timestampMs = first.t > 0 ? nsToMs(first.t) : undefined;
        firstMsgByConv.set(id, { content, timestamp: timestampMs || 0 });
        if (id === userMessagesData[0]?.conversation_id) {
          console.log('[fetchAllConversationStatsWithClickHouse] Sample first message:', { id, content: content.substring(0, 50), timestampMs });
        }
      }
    }
    
    console.log('[fetchAllConversationStatsWithClickHouse] Extracted first messages for', firstMsgByConv.size, 'conversations');

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
      const meta = metaByConv.get(convId) || {
        tenantId: UNKNOWN_VALUE,
        agentId: UNKNOWN_VALUE,
        agentName: UNKNOWN_VALUE,
      };

      // Build tools array
      const toolsMap = toolsByConv.get(convId) || new Map();
      const toolsUsed = Array.from(toolsMap.entries()).map(([name, calls]) => ({
        name,
        calls,
        description: '', // ClickHouse query doesn't fetch descriptions
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
      const startTimeMs = (firstMsg?.timestamp && firstMsg.timestamp > 0)
        ? firstMsg.timestamp 
        : firstTimestamp 
          ? nsToMs(firstTimestamp) 
          : undefined;

      stats.push({
        conversationId: convId,
        tenantId: meta.tenantId,
        agentId: meta.agentId,
        agentName: meta.agentName,
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
      console.log('[getAICallsByAgent] Using ClickHouse query with GROUP BY agent.id');
      
      // Convert timestamps
      const startTimeNano = startTime * 1000000;
      const endTimeNano = endTime * 1000000;
      const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
      const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
      
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
        AND attributes_string['ai.operationId'] = 'ai.generateText.doGenerate'
      `;
      
      const variables: Record<string, any> = {
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        start_timestamp: startTimeNano,
        end_timestamp: endTimeNano,
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
        step: 60,
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
      
      console.log('[getAICallsByAgent] Response series count:', result?.series?.length || 0);
      
      // Extract results - handle both table and timeseries formats
      const totals: Array<{ agentId: string; totalCalls: number }> = [];
      if (result?.series && result.series.length > 0) {
        // Check if this is timeseries format (one series with multiple values)
        // or table format (multiple series, one per group)
        const firstSeries = result.series[0];
        
        if (result.series.length === 1 && firstSeries.values && Array.isArray(firstSeries.values) && firstSeries.values.length > 1) {
          // Timeseries format: one series with array of values
          // This shouldn't happen for GROUP BY without time dimension
          console.warn('[getAICallsByAgent] Unexpected timeseries format for GROUP BY query, got', firstSeries.values.length, 'values');
        } else {
          // Table format: multiple series or single series with one value
          console.log('[getAICallsByAgent] Processing table format');
          for (const seriesItem of result.series) {
            const agentId = seriesItem.labels?.agent_id || seriesItem.labels?.agentId || UNKNOWN_VALUE;
            const countValue = seriesItem.values?.[0]?.value ?? seriesItem.values?.[0] ?? seriesItem.labels?.count;
            
            if (countValue !== null && countValue !== undefined) {
              const count = typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
              if (!Number.isNaN(count)) {
                totals.push({ agentId, totalCalls: count });
                console.log('[getAICallsByAgent] Agent:', agentId, '→', count, 'calls');
              }
            }
          }
        }
      }
      
      console.log('[getAICallsByAgent] Extracted', totals.length, 'agent totals');
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
      console.log('[getConversationsPerDay] Using ClickHouse query with GROUP BY date');
      
      // Convert timestamps
      const startTimeNano = startTime * 1000000;
      const endTimeNano = endTime * 1000000;
      const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
      const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
      
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
      `;
      
      const variables: Record<string, any> = {
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        start_timestamp: startTimeNano,
        end_timestamp: endTimeNano,
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
        step: 60,
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
      
      console.log('[getConversationsPerDay] Response has', result?.series?.length || 0, 'series items');
      
      // Extract results from timeseries format
      // ClickHouse returns ONE series item with multiple values (one per timestamp)
      const buckets = new Map<string, number>();
      if (result?.series && result.series.length > 0) {
        const seriesItem = result.series[0]; // Get the first (and typically only) series
        
        if (seriesItem.values && Array.isArray(seriesItem.values)) {
          console.log('[getConversationsPerDay] Processing', seriesItem.values.length, 'time buckets');
          
          for (const valueItem of seriesItem.values) {
            // Each valueItem has: { timestamp: <milliseconds>, value: "<count>" }
            const timestamp = valueItem.timestamp;
            const countValue = valueItem.value;
            
            if (timestamp && countValue !== null && countValue !== undefined) {
              // Timestamp is in milliseconds (not nanoseconds) for timeseries format
              const dateMs = typeof timestamp === 'number' ? timestamp : parseFloat(timestamp);
              const dateStr = new Date(dateMs).toISOString().split('T')[0];
              
              const count = typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
              if (!Number.isNaN(count)) {
                buckets.set(dateStr, count);
                console.log('[getConversationsPerDay] Added:', dateStr, '→', count);
              }
            }
          }
          console.log('[getConversationsPerDay] Extracted', buckets.size, 'date buckets');
        }
      } else {
        console.warn('[getConversationsPerDay] No series data in result');
      }
      
      // Fill in all dates in range (including zeros)
      const finalData = datesRange(startTime, endTime).map((date) => ({
        date,
        count: buckets.get(date) || 0,
      }));
      
      console.log('[getConversationsPerDay] Returning', finalData.length, 'date buckets with', buckets.size, 'non-zero');
      return finalData;
    } catch (e) {
      console.error('getConversationsPerDay error:', e);
      return datesRange(startTime, endTime).map((date) => ({ date, count: 0 }));
    }
  }

  async getAggregateStats(
    startTime: number,
    endTime: number,
    _filters?: SpanFilterOptions,
    projectId?: string,
    agentId?: string
  ) {
    try {
      console.log('[getAggregateStats] Using ClickHouse queries for all aggregate stats');
      
      // Convert timestamps
      const startTimeNano = startTime * 1000000;
      const endTimeNano = endTime * 1000000;
      const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
      const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
      
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND attributes_string['conversation.id'] != ''
      `;
      
      const variables: Record<string, any> = {
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        start_timestamp: startTimeNano,
        end_timestamp: endTimeNano,
      };
      
      if (projectId) {
        baseWhere += ` AND attributes_string['project.id'] = {{.project_id}}`;
        variables.project_id = projectId;
      }
      if (agentId && agentId !== 'all') {
        baseWhere += ` AND attributes_string['agent.id'] = {{.agent_id}}`;
        variables.agent_id = agentId;
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
            AND name = 'ai.toolCall'
            AND attributes_string['ai.toolType'] = 'mcp'
        `,
        totalTransfers: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND name = 'ai.toolCall'
            AND attributes_string['ai.toolType'] = 'transfer'
        `,
        totalDelegations: `
          SELECT COUNT(*) as count
          FROM signoz_traces.distributed_signoz_index_v3
          WHERE ${baseWhere}
            AND name = 'ai.toolCall'
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
          step: 60,
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
            if (firstSeries.values && firstSeries.values.length > 0 && firstSeries.values[0].value) {
              const count = parseInt(firstSeries.values[0].value, 10);
              if (!Number.isNaN(count)) {
                console.log(`[getAggregateStats] ${key}: ${count}`);
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
      const statsMap = new Map(results.map(r => [r.key, r.count]));
      
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
      console.log('[getAvailableSpanNames] Using ClickHouse query with DISTINCT name');
      
      // Convert timestamps
      const startTimeNano = startTime * 1000000;
      const endTimeNano = endTime * 1000000;
      const startDatetime = new Date(startTime).toISOString().replace('T', ' ').slice(0, -1);
      const endDatetime = new Date(endTime).toISOString().replace('T', ' ').slice(0, -1);
      
      // Build base WHERE clause
      let baseWhere = `
        timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
        AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
        AND name != ''
      `;
      
      const variables: Record<string, any> = {
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        start_timestamp: startTimeNano,
        end_timestamp: endTimeNano,
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
        step: 60,
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
      
      console.log('[getAvailableSpanNames] Extracted', names.size, 'unique span names');
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
            limit: QUERY_DEFAULTS.LIMIT,
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
      {
        key: { key: SPAN_KEYS.TENANT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
        op: OPERATORS.EXISTS,
        value: '',
      },
      {
        key: { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
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
            limit: QUERY_DEFAULTS.LIMIT,
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
      // If specific conversation IDs are provided, filter by them
      if (conversationIds && conversationIds.length > 0) {
        // For each conversation ID, add an OR condition
        // Note: SigNoz might not support IN clause, so we build multiple OR conditions
        if (conversationIds.length === 1) {
          filtered = [
            ...filtered,
            {
              key: {
                key: SPAN_KEYS.CONVERSATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: conversationIds[0],
            },
          ];
        } else {
          // For multiple IDs, we'd ideally use an IN operator
          // Since SigNoz may not support it, we limit to EXISTS (fetches all)
          // and rely on post-filtering in the calling code
          // This is a limitation we'll document
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
              items: withProjectAndAgent([
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
            limit: QUERY_DEFAULTS.LIMIT,
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
