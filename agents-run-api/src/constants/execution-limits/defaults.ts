/* =============================================================================
 * Execution Limit Constants
 *
 * These constants control agent runtime behavior during execution.
 * They are used as defaults when user configuration is null/undefined.
 *
 * Environment Variable Overrides:
 * All constants can be overridden via environment variables prefixed with AGENTS_.
 * The constants/execution-limits/index.ts file validates these overrides at startup.
 * If not set, constants use the default values defined below.
 *
 * Example: AGENTS_LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING=300000
 * ============================================================================= */

/**
 * Execution limit default constants that control runtime behavior.
 * These are used as defaults when user configuration is null/undefined.
 */
export const executionLimitsDefaults = {
  // Agent Execution Loop
  AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS: 3,
  AGENT_EXECUTION_MAX_GENERATION_STEPS: 5,

  // LLM Generation Timeouts
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING: 270_000, // 4.5 minutes
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING: 90_000, // 1.5 minutes
  LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS: 90_000, // 1.5 minutes
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS: 600_000, // 10 minutes

  // Function Tool Execution (Sandbox)
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT: 30_000, // 30 seconds
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT: 4,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS: 300_000, // 5 minutes
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT: 50,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES: 1_048_576, // 1 MB
  FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS: 30_000, // 30 seconds
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS: 60_000, // 1 minute

  // MCP Tool Execution
  MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT: 60_000, // 60 seconds
  MCP_TOOL_CONNECTION_TIMEOUT_MS: 3_000, // 3 seconds
  MCP_TOOL_MAX_RETRIES: 3,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS: 30_000, // 30 seconds
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS: 1_000, // 1 second
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR: 1.5,

  // Delegation Tool Execution
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS: 100,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS: 10_000, // 10 seconds
  DELEGATION_TOOL_BACKOFF_EXPONENT: 2,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS: 20_000, // 20 seconds

  // General A2A Communication
  A2A_BACKOFF_INITIAL_INTERVAL_MS: 500,
  A2A_BACKOFF_MAX_INTERVAL_MS: 60_000, // 1 minute
  A2A_BACKOFF_EXPONENT: 1.5,
  A2A_BACKOFF_MAX_ELAPSED_TIME_MS: 30_000, // 30 seconds

  // Artifact Processing
  ARTIFACT_GENERATION_MAX_RETRIES: 3,
  ARTIFACT_SESSION_MAX_PENDING: 100,
  ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES: 3,
  ARTIFACT_GENERATION_BACKOFF_INITIAL_MS: 1_000, // 1 second
  ARTIFACT_GENERATION_BACKOFF_MAX_MS: 10_000, // 10 seconds

  // Session & Cache Management
  SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS: 300_000, // 5 minutes
  SESSION_CLEANUP_INTERVAL_MS: 60_000, // 1 minute

  // Status Updates & Streaming
  STATUS_UPDATE_DEFAULT_NUM_EVENTS: 1,
  STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS: 2,

  // Stream Buffer Limits
  STREAM_PARSER_MAX_SNAPSHOT_SIZE: 100,
  STREAM_PARSER_MAX_STREAMED_SIZE: 1000,
  STREAM_PARSER_MAX_COLLECTED_PARTS: 10_000,
  STREAM_BUFFER_MAX_SIZE_BYTES: 5_242_880, // 5 MB
  STREAM_TEXT_GAP_THRESHOLD_MS: 2_000, // 2 seconds
  STREAM_MAX_LIFETIME_MS: 600_000, // 10 minutes

  // Conversation History
  CONVERSATION_HISTORY_DEFAULT_LIMIT: 50,
} as const;
