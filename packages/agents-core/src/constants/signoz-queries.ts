// SigNoz-specific query building constants
// Used for constructing queries against the SigNoz API

// ---------- v5 constants ----------

export const SCHEMA_VERSION = 'v1' as const;

export const REQUEST_TYPES = {
  SCALAR: 'scalar',
  TIME_SERIES: 'time_series',
  RAW: 'raw',
  RAW_STREAM: 'raw_stream',
  TRACE: 'trace',
  DISTRIBUTION: 'distribution',
} as const;

export const QUERY_ENVELOPE_TYPES = {
  BUILDER_QUERY: 'builder_query',
  BUILDER_FORMULA: 'builder_formula',
  BUILDER_TRACE_OPERATOR: 'builder_trace_operator',
  BUILDER_SUB_QUERY: 'builder_sub_query',
  BUILDER_JOIN: 'builder_join',
  CLICKHOUSE_SQL: 'clickhouse_sql',
  PROMQL: 'promql',
} as const;

export const FIELD_CONTEXTS = {
  RESOURCE: 'resource',
  ATTRIBUTE: 'attribute',
  SPAN: 'span',
  LOG: 'log',
  SCOPE: 'scope',
  EVENT: 'event',
  METRIC: 'metric',
  TRACE: 'trace',
} as const;

export const FIELD_DATA_TYPES = {
  STRING: 'string',
  INT64: 'int64',
  FLOAT64: 'float64',
  BOOL: 'bool',
  NUMBER: 'number',
} as const;

export const SIGNALS = {
  TRACES: 'traces',
} as const;

export function fieldKey(
  name: string,
  fieldDataType: string,
  fieldContext: string
): { name: string; fieldDataType: string; fieldContext: string } {
  return { name, fieldDataType, fieldContext };
}

const OP_MAP: Record<string, string> = {
  '=': '=',
  '!=': '!=',
  '<': '<',
  '>': '>',
  '<=': '<=',
  '>=': '>=',
  like: 'LIKE',
  nlike: 'NOT LIKE',
  contains: 'CONTAINS',
  ncontains: 'NOT CONTAINS',
  exists: 'EXISTS',
  nexists: 'NOT EXISTS',
  in: 'IN',
  nin: 'NOT IN',
};

function quoteValue(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (typeof value === 'boolean') return String(value);
  return String(value);
}

export function buildFilterExpression(
  items: Array<{ key: string; op: string; value: unknown }>
): string {
  const clauses = items.map(({ key, op, value }) => {
    const v5op = OP_MAP[op] ?? op;
    if (v5op === 'EXISTS' || v5op === 'NOT EXISTS') return `${key} ${v5op}`;
    if (v5op === 'IN' || v5op === 'NOT IN') {
      const vals = Array.isArray(value) ? value : [value];
      return `${key} ${v5op} (${vals.map(quoteValue).join(', ')})`;
    }
    if (v5op === 'CONTAINS' || v5op === 'NOT CONTAINS') {
      return `${key} ${v5op} ${quoteValue(value)}`;
    }
    return `${key} ${v5op} ${quoteValue(value)}`;
  });
  return clauses.join(' AND ');
}

// ---------- v4 constants (kept for backward compatibility) ----------

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
  CONTAINS: 'contains',
  NOT_CONTAINS: 'ncontains',

  // Existence operators
  EXISTS: 'exists',
  NOT_EXISTS: 'nexists',

  // Set operators
  IN: 'in',
  NOT_IN: 'nin',

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
  PAGE_CONVERSATIONS: 'pageConversations',
  TOTAL_CONVERSATIONS: 'totalConversations',
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
  TOOL_APPROVAL_REQUESTED: 'toolApprovalRequested',
  TOOL_APPROVAL_APPROVED: 'toolApprovalApproved',
  TOOL_APPROVAL_DENIED: 'toolApprovalDenied',
  COMPRESSION: 'compression',
  MAX_STEPS_REACHED: 'maxStepsReached',
  STREAM_LIFETIME_EXCEEDED: 'streamLifetimeExceeded',
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
  COUNT_DISTINCT: 'count_distinct',
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
  LIMIT_UNLIMITED: 10000,
  EMPTY_GROUP_BY: [],
} as const;
