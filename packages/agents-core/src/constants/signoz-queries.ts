// SigNoz-specific query building constants
// Used for constructing queries against the SigNoz API

/** SigNoz query data types */
export const DATA_TYPES = {
  STRING: 'string',
  INT64: 'int64',
  FLOAT64: 'float64',
  BOOL: 'bool',
} as const;

/** SigNoz query field types */
export const FIELD_TYPES = {
  TAG: 'tag',
  RESOURCE: 'resource',
} as const;

/** Common SigNoz query property combinations */
export const QUERY_FIELD_CONFIGS = {
  // String tag fields
  STRING_TAG: {
    dataType: DATA_TYPES.STRING,
    type: FIELD_TYPES.TAG,
    isColumn: false,
  },
  STRING_TAG_COLUMN: {
    dataType: DATA_TYPES.STRING,
    type: FIELD_TYPES.TAG,
    isColumn: true,
  },

  // Numeric tag fields
  INT64_TAG: {
    dataType: DATA_TYPES.INT64,
    type: FIELD_TYPES.TAG,
    isColumn: false,
  },
  INT64_TAG_COLUMN: {
    dataType: DATA_TYPES.INT64,
    type: FIELD_TYPES.TAG,
    isColumn: true,
  },
  FLOAT64_TAG: {
    dataType: DATA_TYPES.FLOAT64,
    type: FIELD_TYPES.TAG,
    isColumn: false,
  },
  FLOAT64_TAG_COLUMN: {
    dataType: DATA_TYPES.FLOAT64,
    type: FIELD_TYPES.TAG,
    isColumn: true,
  },

  // Boolean tag fields
  BOOL_TAG: {
    dataType: DATA_TYPES.BOOL,
    type: FIELD_TYPES.TAG,
    isColumn: false,
  },
  BOOL_TAG_COLUMN: {
    dataType: DATA_TYPES.BOOL,
    type: FIELD_TYPES.TAG,
    isColumn: true,
  },
} as const;

/** Query Operators */
export const OPERATORS = {
  // Comparison operators
  EQUALS: '=',
  NOT_EQUALS: '!=',
  LESS_THAN: '<',
  GREATER_THAN: '>',
  LESS_THAN_OR_EQUAL: '<=',
  GREATER_THAN_OR_EQUAL: '>=',

  // String operators
  LIKE: 'like',
  NOT_LIKE: 'nlike',

  // Existence operators
  EXISTS: 'exists',
  NOT_EXISTS: 'nexists',

  // Logical operators
  AND: 'AND',
  OR: 'OR',
} as const;

/** Query Expressions */
export const QUERY_EXPRESSIONS = {
  SPAN_NAMES: 'spanNames',
  AGENT_MODEL_CALLS: 'agentModelCalls',
  MODEL_CALLS: 'modelCalls',
  LAST_ACTIVITY: 'lastActivity',
  CONVERSATION_METADATA: 'conversationMetadata',
  FILTERED_CONVERSATIONS: 'filteredConversations',
  TOOLS: 'tools',
  TRANSFERS: 'transfers',
  DELEGATIONS: 'delegations',
  AI_CALLS: 'aiCalls',
  CONTEXT_ERRORS: 'contextErrors',
  AGENT_GENERATION_ERRORS: 'agentGenerationErrors',
  USER_MESSAGES: 'userMessages',
  UNIQUE_AGENTS: 'uniqueAgents',
  UNIQUE_MODELS: 'uniqueModels',
  // Route-specific query names
  TOOL_CALLS: 'toolCalls',
  CONTEXT_RESOLUTION: 'contextResolution',
  CONTEXT_HANDLE: 'contextHandle',
  AI_ASSISTANT_MESSAGES: 'aiAssistantMessages',
  AI_GENERATIONS: 'aiGenerations',
  AI_STREAMING_TEXT: 'aiStreamingText',
  CONTEXT_FETCHERS: 'contextFetchers',
  DURATION_SPANS: 'durationSpans',
  AGENT_GENERATIONS: 'agentGenerations',
  SPANS_WITH_ERRORS: 'spansWithErrors',
  ARTIFACT_PROCESSING: 'artifactProcessing',
} as const;

/** Query Reduce Operations */
export const REDUCE_OPERATIONS = {
  SUM: 'sum',
  MAX: 'max',
  MIN: 'min',
  AVG: 'avg',
  COUNT: 'count',
} as const;

/** Query Order Directions */
export const ORDER_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

/** Query Types */
export const QUERY_TYPES = {
  BUILDER: 'builder',
  CLICKHOUSE: 'clickhouse',
  PROMQL: 'promql',
} as const;

/** Panel Types */
export const PANEL_TYPES = {
  LIST: 'list',
  TABLE: 'table',
  AGENT: 'agent',
  VALUE: 'value',
} as const;

/** Query Data Sources */
export const DATA_SOURCES = {
  TRACES: 'traces',
  METRICS: 'metrics',
  LOGS: 'logs',
} as const;

/** Aggregate Operators */
export const AGGREGATE_OPERATORS = {
  COUNT: 'count',
  SUM: 'sum',
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
  NOOP: 'noop',
} as const;

/** Query Default Values */
export const QUERY_DEFAULTS = {
  STEP: 60,
  STEP_INTERVAL: 60,
  OFFSET: 0,
  DISABLED: false,
  HAVING: [],
  LEGEND: '',
  LIMIT_NULL: null,
  LIMIT_ZERO: 0,
  LIMIT_1000: 1000,
  EMPTY_GROUP_BY: [],
} as const;
