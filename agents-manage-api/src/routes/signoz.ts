import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
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
  createApiError,
  ErrorResponseSchema,
  getConversation,
  projectExists,
} from '@inkeep/agents-core';
import axios from 'axios';
import { HTTPException } from 'hono/http-exception';
import dbClient from '../data/db/dbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import type { BaseAppVariables } from '../types/app';

const START_2020_MS = new Date('2020-01-01T00:00:00Z').getTime();

const logger = getLogger('signoz-proxy');

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

// Build payload function - matches the original Next.js route query structure
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

// GET /health - Check SigNoz configuration (no auth required for health checks)
app.get('/health', async (c) => {
  const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
  const signozApiKey = env.SIGNOZ_API_KEY;

  logger.info(
    {
      hasUrl: !!signozUrl,
      hasApiKey: !!signozApiKey,
      url: signozUrl,
    },
    'Checking SigNoz configuration'
  );

  // Check if credentials are set
  if (!signozUrl || !signozApiKey) {
    logger.warn({}, 'SigNoz credentials not set');
    return c.json({
      status: 'not_configured',
      configured: false,
      error: 'SIGNOZ_URL or SIGNOZ_API_KEY not set.',
    });
  }

  // Test the connection with minimal authenticated query
  try {
    const testPayload = {
      start: Date.now() - 300000, // 5 minutes ago
      end: Date.now(),
      step: 60,
      compositeQuery: {
        queryType: 'builder',
        panelType: 'list',
        builderQueries: {},
      },
    };

    const signozEndpoint = `${signozUrl}/api/v4/query_range`;
    logger.info({ endpoint: signozEndpoint }, 'Testing SigNoz connection');

    const response = await axios.post(signozEndpoint, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': signozApiKey,
      },
      timeout: 5000,
      validateStatus: (status) => {
        // Accept both 200 and 400 as success (both mean valid API key)
        return status === 200 || status === 400;
      },
    });

    logger.info({ status: response.status }, 'SigNoz health check successful');

    return c.json({
      status: 'ok',
      configured: true,
    });
  } catch (error) {
    logger.error({ error }, 'SigNoz connection test failed');

    let errorMessage = 'Failed to connect to SigNoz';
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Check SIGNOZ_URL configuration';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Invalid SIGNOZ_API_KEY';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage = 'SigNoz connection timeout';
      }
    }

    return c.json({
      status: 'error',
      configured: false,
      error: errorMessage,
    });
  }
});

const SignozQueryRequestSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  step: z.number().int().positive().optional().default(60),
  variables: z.record(z.string(), z.any()).optional().default({}),
  compositeQuery: z.object({
    queryType: z.string(),
    panelType: z.string().optional(),
    builderQueries: z.record(z.string(), z.any()).optional(),
  }),
  dataSource: z.string().optional(),
  projectId: z.string().optional(),
});

const SignozQueryResponseSchema = z.object({
  data: z.any(),
});

function enforceProjectFilter(payload: any, projectId: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  if (modifiedPayload.compositeQuery?.builderQueries) {
    for (const queryKey in modifiedPayload.compositeQuery.builderQueries) {
      const query = modifiedPayload.compositeQuery.builderQueries[queryKey];

      if (!query.filters) {
        query.filters = { op: 'AND', items: [] };
      }

      query.filters.items = query.filters.items.filter(
        (item: any) => item.key?.key !== 'project.id'
      );

      query.filters.items.push({
        key: {
          key: 'project.id',
          dataType: 'string',
          type: 'tag',
          isColumn: false,
          isJSON: false,
          id: 'false',
        },
        op: '=',
        value: projectId,
      });
    }
  }

  return modifiedPayload;
}

app.openapi(
  createRoute({
    method: 'post',
    path: '/query',
    summary: 'Query SigNoz traces with authorization',
    operationId: 'query-signoz',
    tags: ['SigNoz'],
    description:
      'Proxies queries to SigNoz with server-side authorization and project filtering. Ensures users can only access traces for projects they have access to.',
    security: [{ cookieAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: SignozQueryRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'SigNoz query executed successfully',
        content: {
          'application/json': {
            schema: SignozQueryResponseSchema,
          },
        },
      },
      400: {
        description: 'Bad request - invalid query parameters',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - session required',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      403: {
        description: 'Forbidden - no access to requested project',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      503: {
        description: 'Service unavailable - SigNoz not configured or unreachable',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    let payload = c.req.valid('json');
    const requestedProjectId = payload.projectId;
    const tenantId = c.get('tenantId');

    logger.info(
      { tenantId, projectId: requestedProjectId, hasProjectId: !!requestedProjectId },
      'Processing SigNoz query request'
    );

    if (requestedProjectId) {
      const projectExistsCheck = await projectExists(dbClient)({
        tenantId,
        projectId: requestedProjectId,
      });

      if (!projectExistsCheck) {
        logger.warn(
          { tenantId, projectId: requestedProjectId },
          'Project not found or access denied'
        );
        throw createApiError({
          code: 'forbidden',
          message: 'You do not have access to this project',
          instance: c.req.path,
          extensions: {
            requestedProjectId,
            tenantId,
          },
        });
      }

      payload = enforceProjectFilter(payload, requestedProjectId);
      logger.debug({ projectId: requestedProjectId }, 'Project filter enforced');
    }

    const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
    const signozApiKey = env.SIGNOZ_API_KEY;

    if (!signozUrl || !signozApiKey) {
      logger.error({}, 'SigNoz not configured');
      throw createApiError({
        code: 'internal_server_error',
        message: 'SigNoz is not configured',
      });
    }

    try {
      const signozEndpoint = `${signozUrl}/api/v4/query_range`;
      logger.debug({ endpoint: signozEndpoint }, 'Calling SigNoz');

      const response = await axios.post(signozEndpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'SIGNOZ-API-KEY': signozApiKey,
        },
        timeout: 30000,
      });

      logger.info({ status: response.status }, 'SigNoz query successful');

      return c.json(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          logger.error({ error: error.message }, 'SigNoz service unavailable');
          throw createApiError({
            code: 'internal_server_error',
            message: 'SigNoz service is unavailable',
          });
        }
        if (error.response?.status === 401 || error.response?.status === 403) {
          logger.error({ status: error.response.status }, 'SigNoz authentication failed');
          throw createApiError({
            code: 'internal_server_error',
            message: 'SigNoz authentication failed',
          });
        }
        if (error.response?.status === 400) {
          logger.warn({ status: error.response.status }, 'Invalid SigNoz query');
          throw createApiError({
            code: 'bad_request',
            message: 'Invalid query parameters',
          });
        }
      }

      logger.error({ error }, 'SigNoz query failed');
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to query SigNoz',
        extensions: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
);

// GET /projects/:projectId/conversations/:conversationId/sql-attributes - Get span attributes via SQL
app.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectId}/conversations/{conversationId}/sql-attributes',
    summary: 'Get all span attributes for a conversation via SQL query',
    operationId: 'get-conversation-sql-attributes',
    tags: ['SigNoz'],
    description:
      'Fetches all span attributes for a conversation using SigNoz SQL query. Used to get parent span relationships and complete attribute data.',
    security: [{ cookieAuth: [] }],
    request: {
      params: z.object({
        projectId: z.string(),
        conversationId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Span attributes retrieved successfully',
        content: {
          'application/json': {
            schema: z.any(),
          },
        },
      },
      404: {
        description: 'Conversation not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      500: {
        description: 'Failed to fetch span attributes',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c): Promise<any> => {
    const { projectId, conversationId } = c.req.valid('param');
    const tenantId = c.get('tenantId');

    logger.info(
      { tenantId, projectId, conversationId },
      'Fetching conversation SQL attributes from SigNoz'
    );

    // Validate conversation access
    try {
      const conversation = await getConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        logger.warn({ tenantId, conversationId }, 'Conversation not found');
        throw createApiError({
          code: 'not_found',
          message: 'Conversation not found',
          instance: c.req.path,
        });
      }

      const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
      const signozApiKey = env.SIGNOZ_API_KEY;

      if (!signozUrl || !signozApiKey) {
        logger.error({ tenantId, projectId }, 'SigNoz not configured');
        throw createApiError({
          code: 'internal_server_error',
          message: 'SigNoz is not configured',
        });
      }

      // Build SQL query for span attributes
      const results: Array<{
        spanId: string;
        traceId: string;
        timestamp: string;
        data: Record<string, any>;
      }> = [];

      const LIMIT = 1000;
      let offset = 0;
      const tableName = 'distributed_signoz_index_v3';

      const basePayload = {
        start: new Date('2020-01-01T00:00:00Z').getTime(),
        end: Date.now(),
        step: 60,
        variables: {
          conversation_id: conversationId,
          limit: LIMIT,
          offset: 0,
        },
        compositeQuery: {
          queryType: 'clickhouse_sql',
          panelType: 'table',
          chQueries: {
            A: {
              query: `
                SELECT
                  trace_id, span_id, parent_span_id,
                  timestamp,
                  name,
                  toJSONString(attributes_string) AS attributes_string_json,
                  toJSONString(attributes_number) AS attributes_number_json,
                  toJSONString(attributes_bool)   AS attributes_bool_json,
                  toJSONString(resources_string)  AS resources_string_json
                FROM signoz_traces.${tableName}
                WHERE attributes_string['conversation.id'] = {{.conversation_id}}
                  AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
                  AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
                ORDER BY timestamp DESC
                LIMIT {{.limit}} OFFSET {{.offset}}
              `,
            },
          },
        },
      };

      // Paginate through results
      while (true) {
        const payload = JSON.parse(JSON.stringify(basePayload));
        payload.variables.offset = offset;

        const response = await axios.post(`${signozUrl}/api/v4/query_range`, payload, {
          headers: {
            'Content-Type': 'application/json',
            'SIGNOZ-API-KEY': signozApiKey,
          },
          timeout: 30000,
        });

        const json = response.data;
        const result = json?.data?.result?.[0];
        const rows: any[] = result?.series
          ? result.series
              .map((s: any) => ({
                trace_id: s.labels?.trace_id,
                span_id: s.labels?.span_id,
                parent_span_id: s.labels?.parent_span_id,
                timestamp: s.labels?.timestamp,
                name: s.labels?.name,
                attributes_string_json: s.labels?.attributes_string_json,
                attributes_number_json: s.labels?.attributes_number_json,
                attributes_bool_json: s.labels?.attributes_bool_json,
                resources_string_json: s.labels?.resources_string_json,
              }))
              .filter((r: any) => r.trace_id && r.span_id)
          : [];

        if (!rows.length) {
          break;
        }

        for (const r of rows) {
          const attrsString = JSON.parse(r.attributes_string_json || '{}');
          const attrsNum = JSON.parse(r.attributes_number_json || '{}');
          const attrsBool = JSON.parse(r.attributes_bool_json || '{}');
          const resString = JSON.parse(r.resources_string_json || '{}');

          results.push({
            spanId: r.span_id,
            traceId: r.trace_id,
            timestamp: r.timestamp,
            data: {
              name: r.name,
              spanID: r.span_id,
              traceID: r.trace_id,
              parentSpanID: r.parent_span_id,
              ...attrsString,
              ...attrsNum,
              ...attrsBool,
              ...resString,
            },
          });
        }

        offset += LIMIT;
        if (rows.length < LIMIT) {
          break;
        }
      }

      logger.info(
        { conversationId, totalSpans: results.length },
        'SQL attributes retrieved successfully'
      );

      return c.json(results);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        logger.error({ error: error.message, conversationId }, 'Failed to fetch SQL attributes');
        throw createApiError({
          code: 'internal_server_error',
          message: 'Failed to fetch span attributes from SigNoz',
          extensions: {
            error: error.message,
          },
        });
      }

      logger.error({ error, conversationId }, 'Failed to fetch SQL attributes');
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to fetch span attributes',
        extensions: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
);

// GET /projects/:projectId/conversations/:conversationId - Get conversation details from SigNoz
app.openapi(
  createRoute({
    method: 'get',
    path: '/projects/{projectId}/conversations/{conversationId}',
    summary: 'Get conversation trace details from SigNoz',
    operationId: 'get-conversation-traces',
    tags: ['SigNoz'],
    description:
      'Fetches trace details for a specific conversation from SigNoz with authorization. Validates user has access to the conversation before returning trace data.',
    security: [{ cookieAuth: [] }],
    request: {
      params: z.object({
        projectId: z.string(),
        conversationId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Conversation trace data retrieved successfully',
        content: {
          'application/json': {
            schema: SignozQueryResponseSchema,
          },
        },
      },
      403: {
        description: 'Forbidden - no access to this conversation',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
      404: {
        description: 'Conversation not found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { projectId, conversationId } = c.req.valid('param');
    const tenantId = c.get('tenantId');

    logger.info({ tenantId, projectId, conversationId }, 'Fetching conversation traces from SigNoz');

    // Get conversation from database to validate access
    try {
      const conversation = await getConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        logger.warn({ tenantId, conversationId }, 'Conversation not found');
        throw createApiError({
          code: 'not_found',
          message: 'Conversation not found',
          instance: c.req.path,
        });
      }

      const payload = buildConversationListPayload(conversationId);

      const signozUrl = env.SIGNOZ_URL || env.PUBLIC_SIGNOZ_URL;
      const signozApiKey = env.SIGNOZ_API_KEY;

      if (!signozUrl || !signozApiKey) {
        throw createApiError({
          code: 'internal_server_error',
          message: 'SigNoz is not configured',
        });
      }

      const response = await axios.post(`${signozUrl}/api/v4/query_range`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'SIGNOZ-API-KEY': signozApiKey,
        },
        timeout: 30000,
      });

      logger.info({ conversationId, status: response.status }, 'Conversation traces retrieved');

      return c.json(response.data);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw createApiError({
            code: 'internal_server_error',
            message: 'SigNoz service is unavailable',
          });
        }
      }

      logger.error({ error, conversationId }, 'Failed to fetch conversation traces');
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to fetch conversation traces',
        extensions: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
);

export default app;

