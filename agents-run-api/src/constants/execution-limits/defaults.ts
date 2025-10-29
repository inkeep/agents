/* =============================================================================
 * Run-API Execution Limit Constants
 *
 * These constants control run-api specific runtime behavior during agent execution.
 * They are used as defaults when user configuration is null/undefined.
 *
 * Note: Constants used by both run-api and manage-api are defined in:
 * - @inkeep/agents-core/constants/schema-validation (API-level validation limits)
 * - @inkeep/agents-core/constants/execution-limits-shared (shared runtime limits)
 *
 * Environment Variable Overrides:
 * All constants can be overridden via environment variables prefixed with AGENTS_.
 * The constants/execution-limits/index.ts file validates these overrides at startup.
 * If not set, constants use the default values defined below.
 *
 * Example: AGENTS_LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING=300000
 * ============================================================================= */

/**
 * Run-API specific execution limit constants that control runtime behavior.
 * These are used as defaults when user configuration is null/undefined.
 */
export const executionLimitsDefaults = {
  // Sub Agent Turn Execution
  // During a Sub Agent's turn, it makes decisions by calling the LLM (language model). Each decision
  // point is called a "generation step" - for example, deciding to call a tool, transfer to another
  // Sub Agent, delegate a subtask, or send a response to the user.
  // AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS: Maximum errors tolerated during a single Sub Agent's turn before stopping execution
  // AGENT_EXECUTION_MAX_GENERATION_STEPS: Maximum LLM inference calls allowed within a single Sub Agent turn
  AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS: 3,
  AGENT_EXECUTION_MAX_GENERATION_STEPS: 5,

  // Sub Agent Decision-Making Timeouts
  // These control how long to wait for the LLM to make decisions during a Sub Agent's turn.
  // "First call" = initial decision at start of turn (may include tool results from previous actions)
  // "Subsequent call" = follow-up decisions after executing tools within the same turn
  // Streaming mode has longer timeout because it waits for the full streamed response to the user
  // LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING: Timeout for initial streaming response to user
  // LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING: Timeout for initial non-streaming (internal) decision
  // LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS: Timeout for follow-up decisions after tool execution
  // LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS: Maximum timeout allowed regardless of configuration
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING: 270_000, // 4.5 minutes
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING: 90_000, // 1.5 minutes
  LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS: 90_000, // 1.5 minutes
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS: 600_000, // 10 minutes

  // Function Tool Execution (Sandboxed Environments)
  // Function Tools are custom JavaScript functions that Sub Agents can call. They run in secure
  // isolated sandboxes (containerized environments) to prevent malicious code execution.
  // For performance, sandboxes are cached and reused across multiple tool calls until they expire.
  // FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT: Maximum execution time for a Function Tool call
  // FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT: Virtual CPUs allocated to each sandbox (affects compute capacity)
  // FUNCTION_TOOL_SANDBOX_POOL_TTL_MS: Time-to-live for cached sandboxes (after this, sandbox is discarded)
  // FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT: Maximum reuses of a sandbox before it's refreshed (prevents resource leaks)
  // FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES: Maximum size of Function Tool output (prevents memory exhaustion)
  // FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS: Maximum wait time for sandbox to become available when pool is full
  // FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS: How often to check for and remove expired sandboxes from the pool
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT: 30_000, // 30 seconds
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT: 4,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS: 300_000, // 5 minutes
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT: 50,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES: 1_048_576, // 1 MB
  FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS: 30_000, // 30 seconds
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS: 60_000, // 1 minute

  // MCP Tool Execution
  // MCP (Model Context Protocol) Servers are external services that provide tools to Sub Agents.
  // When a Sub Agent calls an MCP Tool, the request is sent to the external MCP Server.
  // Note: MCP connection/retry constants are defined in @inkeep/agents-core/constants/execution-limits-shared
  // MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT: Maximum wait time for an MCP tool call to complete
  MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT: 60_000, // 60 seconds

  // Sub Agent Delegation (Retry Strategy)
  // When a Sub Agent delegates a subtask to another Sub Agent, it uses the A2A (Agent-to-Agent)
  // protocol to communicate. If the delegation request fails, these constants control the
  // exponential backoff retry strategy. Formula: delay = min(INITIAL * EXPONENT^attempt, MAX)
  // DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS: Starting delay before first retry
  // DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS: Maximum delay between retries (caps exponential growth)
  // DELEGATION_TOOL_BACKOFF_EXPONENT: Multiplier applied to delay after each retry (2 = doubles each time)
  // DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS: Total time to keep retrying before giving up
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS: 100,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS: 10_000, // 10 seconds
  DELEGATION_TOOL_BACKOFF_EXPONENT: 2,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS: 20_000, // 20 seconds

  // General Agent-to-Agent (A2A) Communication (Retry Strategy)
  // These control retries for broader A2A protocol operations beyond delegation (e.g., status checks,
  // conversation updates). Uses more conservative retry parameters than delegation-specific retries.
  // A2A_BACKOFF_INITIAL_INTERVAL_MS: Starting delay before first retry
  // A2A_BACKOFF_MAX_INTERVAL_MS: Maximum delay between retries
  // A2A_BACKOFF_EXPONENT: Multiplier for exponential backoff (1.5 = grows 50% each retry)
  // A2A_BACKOFF_MAX_ELAPSED_TIME_MS: Total time to keep retrying before giving up
  A2A_BACKOFF_INITIAL_INTERVAL_MS: 500,
  A2A_BACKOFF_MAX_INTERVAL_MS: 60_000, // 1 minute
  A2A_BACKOFF_EXPONENT: 1.5,
  A2A_BACKOFF_MAX_ELAPSED_TIME_MS: 30_000, // 30 seconds

  // Artifact Processing
  // Artifacts are tool outputs saved for later reference by Sub Agents or users. When a tool generates
  // an artifact, the system automatically generates a human-readable name and description using the LLM.
  // These constants control artifact name/description generation and context window management.
  // ARTIFACT_GENERATION_MAX_RETRIES: Retry attempts for LLM-based artifact name/description generation
  // ARTIFACT_SESSION_MAX_PENDING: Maximum unprocessed artifacts in queue (prevents unbounded growth)
  // ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES: Historical artifact summaries kept in context for reference
  // ARTIFACT_GENERATION_BACKOFF_INITIAL_MS: Starting delay for retry backoff when generation fails
  // ARTIFACT_GENERATION_BACKOFF_MAX_MS: Maximum delay between retries (formula: min(INITIAL * 2^attempt, MAX))
  ARTIFACT_GENERATION_MAX_RETRIES: 3,
  ARTIFACT_SESSION_MAX_PENDING: 100,
  ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES: 3,
  ARTIFACT_GENERATION_BACKOFF_INITIAL_MS: 1_000, // 1 second
  ARTIFACT_GENERATION_BACKOFF_MAX_MS: 10_000, // 10 seconds

  // Conversation Session & Cache Management
  // A "session" represents the state of an ongoing conversation with an Agent. Tool results are cached
  // within the session for performance - this is especially important for artifact processing where the
  // same tool outputs may be referenced multiple times across Sub Agent turns.
  // SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS: How long tool results are kept in cache before expiring
  // SESSION_CLEANUP_INTERVAL_MS: How often to check for and remove expired cached tool results
  SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS: 300_000, // 5 minutes
  SESSION_CLEANUP_INTERVAL_MS: 60_000, // 1 minute

  // Status Updates
  // Status Updates are real-time progress messages sent to users during longer Sub Agent operations.
  // The system automatically generates status updates based on activity thresholds - either after a
  // certain number of significant events OR after a time interval (whichever comes first).
  // Events include: tool calls, Sub Agent transfers, delegations, or other significant activities.
  // STATUS_UPDATE_DEFAULT_NUM_EVENTS: Number of significant events before triggering a status update
  // STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS: Time interval (in seconds) before generating status update
  STATUS_UPDATE_DEFAULT_NUM_EVENTS: 1,
  STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS: 2,

  // Response Streaming (Internal Buffering Limits)
  // These are internal infrastructure limits for streaming responses to users. Streaming enables
  // real-time updates as Sub Agents generate responses, Data Components, and Status Updates.
  // STREAM_PARSER_MAX_SNAPSHOT_SIZE: Maximum Data Component snapshots buffered before clearing old ones
  // STREAM_PARSER_MAX_STREAMED_SIZE: Maximum streamed component IDs tracked simultaneously
  // STREAM_PARSER_MAX_COLLECTED_PARTS: Maximum accumulated stream parts before forcing flush
  // STREAM_BUFFER_MAX_SIZE_BYTES: Maximum total buffer size in bytes (prevents memory exhaustion)
  // STREAM_TEXT_GAP_THRESHOLD_MS: Time gap that triggers bundling text with artifact data vs separate send
  // STREAM_MAX_LIFETIME_MS: Maximum duration a stream can stay open before forced closure
  STREAM_PARSER_MAX_SNAPSHOT_SIZE: 100,
  STREAM_PARSER_MAX_STREAMED_SIZE: 1000,
  STREAM_PARSER_MAX_COLLECTED_PARTS: 10_000,
  STREAM_BUFFER_MAX_SIZE_BYTES: 5_242_880, // 5 MB
  STREAM_TEXT_GAP_THRESHOLD_MS: 2_000, // 2 seconds
  STREAM_MAX_LIFETIME_MS: 600_000, // 10 minutes

  // Conversation History Message Retrieval
  // CONVERSATION_HISTORY_DEFAULT_LIMIT: Default number of recent conversation messages to retrieve
  CONVERSATION_HISTORY_DEFAULT_LIMIT: 50,
} as const;
