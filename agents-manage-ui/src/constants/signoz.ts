export const SPAN_NAMES = {
	AI_TOOL_CALL: "ai.toolCall",
	CONTEXT_RESOLUTION:
		"context-resolver.resolve_single_fetch_definition",
	CONTEXT_HANDLE: "context.handle_context_resolution",
	AGENT_GENERATION: "agent.generate",
	CONTEXT_FETCHER: "context-fetcher.http-request",
} as const;

export const AI_OPERATIONS = {
	GENERATE_TEXT: "ai.generateText.doGenerate",
	STREAM_TEXT: "ai.streamText.doStream",
} as const;

/** SigNoz span attribute keys used in queries */
export const SPAN_KEYS = {
	// Core span attributes
	SPAN_ID: "spanID",
	TRACE_ID: "traceID",
	DURATION_NANO: "durationNano",
	TIMESTAMP: "timestamp",
	HAS_ERROR: "hasError",
	STATUS_MESSAGE: "status_message",
	OTEL_STATUS_DESCRIPTION: "otel.status_description",

	// Graph attributes
	GRAPH_ID: "graph.id",
	GRAPH_NAME: "graph.name",
	TENANT_ID: "tenant.id",
	PROJECT_ID: "project.id",

	// AI/Agent attributes
	AI_AGENT_NAME: "ai.agentName",
	AI_AGENT_NAME_ALT: "ai.agent.name",
	AI_OPERATION_ID: "ai.operationId",
	AI_RESPONSE_TIMESTAMP: "ai.response.timestamp",
	AI_RESPONSE_CONTENT: "ai.response.content",
	AI_RESPONSE_TEXT: "ai.response.text",
	AI_RESPONSE_MODEL: "ai.response.model",
	AI_MODEL_PROVIDER: "ai.model.provider",
	AI_TELEMETRY_FUNCTION_ID: "ai.telemetry.functionId",
	AI_MODEL_ID: "ai.model.id",

	// Tool attributes
	AI_TOOL_CALL_NAME: "ai.toolCall.name",
	AI_TOOL_CALL_RESULT: "ai.toolCall.result",
	AI_TOOL_CALL_ARGS: "ai.toolCall.args",
	AI_TOOL_CALL_ID: "ai.toolCall.id",
	AI_TOOL_TYPE: "ai.toolType",
	TOOL_PURPOSE: "tool.purpose",

	// Agent attributes
	AGENT_ID: "agent.id",
	AGENT_NAME: "agent.name",

	// Token usage
	GEN_AI_USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
	GEN_AI_USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",

	// Context attributes
	CONTEXT_URL: "context.url",
	CONTEXT_CONFIG_ID: "context.context_config_id",
	CONTEXT_AGENT_GRAPH_ID: "context.agent_graph_id",
	CONTEXT_REQUEST_KEYS: "context.request_context_keys",

	// Message attributes
	MESSAGE_CONTENT: "message.content",
	MESSAGE_TIMESTAMP: "message.timestamp",
	MCP_TOOL_DESCRIPTION: "mcp.tool.description",

	// Delegation/Transfer attributes
	DELEGATION_FROM_AGENT_ID: "delegation.from_agent_id",
	DELEGATION_TO_AGENT_ID: "delegation.to_agent_id",
	TRANSFER_FROM_AGENT_ID: "transfer.from_agent_id",
	TRANSFER_TO_AGENT_ID: "transfer.to_agent_id",

	// HTTP attributes
	HTTP_URL: "http.url",
	HTTP_STATUS_CODE: "http.status_code",
	HTTP_RESPONSE_BODY_SIZE: "http.response.body_size",

	// Core attributes
	NAME: "name",
	PARENT_SPAN_ID: "parentSpanID",
	CONVERSATION_ID: "conversation.id",
} as const;

/** SigNoz query data types */
export const DATA_TYPES = {
	STRING: "string",
	INT64: "int64",
	FLOAT64: "float64",
	BOOL: "bool",
} as const;

/** SigNoz query field types */
export const FIELD_TYPES = {
	TAG: "tag",
	RESOURCE: "resource",
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

export const UNKNOWN_VALUE = "unknown" as const;

/** Activity Types */
export const ACTIVITY_TYPES = {
	TOOL_CALL: "tool_call",
	AI_GENERATION: "ai_generation",
	CONTEXT_FETCH: "context_fetch",
	CONTEXT_RESOLUTION: "context_resolution",
	USER_MESSAGE: "user_message",
	AI_ASSISTANT_MESSAGE: "ai_assistant_message",
	AI_MODEL_STREAMED_TEXT: "ai_model_streamed_text",
} as const;

/** Activity Status Values */
export const ACTIVITY_STATUS = {
	SUCCESS: "success",
	ERROR: "error",
	PENDING: "pending",
} as const;

/** Agent IDs */
export const AGENT_IDS = {
	USER: "user",
	AI_ASSISTANT: "ai-assistant",
} as const;

/** Activity Names */
export const ACTIVITY_NAMES = {
	CONTEXT_FETCH: "Context Fetch",
	USER_MESSAGE: "User Message",
	AI_ASSISTANT_MESSAGE: "AI Assistant Message",
	AI_TEXT_GENERATION: "AI Text Generation",
	AI_STREAMING_TEXT: "AI Streaming Text",
	UNKNOWN_AGENT: "Unknown Agent",
	USER: "User",
} as const;

/** Tool Names */
export const TOOL_NAMES = {
	SAVE_TOOL_RESULT: "save_tool_result",
} as const;

/** AI Tool Types */
export const AI_TOOL_TYPES = {
	MCP: "mcp",
	TRANSFER: "transfer",
	DELEGATION: "delegation",
} as const;

/** Query Operators */
export const OPERATORS = {
	// Comparison operators
	EQUALS: "=",
	NOT_EQUALS: "!=",
	LESS_THAN: "<",
	GREATER_THAN: ">",
	LESS_THAN_OR_EQUAL: "<=",
	GREATER_THAN_OR_EQUAL: ">=",

	// String operators
	LIKE: "like",
	NOT_LIKE: "nlike",

	// Existence operators
	EXISTS: "exists",
	NOT_EXISTS: "nexists",

	// Logical operators
	AND: "AND",
	OR: "OR",
} as const;

/** Query Expressions */
export const QUERY_EXPRESSIONS = {
	SPAN_NAMES: "spanNames",
	AGENT_MODEL_CALLS: "agentModelCalls",
	MODEL_CALLS: "modelCalls",
	LAST_ACTIVITY: "lastActivity",
	CONVERSATION_METADATA: "conversationMetadata",
	FILTERED_CONVERSATIONS: "filteredConversations",
	TOOLS: "tools",
	TRANSFERS: "transfers",
	DELEGATIONS: "delegations",
	AI_CALLS: "aiCalls",
	CONTEXT_ERRORS: "contextErrors",
	AGENT_GENERATION_ERRORS: "agentGenerationErrors",
	USER_MESSAGES: "userMessages",
	UNIQUE_GRAPHS: "uniqueGraphs",
	UNIQUE_MODELS: "uniqueModels",
	// Route-specific query names
	TOOL_CALLS: "toolCalls",
	CONTEXT_RESOLUTION: "contextResolution",
	CONTEXT_HANDLE: "contextHandle",
	AI_ASSISTANT_MESSAGES: "aiAssistantMessages",
	AI_GENERATIONS: "aiGenerations",
	AI_STREAMING_TEXT: "aiStreamingText",
	CONTEXT_FETCHERS: "contextFetchers",
	DURATION_SPANS: "durationSpans",
} as const;

/** Query Reduce Operations */
export const REDUCE_OPERATIONS = {
	SUM: "sum",
	MAX: "max",
	MIN: "min",
	AVG: "avg",
	COUNT: "count",
} as const;

/** Query Order Directions */
export const ORDER_DIRECTIONS = {
	ASC: "asc",
	DESC: "desc",
} as const;

/** Query Types */
export const QUERY_TYPES = {
	BUILDER: "builder",
	CLICKHOUSE: "clickhouse",
	PROMQL: "promql",
} as const;

/** Panel Types */
export const PANEL_TYPES = {
	LIST: "list",
	TABLE: "table",
	GRAPH: "graph",
	VALUE: "value",
} as const;

/** Query Data Sources */
export const DATA_SOURCES = {
	TRACES: "traces",
	METRICS: "metrics",
	LOGS: "logs",
} as const;

/** Aggregate Operators */
export const AGGREGATE_OPERATORS = {
	COUNT: "count",
	SUM: "sum",
	AVG: "avg",
	MIN: "min",
	MAX: "max",
	NOOP: "noop",
} as const;

/** Query Default Values */
export const QUERY_DEFAULTS = {
	STEP: 60,
	STEP_INTERVAL: 60,
	OFFSET: 0,
	DISABLED: false,
	HAVING: [],
	LEGEND: "",
	LIMIT_NULL: null,
	LIMIT_ZERO: 0,
	LIMIT_1000: 1000,
	EMPTY_GROUP_BY: [],
} as const;
