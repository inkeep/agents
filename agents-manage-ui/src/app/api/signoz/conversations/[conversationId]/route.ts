import axios from 'axios';
import axiosRetry from 'axios-retry';
import { type NextRequest, NextResponse } from 'next/server';
import {
  ACTIVITY_NAMES,
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
  AGENT_IDS,
  AGGREGATE_OPERATORS,
  AI_OPERATIONS,
  DATA_SOURCES,
  OPERATORS,
  ORDER_DIRECTIONS,
  PANEL_TYPES,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  QUERY_FIELD_CONFIGS,
  QUERY_TYPES,
  SPAN_KEYS,
  SPAN_NAMES,
  TOOL_NAMES,
  UNKNOWN_VALUE,
} from '@/constants/signoz';
import { fetchAllSpanAttributes_SQL } from '@/lib/api/signoz-sql';
import { getLogger } from '@/lib/logger';
import { DEFAULT_SIGNOZ_URL } from '@/lib/runtime-config/defaults';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

export const dynamic = 'force-dynamic';

const SIGNOZ_URL = process.env.SIGNOZ_URL || DEFAULT_SIGNOZ_URL;
const SIGNOZ_API_KEY = process.env.SIGNOZ_API_KEY || '';

// ---------- Types

type SigNozListItem = { data?: Record<string, any>; [k: string]: any };
type SigNozResp = {
  data?: { result?: Array<{ queryName?: string; list?: SigNozListItem[] }> };
};

const START_2020_MS = new Date('2020-01-01T00:00:00Z').getTime();

function getField(span: SigNozListItem, key: string) {
  const d = span?.data ?? span;
  return d?.[key] ?? span?.[key];
}

function getString(span: SigNozListItem, key: string, fallback = ''): string {
  const v = getField(span, key);
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

function getNumber(span: SigNozListItem, key: string, fallback = 0): number {
  const v = getField(span, key);
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function signozQuery(payload: any): Promise<SigNozResp> {
  const logger = getLogger('signoz-query');

  // Check if API key is configured
  if (!SIGNOZ_API_KEY || SIGNOZ_API_KEY.trim() === '') {
    throw new Error(
      'SIGNOZ_API_KEY is not configured. Please set the SIGNOZ_API_KEY environment variable.'
    );
  }

  try {
    logger.info({ payload }, 'SigNoz payload');
    const signozEndpoint = `${SIGNOZ_URL}/api/v4/query_range`;
    const response = await axios.post(signozEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': SIGNOZ_API_KEY,
      },
      timeout: 30000,
    });
    const json = response.data as SigNozResp;
    const responseData = json?.data?.result?.map((r) => ({
      queryName: r.queryName,
      count: r.list?.length,
    }));
    logger.info({ responseData }, 'SigNoz response (truncated)');
    return json;
  } catch (e) {
    logger.error({ error: e }, 'SigNoz query error');

    // Re-throw the error with more context for proper error handling
    if (axios.isAxiosError(e)) {
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT') {
        throw new Error(`SigNoz service unavailable: ${e.message}`);
      }
      if (e.response?.status === 401 || e.response?.status === 403) {
        throw new Error(`SigNoz authentication failed: ${e.response.statusText}`);
      }
      if (e.response?.status === 400) {
        throw new Error(`Invalid SigNoz query: ${e.response.statusText}`);
      }
      if (e.response?.status === 429) {
        throw new Error(`SigNoz rate limit exceeded: ${e.response.statusText}`);
      }
      if (e.response?.status && e.response.status >= 500) {
        throw new Error(`SigNoz server error: ${e.response.statusText}`);
      }
      throw new Error(`SigNoz request failed: ${e.message}`);
    }
    throw new Error(`SigNoz query failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

function parseList(resp: SigNozResp, name: string): SigNozListItem[] {
  const list = resp?.data?.result?.find((r) => r?.queryName === name)?.list ?? [];
  return Array.isArray(list) ? list : [];
}

// ---------- Payload builder (single combined "list" payload)

function buildConversationListPayload(
  conversationId: string,
  start = START_2020_MS,
  end = Date.now()
) {
  const baseFilters = [
    {
      key: {
        key: SPAN_KEYS.CONVERSATION_ID,
        ...QUERY_FIELD_CONFIGS.STRING_TAG,
      },
      op: OPERATORS.EQUALS,
      value: conversationId,
    },
  ];

  const listQuery = (queryName: string, items: any[], selectColumns: any[], limit?: number) => ({
    dataSource: DATA_SOURCES.TRACES,
    queryName,
    aggregateOperator: AGGREGATE_OPERATORS.NOOP,
    aggregateAttribute: {},
    filters: { op: OPERATORS.AND, items: [...baseFilters, ...items] },
    selectColumns,
    expression: queryName,
    disabled: QUERY_DEFAULTS.DISABLED,
    having: QUERY_DEFAULTS.HAVING,
    stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
    limit,
    orderBy: [{ columnName: SPAN_KEYS.TIMESTAMP, order: ORDER_DIRECTIONS.DESC }],
    groupBy: QUERY_DEFAULTS.EMPTY_GROUP_BY,
    offset: QUERY_DEFAULTS.OFFSET,
  });

  return {
    start,
    end,
    step: QUERY_DEFAULTS.STEP,
    variables: {},
    compositeQuery: {
      queryType: QUERY_TYPES.BUILDER,
      panelType: PANEL_TYPES.LIST,
      builderQueries: {
        toolCalls: listQuery(
          QUERY_EXPRESSIONS.TOOL_CALLS,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.AI_TOOL_CALL,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.AI_TOOL_CALL_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_TOOL_CALL_RESULT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_TOOL_CALL_ARGS,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            { key: SPAN_KEYS.AI_TOOL_TYPE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AI_AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.DELEGATION_FROM_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.DELEGATION_TO_AGENT_ID,
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
            { key: SPAN_KEYS.TOOL_PURPOSE, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.GRAPH_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          ]
        ),

        // context resolution spans
        contextResolution: listQuery(
          QUERY_EXPRESSIONS.CONTEXT_RESOLUTION,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.CONTEXT_RESOLUTION,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            { key: SPAN_KEYS.CONTEXT_URL, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_CONFIG_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_AGENT_GRAPH_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_REQUEST_KEYS,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // context handle spans
        contextHandle: listQuery(
          QUERY_EXPRESSIONS.CONTEXT_HANDLE,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.CONTEXT_HANDLE,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            { key: SPAN_KEYS.CONTEXT_URL, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_CONFIG_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_AGENT_GRAPH_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_REQUEST_KEYS,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // error categories
        contextErrors: listQuery(
          QUERY_EXPRESSIONS.CONTEXT_ERRORS,
          [
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
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),
        agentGenerationErrors: listQuery(
          QUERY_EXPRESSIONS.AGENT_GENERATION_ERRORS,
          [
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
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // user messages
        userMessages: listQuery(
          QUERY_EXPRESSIONS.USER_MESSAGES,
          [
            {
              key: {
                key: SPAN_KEYS.MESSAGE_CONTENT,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.NOT_EQUALS,
              value: '',
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.MESSAGE_CONTENT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.MESSAGE_TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            { key: SPAN_KEYS.GRAPH_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.GRAPH_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
          ]
        ),

        // assistant messages
        aiAssistantMessages: listQuery(
          QUERY_EXPRESSIONS.AI_ASSISTANT_MESSAGES,
          [
            {
              key: {
                key: SPAN_KEYS.AI_RESPONSE_CONTENT,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.NOT_EQUALS,
              value: '',
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.AI_RESPONSE_CONTENT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_RESPONSE_TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_AGENT_NAME_ALT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // AI generations
        aiGenerations: listQuery(
          QUERY_EXPRESSIONS.AI_GENERATIONS,
          [
            {
              key: {
                key: SPAN_KEYS.AI_OPERATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: AI_OPERATIONS.GENERATE_TEXT,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_RESPONSE_MODEL,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
              ...QUERY_FIELD_CONFIGS.INT64_TAG,
            },
            {
              key: SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
              ...QUERY_FIELD_CONFIGS.INT64_TAG,
            },
            {
              key: SPAN_KEYS.AI_RESPONSE_TEXT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // AI streaming text
        aiStreamingText: listQuery(
          QUERY_EXPRESSIONS.AI_STREAMING_TEXT,
          [
            {
              key: {
                key: SPAN_KEYS.AI_OPERATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: AI_OPERATIONS.STREAM_TEXT,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.AI_RESPONSE_TEXT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_RESPONSE_MODEL,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_MODEL_PROVIDER,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_OPERATION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
              ...QUERY_FIELD_CONFIGS.INT64_TAG,
            },
            {
              key: SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS,
              ...QUERY_FIELD_CONFIGS.INT64_TAG,
            },
          ]
        ),

        // context fetchers
        contextFetchers: listQuery(
          QUERY_EXPRESSIONS.CONTEXT_FETCHERS,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.CONTEXT_FETCHER,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            { key: SPAN_KEYS.HTTP_URL, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.HTTP_STATUS_CODE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.HTTP_RESPONSE_BODY_SIZE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        durationSpans: listQuery(
          QUERY_EXPRESSIONS.DURATION_SPANS,
          [],
          [
            {
              key: SPAN_KEYS.TRACE_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.PARENT_SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.DURATION_NANO,
              ...QUERY_FIELD_CONFIGS.FLOAT64_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.TIMESTAMP,
              ...QUERY_FIELD_CONFIGS.INT64_TAG_COLUMN,
            },
          ]
        ),
      },
    },
    dataSource: DATA_SOURCES.TRACES,
  };
}

// ---------- Main handler

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const params = await context.params;
  const { conversationId } = params;
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
  }

  try {
    const start = START_2020_MS;
    const end = Date.now();

    // one combined LIST request for everything
    const payload = buildConversationListPayload(conversationId, start, end);
    const resp = await signozQuery(payload);

    const toolCallSpans = parseList(resp, QUERY_EXPRESSIONS.TOOL_CALLS);
    const contextResolutionSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_RESOLUTION);
    const contextHandleSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_HANDLE);
    const contextErrorSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_ERRORS);
    const agentGenErrorSpans = parseList(resp, QUERY_EXPRESSIONS.AGENT_GENERATION_ERRORS);
    const userMessageSpans = parseList(resp, QUERY_EXPRESSIONS.USER_MESSAGES);
    const aiAssistantSpans = parseList(resp, QUERY_EXPRESSIONS.AI_ASSISTANT_MESSAGES);
    const aiGenerationSpans = parseList(resp, QUERY_EXPRESSIONS.AI_GENERATIONS);
    const aiStreamingSpans = parseList(resp, QUERY_EXPRESSIONS.AI_STREAMING_TEXT);
    const contextFetcherSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_FETCHERS);
    const durationSpans = parseList(resp, QUERY_EXPRESSIONS.DURATION_SPANS);

    let graphId: string | null = null;
    let graphName: string | null = null;
    for (const s of userMessageSpans) {
      graphId = getString(s, SPAN_KEYS.GRAPH_ID, '') || null;
      graphName = getString(s, SPAN_KEYS.GRAPH_NAME, '') || null;
      if (graphId || graphName) break;
    }
    // activities
    type Activity = {
      id: string;
      type:
        | 'tool_call'
        | 'ai_generation'
        | 'context_fetch'
        | 'context_resolution'
        | 'user_message'
        | 'ai_assistant_message'
        | 'ai_model_streamed_text';
      name: string;
      description: string;
      timestamp: string;
      status: 'success' | 'error' | 'pending';
      agentId?: string;
      agentName?: string;
      result?: string;
      // ai
      aiModel?: string;
      inputTokens?: number;
      outputTokens?: number;
      serviceTier?: string;
      aiResponseContent?: string;
      aiResponseTimestamp?: string;
      aiResponseText?: string;
      // user
      messageContent?: string;
      // context resolution
      contextConfigId?: string;
      contextAgentGraphId?: string;
      contextRequestKeys?: string[];
      contextTrigger?: string;
      contextStatusDescription?: string;
      contextUrl?: string;
      // tool specifics
      toolType?: string;
      toolPurpose?: string;
      toolCallArgs?: string;
      toolCallResult?: string;
      // delegation/transfer
      delegationFromAgentId?: string;
      delegationToAgentId?: string;
      transferFromAgentId?: string;
      transferToAgentId?: string;
      // streaming
      aiStreamTextContent?: string;
      aiStreamTextModel?: string;
      aiStreamTextOperationId?: string;
      // save_tool_result specifics
      saveResultSaved?: boolean;
      saveArtifactType?: string;
      saveArtifactName?: string;
      saveArtifactDescription?: string;
      saveSummaryData?: Record<string, any>;
      saveTotalArtifacts?: number;
      saveOperationId?: string;
      saveToolCallId?: string;
      saveFunctionId?: string;
      saveFacts?: string;
      saveToolArgs?: Record<string, any>;
      saveFullResult?: Record<string, any>;
    };

    const activities: Activity[] = [];

    // tool calls → activities
    for (const span of toolCallSpans) {
      const name = getString(span, SPAN_KEYS.AI_TOOL_CALL_NAME, 'Unknown Tool');
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const toolType = getString(span, SPAN_KEYS.AI_TOOL_TYPE, '');
      const toolPurpose = getString(span, SPAN_KEYS.TOOL_PURPOSE, '');
      const delegationFromAgentId = getString(span, SPAN_KEYS.DELEGATION_FROM_AGENT_ID, '');
      const delegationToAgentId = getString(span, SPAN_KEYS.DELEGATION_TO_AGENT_ID, '');
      const transferFromAgentId = getString(span, SPAN_KEYS.TRANSFER_FROM_AGENT_ID, '');
      const transferToAgentId = getString(span, SPAN_KEYS.TRANSFER_TO_AGENT_ID, '');

      // Extract tool call args and result for ALL tool calls
      const toolCallArgs = getString(span, SPAN_KEYS.AI_TOOL_CALL_ARGS, '');
      const toolCallResult = getString(span, SPAN_KEYS.AI_TOOL_CALL_RESULT, '');

      // Parse save_tool_result JSON if present
      let saveFields: any = {};
      if (name === TOOL_NAMES.SAVE_TOOL_RESULT) {
        const operationId = getString(span, SPAN_KEYS.AI_OPERATION_ID, '');
        const toolCallId = getString(span, SPAN_KEYS.AI_TOOL_CALL_ID, '');
        const functionId = getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '');

        // Parse tool arguments
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(toolCallArgs);
        } catch (_e) {
          // Keep empty if parsing fails
        }

        // Parse tool result
        try {
          const parsed = JSON.parse(toolCallResult);
          // Extract first artifact info if available
          const firstArtifact = parsed.artifacts
            ? (Object.values(parsed.artifacts)[0] as any)
            : null;

          saveFields = {
            saveResultSaved: parsed.saved === true,
            saveArtifactType: parsed.artifactType || parsedArgs.artifactType || undefined,
            saveArtifactName: firstArtifact?.name || parsedArgs.name || undefined,
            saveArtifactDescription:
              firstArtifact?.description || parsedArgs.description || undefined,
            saveSummaryData: firstArtifact?.summaryData || undefined,
            saveTotalArtifacts: parsed.totalArtifacts || undefined,
            saveOperationId: operationId || undefined,
            saveToolCallId: toolCallId || undefined,
            saveFunctionId: functionId || undefined,
            saveToolArgs: parsedArgs,
            saveFullResult: parsed,
          };
        } catch (_e) {
          // If parsing fails, assume not saved
          saveFields = {
            saveResultSaved: false,
            saveOperationId: operationId || undefined,
            saveToolCallId: toolCallId || undefined,
            saveFunctionId: functionId || undefined,
          };
        }
      }

      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.TOOL_CALL,
        name,
        description: `Called ${name}`,
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentName: getString(span, SPAN_KEYS.AI_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError ? `Tool call failed (${durMs.toFixed(2)}ms)` : `${durMs.toFixed(2)}ms`,
        toolType: toolType || undefined,
        toolPurpose: toolPurpose || undefined,
        delegationFromAgentId: delegationFromAgentId || undefined,
        delegationToAgentId: delegationToAgentId || undefined,
        transferFromAgentId: transferFromAgentId || undefined,
        transferToAgentId: transferToAgentId || undefined,
        toolCallArgs: toolCallArgs || undefined,
        toolCallResult: toolCallResult || undefined,
        ...saveFields, // Include save_tool_result specific fields
      });
    }

    // context resolution → activities
    for (const span of contextResolutionSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const statusMessage =
        getString(span, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');

      // context keys maybe JSON
      let keys: string[] | undefined;
      const rawKeys = getField(span, SPAN_KEYS.CONTEXT_REQUEST_KEYS);
      try {
        if (typeof rawKeys === 'string') keys = JSON.parse(rawKeys);
        else if (Array.isArray(rawKeys)) keys = rawKeys as string[];
      } catch {}

      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.CONTEXT_RESOLUTION,
        name: ACTIVITY_NAMES.CONTEXT_FETCH,
        description: `Context fetch ${hasError ? 'failed' : 'completed'}`,
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        contextStatusDescription: statusMessage || undefined,
        contextUrl: getString(span, SPAN_KEYS.CONTEXT_URL, '') || undefined,
        contextConfigId: getString(span, SPAN_KEYS.CONTEXT_CONFIG_ID, '') || undefined,
        contextAgentGraphId: getString(span, SPAN_KEYS.CONTEXT_AGENT_GRAPH_ID, '') || undefined,
        contextRequestKeys: keys,
      });
    }

    // context handle → activities
    for (const span of contextHandleSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const statusMessage =
        getString(span, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');

      // context keys maybe JSON
      let keys: string[] | undefined;
      const rawKeys = getField(span, SPAN_KEYS.CONTEXT_REQUEST_KEYS);
      try {
        if (typeof rawKeys === 'string') keys = JSON.parse(rawKeys);
        else if (Array.isArray(rawKeys)) keys = rawKeys as string[];
      } catch {}

      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.CONTEXT_RESOLUTION,
        name: ACTIVITY_NAMES.CONTEXT_FETCH,
        description: `Context handle ${hasError ? 'failed' : 'completed'}`,
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        contextStatusDescription: statusMessage || undefined,
        contextUrl: getString(span, SPAN_KEYS.CONTEXT_URL, '') || undefined,
        contextConfigId: getString(span, SPAN_KEYS.CONTEXT_CONFIG_ID, '') || undefined,
        contextAgentGraphId: getString(span, SPAN_KEYS.CONTEXT_AGENT_GRAPH_ID, '') || undefined,
        contextRequestKeys: keys,
      });
    }

    const contextErrors = contextErrorSpans.map((s) => ({
      spanId: getString(s, SPAN_KEYS.SPAN_ID, ''),
      timestamp: s.timestamp,
      statusDescription:
        getString(s, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(s, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '') ||
        'No description available',
    }));
    const agentGenerationErrors = agentGenErrorSpans.map((s) => ({
      spanId: getString(s, SPAN_KEYS.SPAN_ID, ''),
      timestamp: s.timestamp,
      statusDescription:
        getString(s, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(s, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '') ||
        'No description available',
    }));
    const errorCount = contextErrors.length + agentGenerationErrors.length;

    // user messages
    for (const span of userMessageSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.USER_MESSAGE,
        name: ACTIVITY_NAMES.USER_MESSAGE,
        description: 'User sent a message',
        timestamp: getString(span, SPAN_KEYS.MESSAGE_TIMESTAMP),
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentId: AGENT_IDS.USER,
        agentName: ACTIVITY_NAMES.USER,
        result: hasError
          ? 'Message processing failed'
          : `Message received successfully (${durMs.toFixed(2)}ms)`,
        messageContent: getString(span, SPAN_KEYS.MESSAGE_CONTENT, ''),
      });
    }

    // ai assistant messages
    for (const span of aiAssistantSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE,
        name: ACTIVITY_NAMES.AI_ASSISTANT_MESSAGE,
        description: 'AI Assistant responded',
        timestamp: getString(span, SPAN_KEYS.AI_RESPONSE_TIMESTAMP),
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentId: AGENT_IDS.AI_ASSISTANT,
        agentName: getString(span, SPAN_KEYS.AI_AGENT_NAME_ALT, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError
          ? 'AI response failed'
          : `AI response sent successfully (${durMs.toFixed(2)}ms)`,
        aiResponseContent: getString(span, SPAN_KEYS.AI_RESPONSE_CONTENT, ''),
        aiResponseTimestamp: getString(span, SPAN_KEYS.AI_RESPONSE_TIMESTAMP, '') || undefined,
      });
    }

    // ai generations
    for (const span of aiGenerationSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.AI_GENERATION,
        name: ACTIVITY_NAMES.AI_TEXT_GENERATION,
        description: 'AI model generating text response',
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentId: getString(span, SPAN_KEYS.AGENT_ID, '') || undefined,
        agentName: getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '') || undefined,
        result: hasError
          ? 'AI generation failed'
          : `AI text generated successfully (${durMs.toFixed(2)}ms)`,
        aiModel: getString(span, SPAN_KEYS.AI_RESPONSE_MODEL, 'Unknown Model'),
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        aiResponseText: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, '') || undefined,
      });
    }

    // ai streaming text
    for (const span of aiStreamingSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
        name: ACTIVITY_NAMES.AI_STREAMING_TEXT,
        description: 'AI model streaming text response',
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentId: getString(span, SPAN_KEYS.AGENT_ID, '') || undefined,
        agentName: getString(span, SPAN_KEYS.AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError
          ? 'AI streaming failed'
          : `AI text streamed successfully (${durMs.toFixed(2)}ms)`,
        aiStreamTextContent: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, ''),
        aiStreamTextModel: getString(span, SPAN_KEYS.AI_RESPONSE_MODEL, 'Unknown Model'),
        aiStreamTextOperationId: getString(span, SPAN_KEYS.AI_OPERATION_ID, '') || undefined,
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
      });
    }

    // context fetchers
    for (const span of contextFetcherSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      activities.push({
        id: getString(span, SPAN_KEYS.SPAN_ID, ''),
        type: ACTIVITY_TYPES.CONTEXT_FETCH,
        name: ACTIVITY_NAMES.CONTEXT_FETCH,
        description: '',
        timestamp: span.timestamp,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        agentId: UNKNOWN_VALUE,
        agentName: 'Context Fetcher',
        result: hasError
          ? 'Context fetch failed'
          : getString(span, SPAN_KEYS.HTTP_URL, 'Unknown URL'),
      });
    }

    // Pre-parse all timestamps once for better performance
    const allSpanTimes = durationSpans.map((s) => new Date(s.timestamp).getTime());
    const operationStartTime = allSpanTimes.length > 0 ? Math.min(...allSpanTimes) : null;
    const operationEndTime = allSpanTimes.length > 0 ? Math.max(...allSpanTimes) : null;

    // Sort activities by pre-parsed timestamps
    activities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Conversation duration: user-facing timeline (first user message to last AI response)
    const firstUser = activities.find((a) => a.type === ACTIVITY_TYPES.USER_MESSAGE);
    const lastAssistant = [...activities]
      .reverse()
      .find(
        (a) =>
          a.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          a.type === ACTIVITY_TYPES.AI_GENERATION ||
          a.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
      );
    const conversationStartTime = firstUser
      ? new Date(firstUser.timestamp).getTime()
      : operationStartTime;
    const conversationEndTime = lastAssistant
      ? new Date(lastAssistant.timestamp).getTime()
      : operationEndTime;
    const conversationDurationMs =
      conversationStartTime && conversationEndTime
        ? Math.max(0, conversationEndTime - conversationStartTime)
        : 0;

    // Single pass token counting for better performance
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const activity of activities) {
      if (
        (activity.type === ACTIVITY_TYPES.AI_GENERATION ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT) &&
        typeof activity.inputTokens === 'number'
      ) {
        totalInputTokens += activity.inputTokens;
      }
      if (
        (activity.type === ACTIVITY_TYPES.AI_GENERATION ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT) &&
        typeof activity.outputTokens === 'number'
      ) {
        totalOutputTokens += activity.outputTokens;
      }
    }

    const openAICallsCount = aiGenerationSpans.length;

    let allSpanAttributes: Array<{
      spanId: string;
      traceId: string;
      timestamp: string;
      data: Record<string, any>;
    }> = [];
    try {
      allSpanAttributes = await fetchAllSpanAttributes_SQL(
        conversationId,
        SIGNOZ_URL,
        SIGNOZ_API_KEY
      );
    } catch (e) {
      const logger = getLogger('span-attributes');
      logger.error({ error: e }, 'allSpanAttributes SQL fetch skipped/failed');
    }

    const conversation = {
      conversationId,
      startTime: conversationStartTime ? conversationStartTime : null,
      endTime: conversationEndTime ? conversationEndTime : null,
      duration: conversationDurationMs,
      totalMessages: (() => {
        let count = 0;
        for (const a of activities) {
          if (
            a.type === ACTIVITY_TYPES.USER_MESSAGE ||
            a.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE
          )
            count++;
        }
        return count;
      })(),
      totalToolCalls: activities.filter((a) => a.type === ACTIVITY_TYPES.TOOL_CALL).length,
      totalErrors: errorCount,
      totalOpenAICalls: openAICallsCount,
    };

    const timelineActivities = [];
    for (const a of activities) {
      timelineActivities.push({
        ...a,
        toolName: a.type === ACTIVITY_TYPES.TOOL_CALL ? a.name : undefined,
        toolResult: a.result,
        toolDescription: a.description,
      });
    }

    return NextResponse.json({
      ...conversation,
      activities: timelineActivities,
      conversationStartTime: conversationStartTime ? conversationStartTime : null,
      conversationEndTime: conversationEndTime ? conversationEndTime : null,
      conversationDuration: conversationDurationMs,
      totalInputTokens,
      totalOutputTokens,
      mcpToolErrors: [],
      contextErrors,
      agentGenerationErrors,
      graphId,
      graphName,
      allSpanAttributes,
    });
  } catch (error) {
    const logger = getLogger('conversation-details');
    logger.error({ error }, 'Error fetching conversation details');

    // Provide more specific error responses based on the error type
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch conversation details';

    if (errorMessage.includes('SIGNOZ_API_KEY is not configured')) {
      return NextResponse.json({ error: errorMessage }, { status: 501 });
    }
    if (errorMessage.includes('SigNoz service unavailable')) {
      return NextResponse.json({ error: errorMessage }, { status: 503 });
    }
    if (errorMessage.includes('SigNoz authentication failed')) {
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
    if (errorMessage.includes('Invalid SigNoz query')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    if (errorMessage.includes('SigNoz rate limit exceeded')) {
      return NextResponse.json({ error: errorMessage }, { status: 429 });
    }
    if (errorMessage.includes('SigNoz server error')) {
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
