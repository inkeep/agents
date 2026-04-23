// SigNoz-specific query building constants
// Used for constructing queries against the SigNoz API

// ---------- v5 constants ----------

export const REQUEST_TYPES = {
  SCALAR: 'scalar',
  TIME_SERIES: 'time_series',
  RAW: 'raw',
  TRACE: 'trace',
} as const;

export const QUERY_TYPES = {
  BUILDER_QUERY: 'builder_query',
  BUILDER_TRACE_OPERATOR: 'builder_trace_operator',
} as const;

export const FIELD_CONTEXTS = {
  RESOURCE: 'resource',
  ATTRIBUTE: 'attribute',
  SPAN: 'span',
} as const;

export const FIELD_DATA_TYPES = {
  STRING: 'string',
  INT64: 'int64',
  FLOAT64: 'float64',
  BOOL: 'bool',
} as const;

export const SIGNALS = {
  TRACES: 'traces',
} as const;

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
  regex: 'REGEX',
  nregex: 'NOT REGEX',
  exists: 'EXISTS',
  nexists: 'NOT EXISTS',
  in: 'IN',
  nin: 'NOT IN',
};

function quoteValue(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
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

/** Query Operators */
export const OPERATORS = {
  EQUALS: '=',
  NOT_EQUALS: '!=',
  LESS_THAN: '<',
  GREATER_THAN: '>',
  LESS_THAN_OR_EQUAL: '<=',
  GREATER_THAN_OR_EQUAL: '>=',
  LIKE: 'like',
  NOT_LIKE: 'nlike',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'ncontains',
  REGEX: 'regex',
  NOT_REGEX: 'nregex',
  EXISTS: 'exists',
  NOT_EXISTS: 'nexists',
  IN: 'in',
  NOT_IN: 'nin',
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
  USER_MESSAGES: 'userMessages',
  UNIQUE_AGENTS: 'uniqueAgents',
  UNIQUE_MODELS: 'uniqueModels',
  TOOL_CALLS: 'toolCalls',
  AI_ASSISTANT_MESSAGES: 'aiAssistantMessages',
  CONTEXT_FETCHERS: 'contextFetchers',
  DURATION_SPANS: 'durationSpans',
  AGENT_GENERATIONS: 'agentGenerations',
  SPANS_WITH_ERRORS: 'spansWithErrors',
  ARTIFACT_PROCESSING: 'artifactProcessing',
  TOOL_APPROVALS: 'toolApprovals',
  CONTEXT_RESOLUTION_AND_HANDLE: 'contextResolutionAndHandle',
  AI_LLM_CALLS: 'aiLlmCalls',
  COMPRESSION: 'compression',
  MAX_STEPS_REACHED: 'maxStepsReached',
  STREAM_LIFETIME_EXCEEDED: 'streamLifetimeExceeded',
  DURABLE_TOOL_EXECUTIONS: 'durableToolExecutions',
  USAGE_EVENTS: 'usageEvents',
  AGG_TOOL_CALLS_BY_TYPE: 'aggToolCallsByType',
  AGG_AI_CALLS: 'aggAICalls',
} as const;

/** Query Order Directions */
export const ORDER_DIRECTIONS = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

/** Query Default Values */
export const QUERY_DEFAULTS = {
  STEP_INTERVAL: 60,
  DISABLED: false,
  LIMIT_UNLIMITED: 10000,
} as const;
