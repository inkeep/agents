import {
  CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE,
  parseContextBreakdownFromSpan,
  V1_BREAKDOWN_SCHEMA,
} from '@inkeep/agents-core/client-exports';
import { type NextRequest, NextResponse } from 'next/server';
import {
  ACTIVITY_NAMES,
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
  AGENT_IDS,
  AI_OPERATIONS,
  FIELD_CONTEXTS,
  FIELD_DATA_TYPES,
  GENERATION_TYPES,
  ORDER_DIRECTIONS,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  QUERY_TYPES,
  REQUEST_TYPES,
  SIGNALS,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
} from '@/constants/signoz';
import { getAgentsApiUrl } from '@/lib/api/api-config';
import { fetchWithRetry } from '@/lib/api/fetch-with-retry';
import {
  DEFAULT_LOOKBACK_MS,
  getConversationTimeRange,
} from '@/lib/api/signoz-conversation-time-range';

import { getLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------- Types

type SigNozListItem = { data?: Record<string, any>; [k: string]: any };
type SigNozResult = { queryName?: string; rows?: SigNozListItem[] };
type SigNozResp = { results: SigNozResult[] };

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

const GENERATION_TYPE_LABELS: Record<string, string> = {
  sub_agent_generation: 'Agent Generation',
  status_update: 'Status Update',
  artifact_metadata: 'Artifact Metadata',
  mid_generation_compression: 'Mid-Generation Compression',
  conversation_compression: 'Conversation Compression',
};

function formatGenerationType(
  genType: string,
  responseText?: string
): { description: string; result?: string } {
  const label = GENERATION_TYPE_LABELS[genType] ?? genType.replace(/_/g, ' ');

  if (!responseText) return { description: label };

  try {
    const parsed = JSON.parse(responseText);

    if (genType === 'artifact_metadata' && parsed.name) {
      return { description: 'Artifact Metadata', result: parsed.name };
    }

    if (genType === 'status_update' && parsed.updates) {
      const updates = parsed.updates as Array<{ type: string; data?: { label?: string } }>;
      if (updates.length === 1 && updates[0].type === 'no_relevant_updates') {
        return { description: 'Status Update', result: 'No updates' };
      }
      const items = updates.filter((u) => u.data?.label).map((u) => `[${u.type}] ${u.data?.label}`);
      if (items.length > 0) {
        return { description: 'Status Update', result: items.join(', ') };
      }
    }
  } catch {
    // not valid JSON, use label as-is
  }

  return { description: label };
}

async function signozQuery(
  payload: any,
  tenantId: string,
  cookieHeader: string | null,
  authHeader: string | null
): Promise<SigNozResp> {
  const logger = getLogger('traces-query');

  try {
    const agentsApiUrl = getAgentsApiUrl();
    const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    logger.debug({ endpoint }, 'Calling agents-api for conversation traces');

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      credentials: 'include',
      timeout: 30000,
      maxAttempts: 3,
      label: 'signoz-conversation-query',
    });

    if (!response.ok) {
      const statusText = response.statusText;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`SigNoz authentication failed: ${statusText}`);
      }
      if (response.status === 400) {
        throw new Error(`Invalid SigNoz query: ${statusText}`);
      }
      if (response.status === 429) {
        throw new Error(`SigNoz rate limit exceeded: ${statusText}`);
      }
      if (response.status >= 500) {
        throw new Error(`SigNoz server error: ${statusText}`);
      }
      throw new Error(`SigNoz request failed: ${statusText}`);
    }

    const json = await response.json();
    const results = json?.data?.data?.results ?? [];
    logger.debug(
      {
        responseData: results.map((r: any) => ({ queryName: r.queryName, count: r.rows?.length })),
      },
      'SigNoz response (truncated)'
    );
    return { results };
  } catch (e) {
    const err = e as {
      message?: string;
      name?: string;
      code?: unknown;
      cause?: { code?: string; message?: string };
    };
    logger.error(
      {
        errorName: err?.name,
        errorMessage: err?.message,
        errorCode: err?.code,
        causeCode: err?.cause?.code,
        causeMessage: err?.cause?.message,
      },
      'SigNoz query error'
    );

    if (e instanceof TypeError) {
      throw new Error(`SigNoz service unavailable: ${e.message}`);
    }
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`SigNoz service unavailable: request timed out`);
    }
    throw e instanceof Error ? e : new Error(`SigNoz query failed: ${String(e)}`);
  }
}

function parseList(resp: SigNozResp, name: string): SigNozListItem[] {
  return resp.results.find((r) => r.queryName === name)?.rows ?? [];
}

function parseListByName(resp: SigNozResp, queryName: string, spanName: string): SigNozListItem[] {
  return parseList(resp, queryName).filter((row) => getString(row, SPAN_KEYS.NAME) === spanName);
}

// ---------- Payload builder (single combined "list" payload)

type SelectField = { name: string; fieldDataType: string; fieldContext: string };

function sf(name: string, fieldDataType: string, fieldContext: string): SelectField {
  return { name, fieldDataType, fieldContext };
}

const span = FIELD_CONTEXTS.SPAN;
const attr = FIELD_CONTEXTS.ATTRIBUTE;
const str = FIELD_DATA_TYPES.STRING;
const int64 = FIELD_DATA_TYPES.INT64;
const float64 = FIELD_DATA_TYPES.FLOAT64;
const bool = FIELD_DATA_TYPES.BOOL;

function buildBaseExpression(conversationId: string, projectId?: string): string {
  const parts = [`${SPAN_KEYS.CONVERSATION_ID} = '${conversationId}'`];
  if (projectId) parts.push(`${SPAN_KEYS.PROJECT_ID} = '${projectId}'`);
  return parts.join(' AND ');
}

function buildQueryEnvelope(
  name: string,
  filterExpression: string,
  selectFields: SelectField[],
  limit = 10000
): any {
  return {
    type: QUERY_TYPES.BUILDER_QUERY,
    spec: {
      name,
      signal: SIGNALS.TRACES,
      filter: { expression: filterExpression },
      selectFields,
      order: [{ key: { name: SPAN_KEYS.TIMESTAMP }, direction: ORDER_DIRECTIONS.DESC }],
      limit,
      stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
      disabled: QUERY_DEFAULTS.DISABLED,
    },
  };
}

function wrapQueries(queries: any[], start: number, end: number, projectId?: string) {
  return {
    start,
    end,
    requestType: REQUEST_TYPES.RAW,
    ...(projectId && { projectId }),
    compositeQuery: { queries },
  };
}

function buildConversationPayloads(
  conversationId: string,
  start = Date.now() - DEFAULT_LOOKBACK_MS,
  end = Date.now(),
  projectId?: string
) {
  const base = buildBaseExpression(conversationId, projectId);

  const coreQueries = [
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.TOOL_CALLS,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.AI_TOOL_CALL}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.AI_TOOL_CALL_NAME, str, attr),
        sf(SPAN_KEYS.AI_TOOL_CALL_RESULT, str, attr),
        sf(SPAN_KEYS.AI_TOOL_CALL_ARGS, str, attr),
        sf(SPAN_KEYS.AI_TOOL_TYPE, str, attr),
        sf(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID, str, attr),
        sf(SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, str, attr),
        sf(SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.DELEGATION_TYPE, str, attr),
        sf(SPAN_KEYS.TRANSFER_FROM_SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.TRANSFER_TO_SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.TOOL_PURPOSE, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
        sf(SPAN_KEYS.OTEL_STATUS_DESCRIPTION, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.AGENT_ID, str, attr),
        sf(SPAN_KEYS.AGENT_NAME, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.USER_MESSAGES,
      `${base} AND ${SPAN_KEYS.MESSAGE_CONTENT} != ''`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.MESSAGE_CONTENT, str, attr),
        sf(SPAN_KEYS.MESSAGE_PARTS, str, attr),
        sf(SPAN_KEYS.MESSAGE_TIMESTAMP, str, attr),
        sf(SPAN_KEYS.MESSAGE_ID, str, attr),
        sf(SPAN_KEYS.AGENT_ID, str, attr),
        sf(SPAN_KEYS.AGENT_NAME, str, attr),
        sf(SPAN_KEYS.INVOCATION_TYPE, str, attr),
        sf(SPAN_KEYS.INVOCATION_ENTRY_POINT, str, attr),
        sf(SPAN_KEYS.TRIGGER_ID, str, attr),
        sf(SPAN_KEYS.TRIGGER_INVOCATION_ID, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.AI_ASSISTANT_MESSAGES,
      `${base} AND ${SPAN_KEYS.AI_RESPONSE_CONTENT} != ''`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.AI_RESPONSE_CONTENT, str, attr),
        sf(SPAN_KEYS.AI_RESPONSE_TIMESTAMP, str, attr),
        sf(SPAN_KEYS.MESSAGE_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.OTEL_STATUS_DESCRIPTION, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.AI_LLM_CALLS,
      `${base} AND ${SPAN_KEYS.AI_OPERATION_ID} IN ('${AI_OPERATIONS.GENERATE_TEXT}', '${AI_OPERATIONS.STREAM_TEXT}')`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.AI_OPERATION_ID, str, attr),
        sf(SPAN_KEYS.AGENT_ID, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.AI_MODEL_ID, str, attr),
        sf(SPAN_KEYS.AI_MODEL_PROVIDER, str, attr),
        sf(SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, int64, attr),
        sf(SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, int64, attr),
        sf(SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, float64, attr),
        sf(SPAN_KEYS.AI_RESPONSE_TEXT, str, attr),
        sf(SPAN_KEYS.AI_RESPONSE_TOOL_CALLS, str, attr),
        sf(SPAN_KEYS.AI_PROMPT_MESSAGES, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_METADATA_PHASE, str, attr),
        sf(SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.AGENT_GENERATIONS,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.AGENT_GENERATION}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
        sf(SPAN_KEYS.OTEL_STATUS_DESCRIPTION, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE, int64, attr),
        ...V1_BREAKDOWN_SCHEMA.map((def) => sf(def.spanAttribute, int64, attr)),
      ]
    ),
  ];

  const contextQueries = [
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.CONTEXT_RESOLUTION_AND_HANDLE,
      `${base} AND ${SPAN_KEYS.NAME} IN ('${SPAN_NAMES.CONTEXT_RESOLUTION}', '${SPAN_NAMES.CONTEXT_HANDLE}')`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.NAME, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.CONTEXT_URL, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
        sf(SPAN_KEYS.OTEL_STATUS_DESCRIPTION, str, attr),
        sf(SPAN_KEYS.CONTEXT_CONFIG_ID, str, attr),
        sf(SPAN_KEYS.CONTEXT_AGENT_ID, str, attr),
        sf(SPAN_KEYS.CONTEXT_HEADERS_KEYS, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.CONTEXT_FETCHERS,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.CONTEXT_FETCHER}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.DURATION_NANO, float64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.HTTP_URL, str, attr),
        sf(SPAN_KEYS.HTTP_STATUS_CODE, str, attr),
        sf(SPAN_KEYS.HTTP_RESPONSE_BODY_SIZE, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
      ]
    ),
    buildQueryEnvelope(QUERY_EXPRESSIONS.DURATION_SPANS, base, [
      sf(SPAN_KEYS.SPAN_ID, str, span),

      sf(SPAN_KEYS.PARENT_SPAN_ID, str, span),
      sf(SPAN_KEYS.DURATION_NANO, float64, span),
      sf(SPAN_KEYS.TIMESTAMP, int64, span),
    ]),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.ARTIFACT_PROCESSING,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.ARTIFACT_PROCESSING}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.ARTIFACT_ID, str, attr),
        sf(SPAN_KEYS.ARTIFACT_TYPE, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.ARTIFACT_TOOL_CALL_ID, str, attr),
        sf(SPAN_KEYS.ARTIFACT_NAME, str, attr),
        sf(SPAN_KEYS.ARTIFACT_DESCRIPTION, str, attr),
        sf(SPAN_KEYS.ARTIFACT_DATA, str, attr),
        sf(SPAN_KEYS.STATUS_MESSAGE, str, attr),
        sf(SPAN_KEYS.ARTIFACT_IS_OVERSIZED, bool, attr),
        sf(SPAN_KEYS.ARTIFACT_RETRIEVAL_BLOCKED, bool, attr),
        sf(SPAN_KEYS.ARTIFACT_ORIGINAL_TOKEN_SIZE, int64, attr),
        sf(SPAN_KEYS.ARTIFACT_CONTEXT_WINDOW_SIZE, int64, attr),
      ]
    ),
  ];

  const eventQueries = [
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.SPANS_WITH_ERRORS,
      `${base} AND ${SPAN_KEYS.HAS_ERROR} = true`,
      [sf(SPAN_KEYS.SPAN_ID, str, span), sf(SPAN_KEYS.NAME, str, span)]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.TOOL_APPROVALS,
      `${base} AND ${SPAN_KEYS.NAME} IN ('${SPAN_NAMES.TOOL_APPROVAL_REQUESTED}', '${SPAN_NAMES.TOOL_APPROVAL_APPROVED}', '${SPAN_NAMES.TOOL_APPROVAL_DENIED}')`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.NAME, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.TOOL_NAME, str, attr),
        sf(SPAN_KEYS.TOOL_CALL_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.COMPRESSION,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.COMPRESSOR_SAFE_COMPRESS}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.COMPRESSION_TYPE, str, attr),
        sf(SPAN_KEYS.COMPRESSION_SESSION_ID, str, attr),
        sf(SPAN_KEYS.COMPRESSION_GENERATED_TOKENS, int64, attr),
        sf(SPAN_KEYS.COMPRESSION_TOTAL_CONTEXT_TOKENS, int64, attr),
        sf(SPAN_KEYS.COMPRESSION_TRIGGER_AT, int64, attr),
        sf(SPAN_KEYS.COMPRESSION_RESULT_OUTPUT_TOKENS, int64, attr),
        sf(SPAN_KEYS.COMPRESSION_RESULT_COMPRESSION_RATIO, float64, attr),
        sf(SPAN_KEYS.COMPRESSION_RESULT_HIGH_LEVEL, str, attr),
        sf(SPAN_KEYS.COMPRESSION_SUCCESS, bool, attr),
        sf(SPAN_KEYS.COMPRESSION_ERROR, str, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.MAX_STEPS_REACHED,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.AGENT_MAX_STEPS_REACHED}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),

        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_NAME, str, attr),
        sf(SPAN_KEYS.AGENT_ID, str, attr),
        sf(SPAN_KEYS.AGENT_NAME, str, attr),
        sf(SPAN_KEYS.AGENT_MAX_STEPS_REACHED, bool, attr),
        sf(SPAN_KEYS.AGENT_STEPS_COMPLETED, int64, attr),
        sf(SPAN_KEYS.AGENT_MAX_STEPS, int64, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.STREAM_LIFETIME_EXCEEDED,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.STREAM_FORCE_CLEANUP}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.STREAM_CLEANUP_REASON, str, attr),
        sf(SPAN_KEYS.STREAM_MAX_LIFETIME_MS, int64, attr),
        sf(SPAN_KEYS.STREAM_BUFFER_SIZE_BYTES, int64, attr),
      ]
    ),
    buildQueryEnvelope(
      QUERY_EXPRESSIONS.DURABLE_TOOL_EXECUTIONS,
      `${base} AND ${SPAN_KEYS.NAME} = '${SPAN_NAMES.DURABLE_TOOL_EXECUTION}'`,
      [
        sf(SPAN_KEYS.SPAN_ID, str, span),
        sf(SPAN_KEYS.TIMESTAMP, int64, span),
        sf(SPAN_KEYS.HAS_ERROR, bool, span),
        sf(SPAN_KEYS.TOOL_NAME, str, attr),
        sf(SPAN_KEYS.TOOL_CALL_ID, str, attr),
        sf(SPAN_KEYS.SUB_AGENT_ID, str, attr),
        sf(SPAN_KEYS.TOOL_RESPONSE_CONTENT, str, attr),
        sf(SPAN_KEYS.TOOL_RESPONSE_TIMESTAMP, str, attr),
      ]
    ),
  ];

  return [
    wrapQueries(coreQueries, start, end, projectId),
    wrapQueries(contextQueries, start, end, projectId),
    wrapQueries(eventQueries, start, end, projectId),
  ];
}

export async function GET(
  req: NextRequest,
  context: RouteContext<'/api/traces/conversations/[conversationId]'>
) {
  const { conversationId } = await context.params;
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
  }

  // Get tenantId and projectId from URL search params
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const projectId = url.searchParams.get('projectId') || undefined;

  // Optional time range params to narrow the ClickHouse scan window
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  const cookieHeader = req.headers.get('cookie');
  const authHeader = req.headers.get('authorization');

  try {
    const logger = getLogger('conversation-detail');
    const t0 = Date.now();

    const timeRange = await getConversationTimeRange({
      startParam,
      endParam,
      projectId,
      tenantId,
      conversationId,
    });

    if (timeRange.notFound) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { start, end } = timeRange;
    const tTimeRange = Date.now();

    const payloads = buildConversationPayloads(conversationId, start, end, projectId);
    const batchLabels = ['core', 'context', 'events'] as const;

    const batchResults = await Promise.all(
      payloads.map(async (p, i) => {
        const batchStart = Date.now();
        const result = await signozQuery(p, tenantId, cookieHeader, authHeader);
        logger.info(
          {
            batch: batchLabels[i],
            queries: p.compositeQuery.queries.length,
            ms: Date.now() - batchStart,
          },
          `signoz batch complete`
        );
        return result;
      })
    );
    const tSignoz = Date.now();

    const resp: SigNozResp = { results: batchResults.flatMap((r) => r.results) };

    const toolCallSpans = parseList(resp, QUERY_EXPRESSIONS.TOOL_CALLS);
    const userMessageSpans = parseList(resp, QUERY_EXPRESSIONS.USER_MESSAGES);
    const aiAssistantSpans = parseList(resp, QUERY_EXPRESSIONS.AI_ASSISTANT_MESSAGES);
    const aiGenerationSpans: SigNozListItem[] = [];
    const aiStreamingSpans: SigNozListItem[] = [];
    for (const row of parseList(resp, QUERY_EXPRESSIONS.AI_LLM_CALLS)) {
      const op = getString(row, SPAN_KEYS.AI_OPERATION_ID);
      if (op === AI_OPERATIONS.GENERATE_TEXT) aiGenerationSpans.push(row);
      else if (op === AI_OPERATIONS.STREAM_TEXT) aiStreamingSpans.push(row);
    }
    const agentGenerationSpans = parseList(resp, QUERY_EXPRESSIONS.AGENT_GENERATIONS);
    const spansWithErrorsList = parseList(resp, QUERY_EXPRESSIONS.SPANS_WITH_ERRORS);

    const contextResolutionSpans = parseListByName(
      resp,
      QUERY_EXPRESSIONS.CONTEXT_RESOLUTION_AND_HANDLE,
      SPAN_NAMES.CONTEXT_RESOLUTION
    );
    const contextHandleSpans = parseListByName(
      resp,
      QUERY_EXPRESSIONS.CONTEXT_RESOLUTION_AND_HANDLE,
      SPAN_NAMES.CONTEXT_HANDLE
    );
    const contextFetcherSpans = parseList(resp, QUERY_EXPRESSIONS.CONTEXT_FETCHERS);
    const durationSpans = parseList(resp, QUERY_EXPRESSIONS.DURATION_SPANS);
    const artifactProcessingSpans = parseList(resp, QUERY_EXPRESSIONS.ARTIFACT_PROCESSING);

    const toolApprovalRequestedSpans = parseListByName(
      resp,
      QUERY_EXPRESSIONS.TOOL_APPROVALS,
      SPAN_NAMES.TOOL_APPROVAL_REQUESTED
    );
    const toolApprovalApprovedSpans = parseListByName(
      resp,
      QUERY_EXPRESSIONS.TOOL_APPROVALS,
      SPAN_NAMES.TOOL_APPROVAL_APPROVED
    );
    const toolApprovalDeniedSpans = parseListByName(
      resp,
      QUERY_EXPRESSIONS.TOOL_APPROVALS,
      SPAN_NAMES.TOOL_APPROVAL_DENIED
    );
    const compressionSpans = parseList(resp, QUERY_EXPRESSIONS.COMPRESSION);
    const maxStepsReachedSpans = parseList(resp, QUERY_EXPRESSIONS.MAX_STEPS_REACHED);
    const streamLifetimeExceededSpans = parseList(resp, QUERY_EXPRESSIONS.STREAM_LIFETIME_EXCEEDED);
    const durableToolExecutionSpans = parseList(resp, QUERY_EXPRESSIONS.DURABLE_TOOL_EXECUTIONS);

    logger.info(
      {
        conversationId,
        timeRangeMs: tTimeRange - t0,
        signozMs: tSignoz - tTimeRange,
        spanDays: Math.round((end - start) / 86_400_000),
      },
      'conversation detail timing'
    );

    let agentId: string | null = null;
    let agentName: string | null = null;
    let invocationType: string | null = null;
    let invocationEntryPoint: string | null = null;
    let triggerId: string | null = null;
    let triggerInvocationId: string | null = null;
    for (const s of userMessageSpans) {
      agentId = getString(s, SPAN_KEYS.AGENT_ID, '') || null;
      agentName = getString(s, SPAN_KEYS.AGENT_NAME, '') || null;
      const spanInvocationType = getString(s, SPAN_KEYS.INVOCATION_TYPE, '');
      if (spanInvocationType && !invocationType) {
        invocationType = spanInvocationType;
        invocationEntryPoint = getString(s, SPAN_KEYS.INVOCATION_ENTRY_POINT, '') || null;
        triggerId = getString(s, SPAN_KEYS.TRIGGER_ID, '') || null;
        triggerInvocationId = getString(s, SPAN_KEYS.TRIGGER_INVOCATION_ID, '') || null;
      }
      if (agentId || agentName) break;
    }

    // Build parent-span map from durationSpans (already fetched in builder query)
    const spanIdToParentSpanId = new Map<string, string | null>();
    for (const span of durationSpans) {
      const spanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const parentSpanId = getString(span, SPAN_KEYS.PARENT_SPAN_ID, '') || null;
      if (spanId) {
        spanIdToParentSpanId.set(spanId, parentSpanId);
      }
    }

    // Build context breakdown map from agentGenerationSpans (breakdown attrs now in builder query)
    type ContextBreakdownData = {
      components: Record<string, number>;
      total: number;
    };
    const spanIdToContextBreakdown = new Map<string, ContextBreakdownData>();
    for (const span of agentGenerationSpans) {
      const spanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const totalValue = getField(span, CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE);
      if (spanId && totalValue !== undefined && totalValue !== '' && totalValue !== null) {
        const data: Record<string, unknown> = {};
        data[CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE] = totalValue;
        for (const def of V1_BREAKDOWN_SCHEMA) {
          data[def.spanAttribute] = getField(span, def.spanAttribute);
        }
        spanIdToContextBreakdown.set(
          spanId,
          parseContextBreakdownFromSpan(data, V1_BREAKDOWN_SCHEMA)
        );
      }
    }

    // activities
    type Activity = {
      id: string;
      messageId?: string;
      type:
        | 'tool_call'
        | 'ai_generation'
        | 'agent_generation'
        | 'context_fetch'
        | 'context_resolution'
        | 'user_message'
        | 'ai_assistant_message'
        | 'ai_model_streamed_text'
        | 'artifact_processing'
        | 'tool_approval_requested'
        | 'tool_approval_approved'
        | 'tool_approval_denied'
        | 'compression'
        | 'max_steps_reached'
        | 'stream_lifetime_exceeded'
        | 'durable_tool_execution';
      description: string;
      timestamp: string;
      parentSpanId?: string | null;
      status: (typeof ACTIVITY_STATUS)[keyof typeof ACTIVITY_STATUS];
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
      costUsd?: number;
      serviceTier?: string;
      aiResponseContent?: string;
      aiResponseTimestamp?: string;
      aiResponseText?: string;
      // user
      messageContent?: string;
      messageParts?: string;
      // trigger/invocation attributes
      invocationType?: string;
      invocationEntryPoint?: string;
      triggerId?: string;
      triggerInvocationId?: string;
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
      mcpServerId?: string;
      mcpServerName?: string;
      toolCallArgs?: string;
      toolCallResult?: string;
      toolStatusMessage?: string;
      aiTelemetryFunctionId?: string;
      // delegation/transfer
      delegationFromSubAgentId?: string;
      delegationToSubAgentId?: string;
      delegationType?: 'internal' | 'external' | 'team';
      transferFromSubAgentId?: string;
      transferToSubAgentId?: string;
      // streaming text
      aiStreamTextContent?: string;
      aiStreamTextModel?: string;
      aiStreamTextOperationId?: string;
      aiTelemetryPhase?: string;
      // context breakdown (for AI streaming spans)
      contextBreakdown?: {
        components: Record<string, number>;
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
      artifactIsOversized?: boolean;
      artifactRetrievalBlocked?: boolean;
      artifactOriginalTokenSize?: number;
      artifactContextWindowSize?: number;
      hasError?: boolean;
      otelStatusCode?: string;
      otelStatusDescription?: string;
      // compression specifics
      compressionType?: string;
      compressionGeneratedTokens?: number;
      compressionTotalContextTokens?: number;
      compressionTriggerAt?: number;
      compressionOutputTokens?: number;
      compressionRatio?: number;
      compressionError?: string;
      compressionSummary?: string;
      maxStepsReached?: boolean;
      stepsCompleted?: number;
      maxSteps?: number;
      streamCleanupReason?: string;
      streamMaxLifetimeMs?: number;
      streamBufferSizeBytes?: number;
      // durable tool execution
      toolCallId?: string;
      toolResponseContent?: string;
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
      const mcpServerId = getString(span, SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_ID, '');
      const mcpServerName = getString(span, SPAN_KEYS.AI_TOOL_CALL_MCP_SERVER_NAME, '');
      const aiTelemetryFunctionId = getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '');
      const delegationFromSubAgentId = getString(span, SPAN_KEYS.DELEGATION_FROM_SUB_AGENT_ID, '');
      const delegationToSubAgentId = getString(span, SPAN_KEYS.DELEGATION_TO_SUB_AGENT_ID, '');
      const delegationType = getString(span, SPAN_KEYS.DELEGATION_TYPE, '');
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
        mcpServerId: mcpServerId || undefined,
        mcpServerName: mcpServerName || undefined,
        aiTelemetryFunctionId: aiTelemetryFunctionId || undefined,
        delegationFromSubAgentId: delegationFromSubAgentId || undefined,
        delegationToSubAgentId: delegationToSubAgentId || undefined,
        delegationType: (delegationType as 'internal' | 'external' | 'team') || undefined,
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
      const invocationType = getString(span, SPAN_KEYS.INVOCATION_TYPE, '');
      const spanEntryPoint = getString(span, SPAN_KEYS.INVOCATION_ENTRY_POINT, '');
      const triggerId = getString(span, SPAN_KEYS.TRIGGER_ID, '');
      const triggerInvocationId = getString(span, SPAN_KEYS.TRIGGER_INVOCATION_ID, '');

      // Determine description based on invocation type
      const isTriggerInvocation =
        invocationType === 'trigger' || invocationType === 'scheduled_trigger';
      const isSlackMessage = invocationType === 'slack';
      const entryPointLabel = spanEntryPoint ? ` (${spanEntryPoint.replace(/_/g, ' ')})` : '';
      const description = isTriggerInvocation
        ? 'Trigger invocation received'
        : isSlackMessage
          ? `Slack message received${entryPointLabel}`
          : 'User sent a message';

      activities.push({
        id: userMessageSpanId,
        messageId: getString(span, SPAN_KEYS.MESSAGE_ID, '') || undefined,
        type: ACTIVITY_TYPES.USER_MESSAGE,
        description,
        timestamp: getString(span, SPAN_KEYS.MESSAGE_TIMESTAMP),
        parentSpanId: spanIdToParentSpanId.get(userMessageSpanId) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: AGENT_IDS.USER,
        subAgentName: isTriggerInvocation
          ? 'Trigger'
          : isSlackMessage
            ? 'Slack'
            : ACTIVITY_NAMES.USER,
        result: hasError
          ? 'Message processing failed'
          : `Message received successfully (${durMs.toFixed(2)}ms)`,
        messageContent: getString(span, SPAN_KEYS.MESSAGE_CONTENT, ''),
        messageParts: getString(span, SPAN_KEYS.MESSAGE_PARTS, ''),
        invocationType: invocationType || undefined,
        invocationEntryPoint: spanEntryPoint || undefined,
        triggerId: triggerId || undefined,
        triggerInvocationId: triggerInvocationId || undefined,
      });
    }

    // ai assistant messages
    for (const span of aiAssistantSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiAssistantMessageSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const statusMessage = hasError
        ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') ||
          getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '')
        : '';
      activities.push({
        id: aiAssistantMessageSpanId,
        messageId: getString(span, SPAN_KEYS.MESSAGE_ID, '') || undefined,
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
        hasError,
        otelStatusDescription: statusMessage || undefined,
      });
    }

    // ai generations
    for (const span of aiGenerationSpans) {
      const genType = getString(span, SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE, '');
      if (genType === GENERATION_TYPES.EVAL_SCORING || genType === GENERATION_TYPES.EVAL_SIMULATION)
        continue;

      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;

      // Extract ai.response.toolCalls and ai.prompt.messages for ai.generateText.doGenerate spans
      const aiResponseToolCalls = getString(span, SPAN_KEYS.AI_RESPONSE_TOOL_CALLS, '');
      const aiPromptMessages = getString(span, SPAN_KEYS.AI_PROMPT_MESSAGES, '');

      const aiGeneration = getString(span, SPAN_KEYS.SPAN_ID, '');
      const genResponseText = getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, '');
      const formatted = genType
        ? formatGenerationType(genType, genResponseText)
        : { description: 'AI model generating text' };
      activities.push({
        id: aiGeneration,
        type: ACTIVITY_TYPES.AI_GENERATION,
        description: formatted.description,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(aiGeneration) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID, '') || undefined,
        subAgentName: getString(span, SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME, '') || undefined,
        result: hasError ? 'AI generation failed' : (formatted.result ?? `${durMs.toFixed(2)}ms`),
        aiModel: getString(span, SPAN_KEYS.AI_MODEL_ID, 'Unknown Model'),
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        costUsd: getNumber(span, SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0) || undefined,
        aiResponseText: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, '') || undefined,
        aiResponseToolCalls: aiResponseToolCalls || undefined,
        aiPromptMessages: aiPromptMessages || undefined,
        aiTelemetryFunctionId: getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '') || undefined,
        aiTelemetryPhase: getString(span, SPAN_KEYS.AI_TELEMETRY_METADATA_PHASE, '') || undefined,
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
        contextBreakdown: spanIdToContextBreakdown.get(agentGeneration),
      });
    }

    // ai streaming text
    for (const span of aiStreamingSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiStreamingText = getString(span, SPAN_KEYS.SPAN_ID, '');
      const statusMessage = hasError ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') : '';
      const streamGenType = getString(span, SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE, '');
      const streamResponseText = getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, '');
      const streamFormatted = streamGenType
        ? formatGenerationType(streamGenType, streamResponseText)
        : { description: 'AI model streaming text' };
      activities.push({
        id: aiStreamingText,
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
        description: streamFormatted.description,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(aiStreamingText) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(span, SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID, '') || undefined,
        subAgentName: getString(span, SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_NAME, '') || undefined,
        result: hasError
          ? 'AI streaming failed'
          : (streamFormatted.result ?? `${durMs.toFixed(2)}ms`),
        aiStreamTextContent: getString(span, SPAN_KEYS.AI_RESPONSE_TEXT, ''),
        aiStreamTextModel: getString(span, SPAN_KEYS.AI_MODEL_ID, 'Unknown Model'),
        aiStreamTextOperationId: getString(span, SPAN_KEYS.AI_OPERATION_ID, '') || undefined,
        inputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS, 0),
        outputTokens: getNumber(span, SPAN_KEYS.GEN_AI_USAGE_OUTPUT_TOKENS, 0),
        costUsd: getNumber(span, SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD, 0) || undefined,
        aiTelemetryFunctionId: getString(span, SPAN_KEYS.AI_TELEMETRY_FUNCTION_ID, '') || undefined,
        aiTelemetryPhase: getString(span, SPAN_KEYS.AI_TELEMETRY_METADATA_PHASE, '') || undefined,
        otelStatusDescription: statusMessage || undefined,
      });
    }

    // context fetchers
    for (const span of contextFetcherSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const contextFetcher = getString(span, SPAN_KEYS.SPAN_ID, '');
      const statusMessage = hasError ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') : '';
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
        otelStatusDescription: statusMessage || undefined,
      });
    }

    // artifact processing
    for (const span of artifactProcessingSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const artifactName = getString(span, SPAN_KEYS.ARTIFACT_NAME, '');
      const artifactType = getString(span, SPAN_KEYS.ARTIFACT_TYPE, '');
      const artifactDescription = getString(span, SPAN_KEYS.ARTIFACT_DESCRIPTION, '');
      const statusMessage = hasError ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') : '';
      const isOversized = getField(span, SPAN_KEYS.ARTIFACT_IS_OVERSIZED) === true;
      const retrievalBlocked = getField(span, SPAN_KEYS.ARTIFACT_RETRIEVAL_BLOCKED) === true;
      const originalTokenSize = getNumber(span, SPAN_KEYS.ARTIFACT_ORIGINAL_TOKEN_SIZE, 0);
      const contextWindowSize = getNumber(span, SPAN_KEYS.ARTIFACT_CONTEXT_WINDOW_SIZE, 0);

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
        artifactIsOversized: isOversized || undefined,
        artifactRetrievalBlocked: retrievalBlocked || undefined,
        artifactOriginalTokenSize: originalTokenSize > 0 ? originalTokenSize : undefined,
        artifactContextWindowSize: contextWindowSize > 0 ? contextWindowSize : undefined,
        otelStatusDescription: statusMessage || undefined,
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

    // compression spans
    for (const span of compressionSpans) {
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const compressionSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');

      // Extract compression-specific attributes
      const compressionType = getString(span, SPAN_KEYS.COMPRESSION_TYPE, '');
      const generatedTokens = getNumber(span, SPAN_KEYS.COMPRESSION_GENERATED_TOKENS, 0);
      const totalContextTokens = getNumber(span, SPAN_KEYS.COMPRESSION_TOTAL_CONTEXT_TOKENS, 0);
      const triggerAt = getNumber(span, SPAN_KEYS.COMPRESSION_TRIGGER_AT, 0);
      const outputTokens = getNumber(span, SPAN_KEYS.COMPRESSION_RESULT_OUTPUT_TOKENS, 0);
      const compressionRatio = getNumber(span, SPAN_KEYS.COMPRESSION_RESULT_COMPRESSION_RATIO, 0);
      const messageCount = getNumber(span, SPAN_KEYS.COMPRESSION_MESSAGE_COUNT, 0);
      const compressionError = getString(span, SPAN_KEYS.COMPRESSION_ERROR, '');
      const compressionSummary = getString(span, SPAN_KEYS.COMPRESSION_RESULT_HIGH_LEVEL, '');

      const description =
        compressionType === 'mid_generation'
          ? 'Context compacting'
          : compressionType === 'conversation_level'
            ? 'Conversation history compacting'
            : compressionType || 'Unknown';

      activities.push({
        id: compressionSpanId,
        type: ACTIVITY_TYPES.COMPRESSION,
        description,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(compressionSpanId) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId: getString(
          span,
          SPAN_KEYS.COMPRESSION_SESSION_ID,
          getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT)
        ),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result:
          compressionError ||
          `Compressed ${messageCount} messages, ${totalContextTokens} → ${outputTokens} tokens`,
        // Compression-specific fields
        compressionType,
        compressionGeneratedTokens: generatedTokens,
        compressionTotalContextTokens: totalContextTokens,
        compressionTriggerAt: triggerAt,
        compressionOutputTokens: outputTokens,
        compressionRatio,
        compressionError: compressionError || undefined,
        compressionSummary: compressionSummary || undefined,
      });
    }

    // max steps reached spans
    for (const span of maxStepsReachedSpans) {
      const maxStepsSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const stepsCompleted = getNumber(span, SPAN_KEYS.AGENT_STEPS_COMPLETED, 0);
      const maxSteps = getNumber(span, SPAN_KEYS.AGENT_MAX_STEPS, 0);
      const subAgentId = getString(span, SPAN_KEYS.SUB_AGENT_ID, '');
      const subAgentName = getString(span, SPAN_KEYS.SUB_AGENT_NAME, '');

      activities.push({
        id: maxStepsSpanId,
        type: ACTIVITY_TYPES.MAX_STEPS_REACHED,
        description: `Max generation steps reached (${stepsCompleted}/${maxSteps})`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(maxStepsSpanId) || undefined,
        status: ACTIVITY_STATUS.WARNING,
        subAgentId: subAgentId || ACTIVITY_NAMES.UNKNOWN_AGENT,
        subAgentName: subAgentName || ACTIVITY_NAMES.UNKNOWN_AGENT,
        result: `Sub-agent stopped after ${stepsCompleted} generation steps (limit: ${maxSteps})`,
        maxStepsReached: true,
        stepsCompleted,
        maxSteps,
      });
    }

    for (const span of streamLifetimeExceededSpans) {
      const spanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const cleanupReason = getString(span, SPAN_KEYS.STREAM_CLEANUP_REASON, '');
      const maxLifetimeMs = getNumber(span, SPAN_KEYS.STREAM_MAX_LIFETIME_MS, 0);
      const bufferSizeBytes = getNumber(span, SPAN_KEYS.STREAM_BUFFER_SIZE_BYTES, 0);

      activities.push({
        id: spanId,
        type: ACTIVITY_TYPES.STREAM_LIFETIME_EXCEEDED,
        description: `Stream lifetime exceeded (${Math.round(maxLifetimeMs / 1000)}s limit)`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(spanId) || undefined,
        status: ACTIVITY_STATUS.ERROR,
        result: cleanupReason,
        streamCleanupReason: cleanupReason,
        streamMaxLifetimeMs: maxLifetimeMs,
        streamBufferSizeBytes: bufferSizeBytes,
      });
    }

    for (const span of durableToolExecutionSpans) {
      const spanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const hasError = getField(span, SPAN_KEYS.HAS_ERROR) === true;
      const toolName = getString(span, SPAN_KEYS.TOOL_NAME, '');
      const toolCallId = getString(span, SPAN_KEYS.TOOL_CALL_ID, '');
      const subAgentId = getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT);
      const toolResponseContent = getString(span, SPAN_KEYS.TOOL_RESPONSE_CONTENT, '');

      activities.push({
        id: spanId,
        type: ACTIVITY_TYPES.DURABLE_TOOL_EXECUTION,
        description: hasError
          ? `Durable tool execution failed: ${toolName}`
          : `Durable tool executed: ${toolName}`,
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(spanId) || undefined,
        status: hasError ? ACTIVITY_STATUS.ERROR : ACTIVITY_STATUS.SUCCESS,
        subAgentId,
        toolName: toolName || undefined,
        toolCallId: toolCallId || undefined,
        toolResponseContent: toolResponseContent || undefined,
      });
    }

    // Pre-parse all timestamps once for better performance
    const allSpanTimes = durationSpans.map((s) => new Date(s.timestamp).getTime());
    const operationStartTime = allSpanTimes.length > 0 ? Math.min(...allSpanTimes) : null;
    const operationEndTime = allSpanTimes.length > 0 ? Math.max(...allSpanTimes) : null;

    // Resolve parentSpanId to nearest ancestor activity
    const activityIds = new Set(activities.map((a) => a.id));
    const ancestorCache = new Map<string, string | undefined>();
    function findAncestorActivity(spanId: string, depth = 0): string | undefined {
      if (!spanId || depth > 200) return undefined;
      if (activityIds.has(spanId)) return spanId;
      if (ancestorCache.has(spanId)) return ancestorCache.get(spanId);
      const parentSpanId = spanIdToParentSpanId.get(spanId);
      if (!parentSpanId) {
        ancestorCache.set(spanId, undefined);
        return undefined;
      }
      const result = findAncestorActivity(parentSpanId, depth + 1);
      ancestorCache.set(spanId, result);
      return result;
    }
    for (const activity of activities) {
      if (activity.parentSpanId) {
        activity.parentSpanId = findAncestorActivity(activity.parentSpanId) || undefined;
      }
    }

    const activityById = new Map(activities.map((a) => [a.id, a]));
    const agentGenCache = new Map<string, string | null>();
    function findAncestorAgentGeneration(activityId: string, depth = 0): string | null {
      if (depth > 200) return null;
      if (agentGenCache.has(activityId)) return agentGenCache.get(activityId) ?? null;
      const activity = activityById.get(activityId);
      if (!activity) {
        agentGenCache.set(activityId, null);
        return null;
      }
      if (activity.type === ACTIVITY_TYPES.AGENT_GENERATION) {
        agentGenCache.set(activityId, activity.id);
        return activity.id;
      }
      if (!activity.parentSpanId) {
        agentGenCache.set(activityId, null);
        return null;
      }
      const result = findAncestorAgentGeneration(activity.parentSpanId, depth + 1);
      agentGenCache.set(activityId, result);
      return result;
    }

    // Group tool calls by their ancestor agent generation
    const toolCallsByAgentGen = new Map<string, Activity[]>();
    for (const activity of activities) {
      if (activity.type === ACTIVITY_TYPES.TOOL_CALL) {
        const ancestorAgentGen = findAncestorAgentGeneration(activity.id);
        if (ancestorAgentGen) {
          if (!toolCallsByAgentGen.has(ancestorAgentGen)) {
            toolCallsByAgentGen.set(ancestorAgentGen, []);
          }
          toolCallsByAgentGen.get(ancestorAgentGen)?.push(activity);
        }
      }
    }

    // For each agent generation, check if ALL tool calls to the same MCP server failed
    for (const [_agentGenId, toolCallsInGeneration] of toolCallsByAgentGen) {
      if (toolCallsInGeneration.length === 0) continue;

      // Group tool calls by MCP server name
      const toolCallsByMcpServer = new Map<string, Activity[]>();
      for (const toolCall of toolCallsInGeneration) {
        // Skip tool calls without an MCP server name
        if (!toolCall.mcpServerName) continue;

        if (!toolCallsByMcpServer.has(toolCall.mcpServerName)) {
          toolCallsByMcpServer.set(toolCall.mcpServerName, []);
        }
        toolCallsByMcpServer.get(toolCall.mcpServerName)?.push(toolCall);
      }

      // For each MCP server, check if ALL or SOME tool calls failed
      for (const [_mcpServerName, toolCallsToServer] of toolCallsByMcpServer) {
        const failedToolCalls = toolCallsToServer.filter((a) => a.status === ACTIVITY_STATUS.ERROR);
        const successfulToolCalls = toolCallsToServer.filter(
          (a) => a.status === ACTIVITY_STATUS.SUCCESS
        );

        if (failedToolCalls.length > 0 && successfulToolCalls.length > 0) {
          for (const toolCall of failedToolCalls) {
            toolCall.status = ACTIVITY_STATUS.WARNING;
          }
        }
      }
    }

    // Sort activities by pre-parsed timestamps
    activities.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Conversation duration: user-facing timeline (first user message to last AI response)
    const firstUser = activities.find((a) => a.type === ACTIVITY_TYPES.USER_MESSAGE);
    const lastAssistant = activities.findLast(
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

    const TOKEN_ACTIVITY_TYPES: Set<string> = new Set([
      ACTIVITY_TYPES.AI_GENERATION,
      ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
    ]);
    const { totalInputTokens, totalOutputTokens } = activities.reduce(
      (acc, a) => {
        if (TOKEN_ACTIVITY_TYPES.has(a.type)) {
          if (typeof a.inputTokens === 'number') acc.totalInputTokens += a.inputTokens;
          if (typeof a.outputTokens === 'number') acc.totalOutputTokens += a.outputTokens;
        }
        return acc;
      },
      { totalInputTokens: 0, totalOutputTokens: 0 }
    );

    const openAICallsCount = aiGenerationSpans.length;

    let finalErrorCount = 0;
    let finalWarningCount = 0;
    let totalMessages = 0;
    let totalToolCalls = 0;
    for (const a of activities) {
      if (a.status === ACTIVITY_STATUS.ERROR) finalErrorCount++;
      if (a.status === ACTIVITY_STATUS.WARNING) finalWarningCount++;
      if (a.type === ACTIVITY_TYPES.USER_MESSAGE || a.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE)
        totalMessages++;
      if (a.type === ACTIVITY_TYPES.TOOL_CALL) totalToolCalls++;
    }

    const conversation = {
      conversationId,
      startTime: conversationStartTime ? conversationStartTime : null,
      endTime: conversationEndTime ? conversationEndTime : null,
      duration: conversationDurationMs,
      totalMessages,
      totalToolCalls,
      totalErrors: finalErrorCount,
      totalOpenAICalls: openAICallsCount,
    };

    const tDone = Date.now();
    logger.info(
      {
        conversationId,
        processingMs: tDone - tSignoz,
        totalMs: tDone - t0,
      },
      'conversation detail complete'
    );

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
      spansWithErrorsCount: spansWithErrorsList.length,
      errorCount: finalErrorCount,
      warningCount: finalWarningCount,
      // Trigger-specific info (null if not a trigger invocation)
      invocationType,
      invocationEntryPoint,
      triggerId,
      triggerInvocationId,
    });
  } catch (error) {
    const logger = getLogger('conversation-details');
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch conversation details';
    const err = error as {
      message?: string;
      name?: string;
      code?: unknown;
      cause?: { code?: string; message?: string };
    };
    logger.error(
      {
        errorName: err?.name,
        errorMessage: err?.message,
        errorCode: err?.code,
        causeCode: err?.cause?.code,
        causeMessage: err?.cause?.message,
      },
      'Error fetching conversation details'
    );

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
