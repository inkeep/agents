import {
  CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE,
  parseContextBreakdownFromSpan,
  V1_BREAKDOWN_SCHEMA,
} from '@inkeep/agents-core/client-exports';
import type { AxiosResponse } from 'axios';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { type NextRequest, NextResponse } from 'next/server';
import {
  ACTIVITY_NAMES,
  ACTIVITY_STATUS,
  ACTIVITY_TYPES,
  AGENT_IDS,
  AI_OPERATIONS,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
} from '@/constants/signoz';
import { getAgentsApiUrl } from '@/lib/api/api-config';

import { getLogger } from '@/lib/logger';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

export const dynamic = 'force-dynamic';

// ---------- Types

type SpanRow = Record<string, any>;

const DEFAULT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function getString(span: SpanRow, key: string, fallback = ''): string {
  const v = span?.[key];
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

function getNumber(span: SpanRow, key: string, fallback = 0): number {
  const v = span?.[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getBool(span: SpanRow, key: string): boolean {
  const v = span?.[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === true || v === 1) return true;
  return false;
}

/**
 * Check if we should call SigNoz directly (server-to-server call without cookies)
 */
function shouldCallSigNozDirectly(cookieHeader: string | null): boolean {
  return !cookieHeader && !!process.env.SIGNOZ_URL && !!process.env.SIGNOZ_API_KEY;
}

/**
 * Get the SigNoz endpoint URL
 */
function getSigNozEndpoint(): string {
  const signozUrl = process.env.SIGNOZ_URL || process.env.PUBLIC_SIGNOZ_URL;
  return `${signozUrl}/api/v4/query_range`;
}

async function signozQuery(
  payload: any,
  tenantId: string,
  cookieHeader: string | null
): Promise<SpanRow[]> {
  const logger = getLogger('signoz-query');

  try {
    let response: AxiosResponse;

    // For server-to-server calls (no cookies), call SigNoz directly
    if (shouldCallSigNozDirectly(cookieHeader)) {
      const endpoint = getSigNozEndpoint();
      logger.debug({ endpoint }, 'Calling SigNoz directly for conversation traces');

      response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'SIGNOZ-API-KEY': process.env.SIGNOZ_API_KEY || '',
        },
        timeout: 30000,
      });
    } else {
      const agentsApiUrl = getAgentsApiUrl();
      const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      logger.debug({ endpoint }, 'Calling agents-api (ClickHouse SQL)');

      response = await axios.post(endpoint, payload, {
        headers,
        timeout: 30000,
        withCredentials: true,
      });
    }

    const json = response.data;
    const result = json?.data?.result?.[0];
    const series: Array<{ labels?: Record<string, string> }> = result?.series ?? [];

    logger.debug({ rowCount: series.length }, 'ClickHouse SQL response');

    return series.map((row) => {
      const labels = row.labels ?? {};
      const attrsStr = safeJsonParse(labels.attrs_str);
      const attrsNum = safeJsonParse(labels.attrs_num);
      const attrsBool = safeJsonParse(labels.attrs_bool);

      return {
        ...labels,
        ...attrsStr,
        ...attrsNum,
        ...attrsBool,
        [SPAN_KEYS.SPAN_ID]: labels.span_id,
        [SPAN_KEYS.TRACE_ID]: labels.trace_id,
        [SPAN_KEYS.PARENT_SPAN_ID]: labels.parent_span_id,
        [SPAN_KEYS.NAME]: labels.name,
        [SPAN_KEYS.TIMESTAMP]: new Date(parseInt(labels.timestamp_ms || '0', 10)).toISOString(),
        [SPAN_KEYS.DURATION_NANO]: Number(labels.duration_nano) || 0,
        [SPAN_KEYS.HAS_ERROR]: String(labels.has_error) === 'true',
        [SPAN_KEYS.STATUS_MESSAGE]: labels.status_message || attrsStr?.['status_message'] || '',
      };
    });
  } catch (e) {
    const logger = getLogger('signoz-query');
    logger.error({ error: e }, 'SigNoz query error');

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

function safeJsonParse(str: unknown): Record<string, any> {
  if (typeof str !== 'string' || !str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

// ---------- Payload builder (single ClickHouse SQL query)

function buildConversationPayload(
  conversationId: string,
  start = Date.now() - DEFAULT_LOOKBACK_MS,
  end = Date.now()
) {
  return {
    start,
    end,
    step: 60,
    variables: {
      conversation_id: conversationId,
    },
    compositeQuery: {
      queryType: 'clickhouse_sql',
      panelType: 'table',
      chQueries: {
        A: {
          query: `
            SELECT
              trace_id,
              span_id,
              parent_span_id,
              toUnixTimestamp64Milli(timestamp) AS timestamp_ms,
              name,
              duration_nano,
              has_error,
              status_message,
              status_code,
              toJSONString(attributes_string) AS attrs_str,
              toJSONString(attributes_number) AS attrs_num,
              toJSONString(attributes_bool) AS attrs_bool
            FROM signoz_traces.distributed_signoz_index_v3
            WHERE attributes_string['conversation.id'] = {{.conversation_id}}
              AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
              AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
            ORDER BY timestamp ASC
            LIMIT 10000
          `,
        },
      },
    },
  };
}

// ---------- Main handler

type RouteContext<_T> = {
  params: Promise<Record<string, string>>;
};

export async function GET(
  req: NextRequest,
  context: RouteContext<'/api/signoz/conversations/[conversationId]'>
) {
  const { conversationId } = await context.params;
  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
  }

  // Get tenantId and projectId from URL search params
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';

  // Optional time range params to narrow the ClickHouse scan window
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  // Forward cookies for authentication
  const cookieHeader = req.headers.get('cookie');

  try {
    const now = Date.now();
    const start = startParam ? Number(startParam) : now - DEFAULT_LOOKBACK_MS;
    const end = endParam ? Number(endParam) : now;

    const payload = buildConversationPayload(conversationId, start, end);
    const allSpans = await signozQuery(payload, tenantId, cookieHeader);

    const toolCallSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.AI_TOOL_CALL
    );
    const contextResolutionSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.CONTEXT_RESOLUTION
    );
    const contextHandleSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.CONTEXT_HANDLE
    );
    const agentGenerationSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.AGENT_GENERATION
    );
    const spansWithErrorsList = allSpans.filter((s) => getBool(s, SPAN_KEYS.HAS_ERROR));
    const userMessageSpans = allSpans.filter((s) => !!getString(s, SPAN_KEYS.MESSAGE_CONTENT));
    const aiAssistantSpans = allSpans.filter((s) => !!getString(s, SPAN_KEYS.AI_RESPONSE_CONTENT));
    const aiGenerationSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.AI_OPERATION_ID) === AI_OPERATIONS.GENERATE_TEXT
    );
    const aiStreamingSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.AI_OPERATION_ID) === AI_OPERATIONS.STREAM_TEXT
    );
    const contextFetcherSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.CONTEXT_FETCHER
    );
    const durationSpans = allSpans;
    const artifactProcessingSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.ARTIFACT_PROCESSING
    );
    const toolApprovalRequestedSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.TOOL_APPROVAL_REQUESTED
    );
    const toolApprovalApprovedSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.TOOL_APPROVAL_APPROVED
    );
    const toolApprovalDeniedSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.TOOL_APPROVAL_DENIED
    );
    const compressionSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.COMPRESSOR_SAFE_COMPRESS
    );
    const maxStepsReachedSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.AGENT_MAX_STEPS_REACHED
    );
    const streamLifetimeExceededSpans = allSpans.filter(
      (s) => getString(s, SPAN_KEYS.NAME) === SPAN_NAMES.STREAM_FORCE_CLEANUP
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
      const totalValue = span?.[CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE];
      if (spanId && totalValue !== undefined && totalValue !== '' && totalValue !== null) {
        const data: Record<string, unknown> = {};
        data[CONTEXT_BREAKDOWN_TOTAL_SPAN_ATTRIBUTE] = totalValue;
        for (const def of V1_BREAKDOWN_SCHEMA) {
          data[def.spanAttribute] = span?.[def.spanAttribute];
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
        | 'stream_lifetime_exceeded';
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
      compressionInputTokens?: number;
      compressionOutputTokens?: number;
      compressionRatio?: number;
      compressionArtifactCount?: number;
      compressionMessageCount?: number;
      compressionHardLimit?: number;
      compressionSafetyBuffer?: number;
      compressionError?: string;
      compressionSummary?: string;
      maxStepsReached?: boolean;
      stepsCompleted?: number;
      maxSteps?: number;
      streamCleanupReason?: string;
      streamMaxLifetimeMs?: number;
      streamBufferSizeBytes?: number;
    };

    const activities: Activity[] = [];

    // tool calls → activities
    for (const span of toolCallSpans) {
      const name = getString(span, SPAN_KEYS.AI_TOOL_CALL_NAME, 'Unknown Tool');

      // Skip thinking_complete tool calls from the timeline
      if (name === 'thinking_complete') {
        continue;
      }

      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const statusMessage =
        getString(span, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');

      // context keys maybe JSON
      let keys: string[] | undefined;
      const rawKeys = span?.[SPAN_KEYS.CONTEXT_HEADERS_KEYS];
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const statusMessage =
        getString(span, SPAN_KEYS.STATUS_MESSAGE) ||
        getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '');

      // context keys maybe JSON
      let keys: string[] | undefined;
      const rawKeys = span?.[SPAN_KEYS.CONTEXT_HEADERS_KEYS];
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const userMessageSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const invocationType = getString(span, SPAN_KEYS.INVOCATION_TYPE, '');
      const spanEntryPoint = getString(span, SPAN_KEYS.INVOCATION_ENTRY_POINT, '');
      const triggerId = getString(span, SPAN_KEYS.TRIGGER_ID, '');
      const triggerInvocationId = getString(span, SPAN_KEYS.TRIGGER_INVOCATION_ID, '');

      // Determine description based on invocation type
      const isTriggerInvocation = invocationType === 'trigger';
      const isSlackMessage = invocationType === 'slack';
      const entryPointLabel = spanEntryPoint ? ` (${spanEntryPoint.replace(/_/g, ' ')})` : '';
      const description = isTriggerInvocation
        ? 'Trigger invocation received'
        : isSlackMessage
          ? `Slack message received${entryPointLabel}`
          : 'User sent a message';

      activities.push({
        id: userMessageSpanId,
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
        // Trigger-specific attributes
        invocationType: invocationType || undefined,
        invocationEntryPoint: spanEntryPoint || undefined,
        triggerId: triggerId || undefined,
        triggerInvocationId: triggerInvocationId || undefined,
      });
    }

    // ai assistant messages
    for (const span of aiAssistantSpans) {
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiAssistantMessageSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');
      const statusMessage = hasError
        ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') ||
          getString(span, SPAN_KEYS.OTEL_STATUS_DESCRIPTION, '')
        : '';
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
        hasError,
        otelStatusDescription: statusMessage || undefined,
      });
    }

    // ai generations
    for (const span of aiGenerationSpans) {
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const durMs = getNumber(span, SPAN_KEYS.DURATION_NANO) / 1e6;
      const aiStreamingText = getString(span, SPAN_KEYS.SPAN_ID, '');
      const statusMessage = hasError ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') : '';
      activities.push({
        id: aiStreamingText,
        type: ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT,
        description: 'AI model streaming text response',
        timestamp: span.timestamp,
        parentSpanId: spanIdToParentSpanId.get(aiStreamingText) || undefined,
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
        aiTelemetryPhase: getString(span, SPAN_KEYS.AI_TELEMETRY_METADATA_PHASE, '') || undefined,
        otelStatusDescription: statusMessage || undefined,
      });
    }

    // context fetchers
    for (const span of contextFetcherSpans) {
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const artifactName = getString(span, SPAN_KEYS.ARTIFACT_NAME, '');
      const artifactType = getString(span, SPAN_KEYS.ARTIFACT_TYPE, '');
      const artifactDescription = getString(span, SPAN_KEYS.ARTIFACT_DESCRIPTION, '');
      const statusMessage = hasError ? getString(span, SPAN_KEYS.STATUS_MESSAGE, '') : '';
      const isOversized = getBool(span, SPAN_KEYS.ARTIFACT_IS_OVERSIZED);
      const retrievalBlocked = getBool(span, SPAN_KEYS.ARTIFACT_RETRIEVAL_BLOCKED);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
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
      const hasError = getBool(span, SPAN_KEYS.HAS_ERROR);
      const compressionSpanId = getString(span, SPAN_KEYS.SPAN_ID, '');

      // Extract compression-specific attributes
      const compressionType = getString(span, 'compression.type', '');
      const inputTokens = getNumber(span, 'compression.input_tokens', 0);
      const outputTokens = getNumber(span, 'compression.result.output_tokens', 0);
      const compressionRatio = getNumber(span, 'compression.result.compression_ratio', 0);
      const artifactCount = getNumber(span, 'compression.result.artifact_count', 0);
      const messageCount = getNumber(span, 'compression.message_count', 0);
      const hardLimit = getNumber(span, 'compression.hard_limit', 0);
      const safetyBuffer = getNumber(span, 'compression.safety_buffer', 0);
      const compressionError = getString(span, 'compression.error', '');
      const compressionSummary = getString(span, 'compression.result.summary', '');

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
          'compression.session_id',
          getString(span, SPAN_KEYS.SUB_AGENT_ID, ACTIVITY_NAMES.UNKNOWN_AGENT)
        ),
        subAgentName: getString(span, SPAN_KEYS.SUB_AGENT_NAME, ACTIVITY_NAMES.UNKNOWN_AGENT),
        result:
          compressionError ||
          `Compressed ${messageCount} messages, ${inputTokens} → ${outputTokens} tokens`,
        // Compression-specific fields
        compressionType,
        compressionInputTokens: inputTokens,
        compressionOutputTokens: outputTokens,
        compressionRatio,
        compressionArtifactCount: artifactCount,
        compressionMessageCount: messageCount,
        compressionHardLimit: hardLimit,
        compressionSafetyBuffer: safetyBuffer,
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

    // Adjust tool call status based on whether ALL or SOME failed within their agent generation
    // Helper function to find the ancestor agent generation for an activity
    function findAncestorAgentGeneration(activityId: string): string | null {
      const activity = activities.find((a) => a.id === activityId);
      if (!activity) return null;
      if (activity.type === ACTIVITY_TYPES.AGENT_GENERATION) return activity.id;
      if (!activity.parentSpanId) return null;
      return findAncestorAgentGeneration(activity.parentSpanId);
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

    // Recalculate error and warning counts based on actual activity statuses
    const finalErrorCount = activities.filter((a) => a.status === ACTIVITY_STATUS.ERROR).length;
    const finalWarningCount = activities.filter((a) => a.status === ACTIVITY_STATUS.WARNING).length;

    const conversation = {
      conversationId,
      startTime: conversationStartTime ? conversationStartTime : null,
      endTime: conversationEndTime ? conversationEndTime : null,
      duration: conversationDurationMs,
      totalMessages: activities.filter(
        (a) =>
          a.type === ACTIVITY_TYPES.USER_MESSAGE || a.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE
      ).length,
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
