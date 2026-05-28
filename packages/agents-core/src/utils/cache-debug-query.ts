import { AI_OPERATIONS, SPAN_KEYS } from '../constants/otel-attributes';
import {
  buildFilterExpression,
  FIELD_CONTEXTS,
  FIELD_DATA_TYPES,
  OPERATORS,
  ORDER_DIRECTIONS,
  QUERY_DEFAULTS,
  QUERY_EXPRESSIONS,
  QUERY_TYPES,
  REQUEST_TYPES,
  SIGNALS,
} from '../constants/signoz-queries';

export const CACHE_DEBUG_QUERY_NAME = QUERY_EXPRESSIONS.AI_LLM_CALLS;

export interface CacheDebugQueryOptions {
  start: number;
  end: number;
  projectId?: string;
  limit?: number;
}

type SelectField = { name: string; fieldDataType: string; fieldContext: string };

const selectField = (name: string, fieldDataType: string, fieldContext: string): SelectField => ({
  name,
  fieldDataType,
  fieldContext,
});

export function buildCacheDebugQuery(conversationId: string, options: CacheDebugQueryOptions) {
  const { start, end, projectId, limit = QUERY_DEFAULTS.LIMIT_UNLIMITED } = options;

  const filterItems: Array<{ key: string; op: string; value: unknown }> = [
    { key: SPAN_KEYS.CONVERSATION_ID, op: OPERATORS.EQUALS, value: conversationId },
    {
      key: SPAN_KEYS.AI_OPERATION_ID,
      op: OPERATORS.IN,
      value: [AI_OPERATIONS.GENERATE_TEXT, AI_OPERATIONS.STREAM_TEXT],
    },
    ...(projectId ? [{ key: SPAN_KEYS.PROJECT_ID, op: OPERATORS.EQUALS, value: projectId }] : []),
  ];

  return {
    start,
    end,
    requestType: REQUEST_TYPES.RAW,
    ...(projectId ? { projectId } : {}),
    compositeQuery: {
      queries: [
        {
          type: QUERY_TYPES.BUILDER_QUERY,
          spec: {
            name: CACHE_DEBUG_QUERY_NAME,
            signal: SIGNALS.TRACES,
            filter: { expression: buildFilterExpression(filterItems) },
            selectFields: [
              selectField(SPAN_KEYS.SPAN_ID, FIELD_DATA_TYPES.STRING, FIELD_CONTEXTS.SPAN),
              selectField(SPAN_KEYS.TIMESTAMP, FIELD_DATA_TYPES.INT64, FIELD_CONTEXTS.SPAN),
              selectField(
                SPAN_KEYS.AI_OPERATION_ID,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(SPAN_KEYS.AI_MODEL_ID, FIELD_DATA_TYPES.STRING, FIELD_CONTEXTS.ATTRIBUTE),
              selectField(
                SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.AI_TELEMETRY_SUB_AGENT_ID,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(SPAN_KEYS.AGENT_ID, FIELD_DATA_TYPES.STRING, FIELD_CONTEXTS.ATTRIBUTE),
              selectField(
                SPAN_KEYS.AI_MODEL_PROVIDER,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.GEN_AI_RESPONSE_PROVIDER,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.GEN_AI_USAGE_INPUT_TOKENS,
                FIELD_DATA_TYPES.INT64,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
                FIELD_DATA_TYPES.INT64,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
                FIELD_DATA_TYPES.INT64,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.CACHE_INTENT_MARKER_COUNT,
                FIELD_DATA_TYPES.INT64,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
              selectField(
                SPAN_KEYS.CACHE_INTENT_PREFIX_SIGNATURE,
                FIELD_DATA_TYPES.STRING,
                FIELD_CONTEXTS.ATTRIBUTE
              ),
            ],
            order: [{ key: { name: SPAN_KEYS.TIMESTAMP }, direction: ORDER_DIRECTIONS.DESC }],
            limit,
            stepInterval: QUERY_DEFAULTS.STEP_INTERVAL,
            disabled: QUERY_DEFAULTS.DISABLED,
          },
        },
      ],
    },
  };
}
