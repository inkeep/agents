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

const SIGNOZ_URL = process.env.SIGNOZ_URL || process.env.PUBLIC_SIGNOZ_URL || DEFAULT_SIGNOZ_URL;
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
    const signozEndpoint = `${SIGNOZ_URL}/api/v4/query_range`;
    const response = await axios.post(signozEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': SIGNOZ_API_KEY,
      },
      timeout: 30000,
    });
    const json = response.data as SigNozResp;
    const responseData = json?.data?.result
      ? json.data.result.map((r) => ({
          queryName: r.queryName,
          count: r.list?.length,
        }))
      : [];
    logger.debug({ responseData }, 'SigNoz response (truncated)');
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
            {
              key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
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
            {
              key: SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID,
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
            { key: SPAN_KEYS.SUB_AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.SUB_AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
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
              key: SPAN_KEYS.CONTEXT_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_HEADERS_KEYS,
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
              key: SPAN_KEYS.CONTEXT_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.CONTEXT_HEADERS_KEYS,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        agentGenerations: listQuery(
          QUERY_EXPRESSIONS.AGENT_GENERATIONS,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.AGENT_GENERATION,
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
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.STATUS_MESSAGE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.OTEL_STATUS_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // Count spans with errors
        spansWithErrors: listQuery(
          QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
          [
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
              key: SPAN_KEYS.NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
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
            { key: SPAN_KEYS.AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
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
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
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
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
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
              key: SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_MODEL_ID,
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
            {
              key: SPAN_KEYS.AI_RESPONSE_TOOL_CALLS,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_PROMPT_MESSAGES,
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
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
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
            { key: SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.AI_RESPONSE_TEXT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_MODEL_ID,
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
            {
              key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        // AI streaming object
        aiStreamingObject: listQuery(
          QUERY_EXPRESSIONS.AI_STREAMING_OBJECT,
          [
            {
              key: {
                key: SPAN_KEYS.AI_OPERATION_ID,
                ...QUERY_FIELD_CONFIGS.STRING_TAG,
              },
              op: OPERATORS.EQUALS,
              value: AI_OPERATIONS.STREAM_OBJECT,
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
            { key: SPAN_KEYS.SUB_AGENT_ID, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            { key: SPAN_KEYS.SUB_AGENT_NAME, ...QUERY_FIELD_CONFIGS.STRING_TAG },
            {
              key: SPAN_KEYS.AI_RESPONSE_OBJECT,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.AI_MODEL_ID,
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
            {
              key: SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
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

        artifactProcessing: listQuery(
          QUERY_EXPRESSIONS.ARTIFACT_PROCESSING,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.ARTIFACT_PROCESSING,
            },
          ],
          [
            {
              key: SPAN_KEYS.SPAN_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.HAS_ERROR,
              ...QUERY_FIELD_CONFIGS.BOOL_TAG_COLUMN,
            },
            {
              key: SPAN_KEYS.ARTIFACT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.ARTIFACT_TYPE,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.ARTIFACT_TOOL_CALL_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.ARTIFACT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.ARTIFACT_DESCRIPTION,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.ARTIFACT_DATA,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        toolApprovalRequested: listQuery(
          QUERY_EXPRESSIONS.TOOL_APPROVAL_REQUESTED,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.TOOL_APPROVAL_REQUESTED,
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
              key: SPAN_KEYS.TOOL_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.TOOL_CALL_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        toolApprovalApproved: listQuery(
          QUERY_EXPRESSIONS.TOOL_APPROVAL_APPROVED,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.TOOL_APPROVAL_APPROVED,
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
              key: SPAN_KEYS.TOOL_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.TOOL_CALL_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
          ]
        ),

        toolApprovalDenied: listQuery(
          QUERY_EXPRESSIONS.TOOL_APPROVAL_DENIED,
          [
            {
              key: {
                key: SPAN_KEYS.NAME,
                ...QUERY_FIELD_CONFIGS.STRING_TAG_COLUMN,
              },
              op: OPERATORS.EQUALS,
              value: SPAN_NAMES.TOOL_APPROVAL_DENIED,
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
              key: SPAN_KEYS.TOOL_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.TOOL_CALL_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_ID,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
            },
            {
              key: SPAN_KEYS.SUB_AGENT_NAME,
              ...QUERY_FIELD_CONFIGS.STRING_TAG,
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
  context: RouteContext<'/api/signoz/conversations/[conversationId]'>
) {
  const { conversationId } = await context.params;
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
    const agentGenerationSpans = parseList(resp, QUERY_EXPRESSIONS.AGENT_GENERATIONS);
    const spansWithErrorsList = parseList(resp, QUERY_EXPRESSIONS.SPANS_WITH_ERRORS);
    const userMessageSpans = parseList(resp, QUERY_EXPRESSIONS.USER_MESSAGES);
    const aiAssistantSpans = parseList(resp, QUERY_EXPRESSIONS.AI_ASSISTANT_MESSAGES);
    const aiGenerationSpans = parseList(resp, QUERY_EXPRESSIONS.AI_GENERATIONS);
    const aiStreamingSpans = parseList(resp, QUERY_EXPRESSIONS.AI_STREAMING_TEXT);
    const aiStreamingObjectSpans = parseList(resp, QUERY_EXPRESSIONS.AI_STREAMING_OBJECT);
    const contextFetcherSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_FETCHERS);
    const durationSpans = parseList(resp, QUERY_EXPRESSIONS.DURATION_SPANS);
    const artifactProcessingSpans = parseList(resp, QUERY_EXPRESSIONS.ARTIFACT_PROCESSING);
    const toolApprovalRequestedSpans = parseList(resp, QUERY_EXPRESSIONS.TOOL_APPROVAL_REQUESTED);
    const toolApprovalApprovedSpans = parseList(resp, QUERY_EXPRESSIONS.TOOL_APPROVAL_APPROVED);
    const toolApprovalDeniedSpans = parseList(resp, QUERY_EXPRESSIONS.TOOL_APPROVAL_DENIED);

    // Categorize spans with errors into critical errors vs warnings
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

    let errorCount = 0;
    let warningCount = 0;

    for (const span of spansWithErrorsList) {
      const spanName = getString(span, SPAN_KEYS.NAME, '');
      if (CRITICAL_ERROR_SPAN_NAMES.includes(spanName)) {
        errorCount++;
      } else {
        warningCount++;
      }
    }

    let agentId: string | null = null;
    let agentName: string | null = null;
    for (const s of userMessageSpans) {
      agentId = getString(s, SPAN_KEYS.AGENT_ID, '') || null;
      agentName = getString(s, SPAN_KEYS.AGENT_NAME, '') || null;
      if (agentId || agentName) break;
    }

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

    const spanIdToParentSpanId = new Map<string, string | null>();
    for (const spanAttr of allSpanAttributes) {
      const parentSpanId = spanAttr.data[SPAN_KEYS.PARENT_SPAN_ID] || null;
      spanIdToParentSpanId.set(spanAttr.spanId, parentSpanId);
    }

    // Build map from spanId to context breakdown (from agent.generate spans)
    type ContextBreakdownData = {
      systemPromptTemplate: number;
      coreInstructions: number;
      agentPrompt: number;
      toolsSection: number;
      artifactsSection: number;
      dataComponents: number;
      artifactComponents: number;
      transferInstructions: number;
      delegationInstructions: number;
      thinkingPreparation: number;
      conversationHistory: number;
      total: number;
    };
    const spanIdToContextBreakdown = new Map<string, ContextBreakdownData>();
    for (const spanAttr of allSpanAttributes) {
      const data = spanAttr.data;
      if (data['context.breakdown.total_tokens'] !== undefined) {
        spanIdToContextBreakdown.set(spanAttr.spanId, {
          systemPromptTemplate: Number(data['context.breakdown.system_template_tokens']) || 0,
          coreInstructions: Number(data['context.breakdown.core_instructions_tokens']) || 0,
          agentPrompt: Number(data['context.breakdown.agent_prompt_tokens']) || 0,
          toolsSection: Number(data['context.breakdown.tools_tokens']) || 0,
          artifactsSection: Number(data['context.breakdown.artifacts_tokens']) || 0,
          dataComponents: Number(data['context.breakdown.data_components_tokens']) || 0,
          artifactComponents: Number(data['context.breakdown.artifact_components_tokens']) || 0,
          transferInstructions: Number(data['context.breakdown.transfer_instructions_tokens']) || 0,
          delegationInstructions:
            Number(data['context.breakdown.delegation_instructions_tokens']) || 0,
          thinkingPreparation: Number(data['context.breakdown.thinking_preparation_tokens']) || 0,
          conversationHistory: Number(data['context.breakdown.conversation_history_tokens']) || 0,
          total: Number(data['context.breakdown.total_tokens']) || 0,
        });
      }
    }

    // Helper to get context breakdown for a span (check self and parent)
    const getContextBreakdownForSpan = (spanId: string): ContextBreakdownData | undefined => {
      // Check if this span has context breakdown
      if (spanIdToContextBreakdown.has(spanId)) {
        return spanIdToContextBreakdown.get(spanId);
      }
      // Check parent span
      const parentId = spanIdToParentSpanId.get(spanId);
      if (parentId && spanIdToContextBreakdown.has(parentId)) {
        return spanIdToContextBreakdown.get(parentId);
      }
      return undefined;
    };

    // activities
    type Activity = {
      id: string;
      type:
        | 'tool_call'
        | 'ai_generation'
        | 'agent_generation'
        | 'context_fetch'
        | 'context_resolution'
        | 'user_message'
        | 'ai_assistant_message'
        | 'ai_model_streamed_text'
        | 'ai_model_streamed_object'
        | 'artifact_processing'
        | 'tool_approval_requested'
        | 'tool_approval_approved'
        | 'tool_approval_denied';
      description: string;
      timestamp: string;
      parentSpanId?: string | null;
      status: 'success' | 'error' | 'pending';
      subAgentId?: string;
      subAgentName?: string;
      result?: string;
      // tool approval attributes
      approvalToolName?: string;
      approvalToolCallId?: string;
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
      contextAgentAgentId?: string;
      contextHeadersKeys?: string[];
      contextTrigger?: string;
      contextStatusDescription?: string;
      contextUrl?: string;
      // tool specifics
      toolName?: string;
      toolType?: string;
      toolPurpose?: string;
      toolCallArgs?: string;
      toolCallResult?: string;
      toolStatusMessage?: string;
      aiTelemetryFunctionId?: string;
      // delegation/transfer
      delegationFromSubAgentId?: string;
      delegationToSubAgentId?: string;
      transferFromSubAgentId?: string;
      transferToSubAgentId?: string;
      // streaming text
      aiStreamTextContent?: string;
      aiStreamTextModel?: string;
      aiStreamTextOperationId?: string;
      // streaming object
      aiStreamObjectContent?: string;
      aiStreamObjectModel?: string;
      aiStreamObjectOperationId?: string;
      // context breakdown (for AI streaming spans)
      contextBreakdown?: {
        systemPromptTemplate: number;
        coreInstructions: number;
        agentPrompt: number;
        toolsSection: number;
        artifactsSection: number;
        dataComponents: number;
        artifactComponents: number;
        transferInstructions: number;
        delegationInstructions: number;
        thinkingPreparation: number;
        conversationHistory: number;
        total: number;
      };
      // ai generation specifics
      aiResponseToolCalls?: string;
      aiPromptMessages?: string;
      // artifact processing specifics
      artifactId?: string;
      artifactType?: string;
      artifactName?: string;
      artifactDescription?: string;
      artifactData?: string;
      artifactSubAgentId?: string;
      artifactToolCallId?: string;
      hasError?: boolean;
      otelStatusCode?: string;
      otelStatusDescription?: string;
    };

    const activities: Activity[] = [];

    // tool calls → activities
    for (const span of toolCallSpans) {
      const name = getString(span, SPAN_KEYS.AI_TOOL_CALL_NAME, 'Unknown Tool');

      // Skip thinking_complete tool calls from the timeline
      if (name === 'thinking_complete') {
        continue;
      }

      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const toolType = getString(span, SPAN_KEYS.AI_TOOL_TYPE, '');
      const toolPurpose = getString(span, SPAN_KEYS.TOOL_PURPOSE, '');
      const aiTelemetryFunctionId = getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '');
      const delegationFromSubAgentId = getString(span, SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID, '');
      const delegationToSubAgentId = getString(span, SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID, '');
      const transferFromSubAgentId = getString(span, SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID, '');
      const transferToSubAgentId = getString(span, SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID, '');

      // Extract tool call args and result for ALL tool calls
      const toolCallArgs = getString(span, SPAN_KEYS.AI_TOOL_CALL_ARGS, '');
      const toolCallResult = getString(span, SPAN_KEYS.AI_TOOL_CALL_RESULT, '');

      const statusMessage = hasError
        ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') ||
          getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '')
        : '';

      const toolCall = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: toolCall,
        type: ACTIVITY_TYPES.TOOL_CALL,
        toolName: name,
        description: hasError && statusMessage ? `Tool ${name} failed` : `Called ${name}`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(toolCall) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError ? `Tool call failed (${durMs.toFixed(2)}ms)` : `${durMs.toFixed(2)}ms`,
        toolType: toolType || undefined,
        toolPurpose: toolPurpose || undefined,
        aiTelemetryFunctionId: aiTelemetryFunctionId || undefined,
        delegationFromSubAgentId: delegationFromSubAgentId || undefined,
        delegationToSubAgentId: delegationToSubAgentId || undefined,
        transferFromSubAgentId: transferFromSubAgentId || undefined,
        transferToSubAgentId: transferToSubAgentId || undefined,
        toolCallArgs: toolCallArgs || undefined,
        toolCallResult: toolCallResult || undefined,
        toolStatusMessage: statusMessage || undefined,
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
      const rawKeys = getField(span, SPAN_KEYS.CONTEXT_HEADERS_KEYS);
      try {
        if (typeof rawKeys === 'string') keys = JSON.parse(rawKeys);
        else if (Array.isArray(rawKeys)) keys = rawKeys as string[];
      } catch {}

      const contextResolution = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: contextResolution,
        type: ACTIVITY_TYPES.CONTEXT_RESOLUTION,
        description: `Context fetch ${hasError ? 'failed' : 'completed'}`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(contextResolution) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        contextStatusDescription: statusMessage || undefined,
        contextUrl: getString(span, SPAN_KEYS.CONTEXT_URL, '') || undefined,
        contextConfigId: getString(span, SPAN_KEYS.CONTEXT_CONFIG_ID, '') || undefined,
        contextAgentAgentId: getString(span, SPAN_KEYS.CONTEXT_AGENT_ID, '') || undefined,
        contextHeadersKeys: keys,
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
      const rawKeys = getField(span, SPAN_KEYS.CONTEXT_HEADERS_KEYS);
      try {
        if (typeof rawKeys === 'string') keys = JSON.parse(rawKeys);
        else if (Array.isArray(rawKeys)) keys = rawKeys as string[];
      } catch {}

      const contextHandle = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: contextHandle,
        type: ACTIVITY_TYPES.CONTEXT_RESOLUTION,
        description: `Context handle ${hasError ? 'failed' : 'completed'}`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(contextHandle) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        contextStatusDescription: statusMessage || undefined,
        contextUrl: getString(span, SPAN_KEYS.CONTEXT_URL, '') || undefined,
        contextConfigId: getString(span, SPAN_KEYS.CONTEXT_CONFIG_ID, '') || undefined,
        contextAgentAgentId: getString(span, SPAN_KEYS.CONTEXT_AGENT_ID, '') || undefined,
        contextHeadersKeys: keys,
      });
    }

    // user messages
    for (const span of userMessageSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const userMessageSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: userMessageSpanId,
        type: ACTIVITY_TYPES.USER_MESSAGE,
        description: 'User sent a message',
        timestamp: getString(span, SPAN_KEYS.MESSAGE_TIMESTAMP),
        parentSpanId: spanIdToParentSpanId.get(userMessageSpanId) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: AGENT_IDS.USER,
        subAgentName: ACTIVITY_NAMES.USER,
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
      const aiAssistantMessageSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: aiAssistantMessageSpanId,
        type: ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE,
        description: 'AI Assistant responded',
        timestamp: getString(span, SPAN_KEYS.AI_RESPONSE_TIMESTAMP),
        parentSpanId: spanIdToParentSpanId.get(aiAssistantMessageSpanId) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
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

      // Extract ai.response.toolCalls and ai.prompt.messages for ai.generateText.doGenerate spans
      const aiResponseToolCalls = getString(span, SPAN_KEYS.AI_RESPONSE_TOOL_CALLS, '');
      const aiPromptMessages = getString(span, SPAN_KEYS.AI_PROMPT_MESSAGES, '');

      const aiGeneration = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: aiGeneration,
        type: ACTIVITY_TYPES.AI_GENERATION,
        description: 'AI model generating text response',
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(aiGeneration) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(
          span,
          SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID,
          ACTIVITY_NAMES.UNKNOWN_AGENT
        ),
        subAgentName: getString(
          span,
          SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME,
          ACTIVITY_NAMES.UNKNOWN_AGENT
        ),
        result: hasError
          ? 'AI generation failed'
          : `AI text generated successfully (${durMs.toFixed(2)}ms)`,
        aiModel: getString(span, SPAN_KEYS.AI_MODEL_ID, 'Unknown Model'),
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        aiResponseText: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, '') || undefined,
        aiResponseToolCalls: aiResponseToolCalls || undefined,
        aiPromptMessages: aiPromptMessages || undefined,
      });
    }

    for (const span of agentGenerationSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const statusMessage =
        getString(span, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');
      const otelStatusCode = getString(span, SPAN_KEYS.OTEL_STATUS_CODE, '');
      const otelStatusDescription = getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');

      const agentGeneration = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: agentGeneration,
        type: ACTIVITY_TYPES.AGENT_GENERATION,
        description: hasError ? 'Agent generation failed' : 'Agent generation',
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(agentGeneration) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        result: hasError
          ? statusMessage || 'Agent generation failed'
          : 'Agent generation completed',
        hasError,
        otelStatusCode: hasError ? otelStatusCode : undefined,
        otelStatusDescription: hasError ? otelStatusDescription || statusMessage : undefined,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
      });
    }

    // ai streaming text
    for (const span of aiStreamingSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiStreamingText = getString(span, SPAN_KEYS.SPAN_ID, '');
      const parentSpanId = spanIdToParentSpanId.get(aiStreamingText) || undefined;
      activities.push({
        id: aiStreamingText,
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
        description: 'AI model streaming text response',
        timestamp: span.timestamp,
        parentSpanId,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(
          span,
          SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID,
          ACTIVITY_NAMES.UNKNOWN_AGENT
        ),
        subAgentName: getString(
          span,
          SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME,
          ACTIVITY_NAMES.UNKNOWN_AGENT
        ),
        result: hasError
          ? 'AI streaming failed'
          : `AI text streamed successfully (${durMs.toFixed(2)}ms)`,
        aiStreamTextContent: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, ''),
        aiStreamTextModel: getString(span, SPAN_KEYS.AI_MODEL_ID, 'Unknown Model'),
        aiStreamTextOperationId: getString(span, SPAN_KEYS.AI_OPERATION_ID, '') || undefined,
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        aiTelemetryFunctionId: getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '') || undefined,
        contextBreakdown: parentSpanId ? getContextBreakdownForSpan(parentSpanId) : undefined,
      });
    }

    // ai streaming object
    for (const span of aiStreamingObjectSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiStreamingObject = getString(span, SPAN_KEYS.SPAN_ID, '');
      const parentSpanId = spanIdToParentSpanId.get(aiStreamingObject) || undefined;
      activities.push({
        id: aiStreamingObject,
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT,
        description: 'AI model streaming object response',
        timestamp: span.timestamp,
        parentSpanId,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError
          ? 'AI streaming object failed'
          : `AI object streamed successfully (${durMs.toFixed(2)}ms)`,
        aiStreamObjectContent: getString(span, SPAN_KEYS.AI_RESPONSE_OBJECT, ''),
        aiStreamObjectModel: getString(span, SPAN_KEYS.AI_MODEL_ID, 'Unknown Model'),
        aiStreamObjectOperationId: getString(span, SPAN_KEYS.AI_OPERATION_ID, '') || undefined,
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        aiTelemetryFunctionId: getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '') || undefined,
        contextBreakdown: parentSpanId ? getContextBreakdownForSpan(parentSpanId) : undefined,
      });
    }

    // context fetchers
    for (const span of contextFetcherSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const contextFetcher = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: contextFetcher,
        type: ACTIVITY_TYPES.CONTEXT_FETCH,
        description: '',
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(contextFetcher) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: UNKNOWN_VALUE,
        subAgentName: 'Context Fetcher',
        result: hasError
          ? 'Context fetch failed'
          : getString(span, SPAN_KEYS.HTTP_URL, 'Unknown URL'),
      });
    }

    // artifact processing
    for (const span of artifactProcessingSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const artifactName = getString(span, SPAN_KEYS.ARTIFACT_NAME, '');
      const artifactType = getString(span, SPAN_KEYS.ARTIFACT_TYPE, '');
      const artifactDescription = getString(span, SPAN_KEYS.ARTIFACT_DESCRIPTION, '');

      const artifactProcessing = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: artifactProcessing,
        type: 'artifact_processing',
        description: 'Artifact processed',
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(artifactProcessing) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: hasError ? 'Artifact processing failed' : 'Artifact processed successfully',
        artifactId: getString(span, SPAN_KEYS.ARTIFACT_ID, '') || undefined,
        artifactType: artifactType || undefined,
        artifactName: artifactName || undefined,
        artifactDescription: artifactDescription || undefined,
        artifactData: getString(span, SPAN_KEYS.ARTIFACT_DATA, '') || undefined,
        artifactToolCallId: getString(span, SPAN_KEYS.ARTIFACT_TOOL_CALL_ID, '') || undefined,
      });
    }

    // tool approval requested
    for (const span of toolApprovalRequestedSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const toolName = getString(span, SPAN_KEYS.TOOL_NAME, '');
      const toolCallId = getString(span, SPAN_KEYS.TOOL_CALL_ID, '');

      const approvalRequested = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: approvalRequested,
        type: ACTIVITY_TYPES.TOOL_APPROVAL_REQUESTED,
        description: `Approval requested for ${toolName}`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(approvalRequested) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.PENDING,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: `Waiting for user approval`,
        approvalToolName: toolName || undefined,
        approvalToolCallId: toolCallId || undefined,
      });
    }

    // tool approval approved
    for (const span of toolApprovalApprovedSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const toolName = getString(span, SPAN_KEYS.TOOL_NAME, '');
      const toolCallId = getString(span, SPAN_KEYS.TOOL_CALL_ID, '');

      const approvalApproved = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: approvalApproved,
        type: ACTIVITY_TYPES.TOOL_APPROVAL_APPROVED,
        description: `${toolName} approved by user`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(approvalApproved) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: `Tool approved by user`,
        approvalToolName: toolName || undefined,
        approvalToolCallId: toolCallId || undefined,
      });
    }

    // tool approval denied
    for (const span of toolApprovalDeniedSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const toolName = getString(span, SPAN_KEYS.TOOL_NAME, '');
      const toolCallId = getString(span, SPAN_KEYS.TOOL_CALL_ID, '');

      const approvalDenied = getString(span, SPAN_KEYS.SPAN_ID, '');
      activities.push({
        id: approvalDenied,
        type: ACTIVITY_TYPES.TOOL_APPROVAL_DENIED,
        description: `${toolName} denied by user`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(approvalDenied) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result: `Tool denied by user`,
        approvalToolName: toolName || undefined,
        approvalToolCallId: toolCallId || undefined,
      });
    }

    // Pre-parse all timestamps once for better performance
    const allSpanTimes = durationSpans.map((s) => new Date(s.timestamp).getTime());
    const operationStartTime = allSpanTimes.length > 0 ? Math.min(...allSpanTimes) : null;
    const operationEndTime = allSpanTimes.length > 0 ? Math.max(...allSpanTimes) : null;

    // Resolve parentSpanId to nearest ancestor activity
    const activityIds = new Set(activities.map((a) => a.id));
    function findAncestorActivity(spanId: string): string | undefined {
      if (!spanId) return undefined;
      if (activityIds.has(spanId)) return spanId;
      const parentSpanId = spanIdToParentSpanId.get(spanId);
      if (!parentSpanId) return undefined;
      return findAncestorActivity(parentSpanId);
    }
    for (const activity of activities) {
      if (activity.parentSpanId) {
        activity.parentSpanId = findAncestorActivity(activity.parentSpanId) || undefined;
      }
    }

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
          a.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          a.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT
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
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT) &&
        typeof activity.inputTokens === 'number'
      ) {
        totalInputTokens += activity.inputTokens;
      }
      if (
        (activity.type === ACTIVITY_TYPES.AI_GENERATION ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT) &&
        typeof activity.outputTokens === 'number'
      ) {
        totalOutputTokens += activity.outputTokens;
      }
    }

    const openAICallsCount = aiGenerationSpans.length;

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
      totalErrors: 0,
      totalOpenAICalls: openAICallsCount,
    };

    return NextResponse.json({
      ...conversation,
      activities,
      conversationStartTime: conversationStartTime ? conversationStartTime : null,
      conversationEndTime: conversationEndTime ? conversationEndTime : null,
      conversationDuration: conversationDurationMs,
      totalInputTokens,
      totalOutputTokens,
      mcpToolErrors: [],
      agentId,
      agentName,
      allSpanAttributes,
      spansWithErrorsCount: spansWithErrorsList.length,
      errorCount,
      warningCount,
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
