/* =============================================================================
 * Runtime Constants
 *
 * Centralized constants that affect agent runtime behavior including timeouts,
 * retries, limits, and constraints. These constants are used across both the
 * run-api (runtime execution) and manage-api (validation) layers.
 *
 * Environment Variable Overrides:
 * All constants can be overridden via environment variables prefixed with AGENTS_.
 * The env.ts files in manage-api and run-api validate these overrides at startup.
 * If not set, constants use the default values defined below.
 *
 * Example: AGENTS_EXECUTION_TRANSFER_COUNT_DEFAULT=20
 * ============================================================================= */

/* =============================================================================
 * Agent Execution Loop
 * Controls the outer loop managing transfers between sub-agents
 * ============================================================================= */

// Minimum number of sub-agent transfers (handoffs) allowed per execution
// Used by: API validation (StopWhen schema)
// Env: AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MIN
export const AGENT_EXECUTION_TRANSFER_COUNT_MIN = 1;

// Maximum number of sub-agent transfers (handoffs) allowed per execution
// When this limit is reached, execution stops even if task is incomplete
// Used by: executionHandler.ts outer while loop, API validation
// Env: AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MAX
export const AGENT_EXECUTION_TRANSFER_COUNT_MAX = 1000;

// Default number of transfers if not configured
// Used by: executionHandler.ts when stopWhen.transferCountIs is undefined
// Env: AGENTS_EXECUTION_TRANSFER_COUNT_DEFAULT
export const AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT = 10;

// Maximum consecutive execution errors before stopping entire execution
// Prevents infinite error loops across sub-agent activations
// Used by: executionHandler.ts error counter
// Env: AGENTS_EXECUTION_MAX_CONSECUTIVE_ERRORS
export const AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS = 3;

/* =============================================================================
 * Sub-Agent Turn Execution
 * Controls single sub-agent activation and generation loop within one turn
 * ============================================================================= */

// Minimum number of LLM generation steps within a single sub-agent turn
// Used by: API validation (StopWhen schema)
// Env: AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MIN
export const SUB_AGENT_TURN_GENERATION_STEPS_MIN = 1;

// Maximum number of LLM generation steps within a single sub-agent turn
// Each "step" is one LLM generate() call that may produce tool calls
// Used by: API validation, Agent.ts maxSteps parameter in streamText()
// Env: AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MAX
export const SUB_AGENT_TURN_GENERATION_STEPS_MAX = 1000;

// Default maximum generation steps if not configured via stopWhen.stepCountIs
// Used by: Agent.ts getMaxGenerationSteps() method
// Env: AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT
export const SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT = 12;

/* =============================================================================
 * LLM Generation Timeouts
 * Controls timeouts for individual LLM API calls within a sub-agent turn
 * ============================================================================= */

// Timeout for the FIRST LLM generation call in streaming mode
// First call typically takes longer as model loads context
// Used by: Agent.ts Phase 1 streaming streamText() calls
// Env: AGENTS_LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING
export const LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING = 270_000; // 4.5 minutes

// Timeout for the FIRST LLM generation call in non-streaming mode
// Used by: Agent.ts Phase 1 non-streaming streamText() calls
// Env: AGENTS_LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING
export const LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING = 90_000; // 1.5 minutes

// Timeout for SUBSEQUENT LLM generation calls (after first in a turn)
// Applies to both streaming and non-streaming follow-up calls
// Used by: Agent.ts Phase 2 streamText() calls
// Env: AGENTS_LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS
export const LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS = 90_000; // 1.5 minutes

// Hard ceiling timeout for ANY single LLM generation call
// No generation call can exceed this regardless of configuration
// Used by: Agent.ts to cap user-configured timeouts
// Env: AGENTS_LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS
export const LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS = 600_000; // 10 minutes

/* =============================================================================
 * Function Tool Execution (Sandbox)
 * Controls execution limits for function tools running in isolated sandboxes
 * ============================================================================= */

// Default timeout for function tool execution in sandbox
// Can be overridden via sandboxConfig in API request
// Used by: Agent.ts default sandbox configuration
// Env: AGENTS_FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT
export const FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT = 30_000; // 30 seconds

// Default number of virtual CPUs allocated to sandbox
// Used by: Agent.ts default sandbox configuration
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT
export const FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT = 4;

// Time-to-live for sandbox instances in pool before forced recycling
// Prevents memory leaks from long-lived sandboxes
// Used by: NativeSandboxExecutor.ts pool management
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_POOL_TTL_MS
export const FUNCTION_TOOL_SANDBOX_POOL_TTL_MS = 300_000; // 5 minutes

// Maximum number of executions before sandbox is recycled
// Prevents state accumulation across multiple tool calls
// Used by: NativeSandboxExecutor.ts pool management
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT
export const FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT = 50;

// Maximum output size from function tool execution
// Prevents memory exhaustion from unbounded tool outputs
// Used by: NativeSandboxExecutor.ts output capture
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES
export const FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES = 1_048_576; // 1 MB

// Maximum time to wait for available sandbox from pool
// Prevents indefinite blocking when pool is exhausted
// Used by: NativeSandboxExecutor.ts queue management
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS
export const FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS = 30_000; // 30 seconds

// Interval for running cleanup of expired sandboxes in pool
// Background job frequency for sandbox pool maintenance
// Used by: NativeSandboxExecutor.ts setInterval for cleanup
// Env: AGENTS_FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS
export const FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS = 60_000; // 1 minute

/* =============================================================================
 * MCP Tool Execution
 * Controls timeouts and connection settings for MCP (Model Context Protocol) tools
 * ============================================================================= */

// Default timeout for MCP tool requests (from MCP SDK)
// Can be overridden in MCP client configuration
// Used by: mcp-client.ts request timeout
// Env: AGENTS_MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT
export const MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT = 60_000; // 60 seconds

// Timeout for initial MCP client connection
// Time allowed for establishing connection before error
// Used by: mcp-client.ts connect() call
// Env: AGENTS_MCP_TOOL_CONNECTION_TIMEOUT_MS
export const MCP_TOOL_CONNECTION_TIMEOUT_MS = 3_000; // 3 seconds

// Maximum retry attempts for failed MCP operations
// Used by: mcp-client.ts reconnection logic
// Env: AGENTS_MCP_TOOL_MAX_RETRIES
export const MCP_TOOL_MAX_RETRIES = 3;

// Maximum delay between MCP reconnection attempts
// Caps exponential backoff to prevent excessive waits
// Used by: mcp-client.ts reconnection backoff
// Env: AGENTS_MCP_TOOL_MAX_RECONNECTION_DELAY_MS
export const MCP_TOOL_MAX_RECONNECTION_DELAY_MS = 30_000; // 30 seconds

// Initial delay for first MCP reconnection attempt
// Used by: mcp-client.ts reconnection backoff
// Env: AGENTS_MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS
export const MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS = 1_000; // 1 second

// Multiplier for exponential backoff on MCP reconnections
// Used by: mcp-client.ts reconnection backoff calculation
// Env: AGENTS_MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR
export const MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR = 1.5;

/* =============================================================================
 * Delegation Tool Execution (Agent-to-Agent Communication)
 * Controls retry/timeout for delegate_to_* tool calls (A2A within sub-agent turn)
 * Delegation = Sub-agent A asks B to do work and waits for response (not a transfer)
 * ============================================================================= */

// Initial retry delay for delegate tool A2A HTTP requests
// More aggressive than general A2A (100ms vs 500ms) for faster in-turn responses
// Used by: relationTools.ts createDelegateToAgentTool retry config
// Env: AGENTS_DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS
export const DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS = 100;

// Maximum retry delay for delegate tool A2A HTTP requests
// Used by: relationTools.ts createDelegateToAgentTool retry config
// Env: AGENTS_DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS
export const DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS = 10_000; // 10 seconds

// Exponential backoff multiplier for delegation retries
// Used by: relationTools.ts createDelegateToAgentTool retry config
// Env: AGENTS_DELEGATION_TOOL_BACKOFF_EXPONENT
export const DELEGATION_TOOL_BACKOFF_EXPONENT = 2;

// Total maximum time for delegate tool retries before giving up
// Shorter than general A2A (20s vs 30s) to avoid blocking sub-agent turn
// Used by: relationTools.ts createDelegateToAgentTool retry config
// Env: AGENTS_DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS
export const DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS = 20_000; // 20 seconds

/* =============================================================================
 * General Agent-to-Agent (A2A) Communication
 * Controls retry/backoff for general A2A HTTP communication (transfers, etc.)
 * ============================================================================= */

// Initial retry delay for general A2A HTTP requests
// Used by: a2a/client.ts default backoff config
// Env: AGENTS_A2A_BACKOFF_INITIAL_INTERVAL_MS
export const A2A_BACKOFF_INITIAL_INTERVAL_MS = 500;

// Maximum retry delay for general A2A HTTP requests
// Caps exponential backoff to prevent excessive waits
// Used by: a2a/client.ts default backoff config
// Env: AGENTS_A2A_BACKOFF_MAX_INTERVAL_MS
export const A2A_BACKOFF_MAX_INTERVAL_MS = 60_000; // 1 minute

// Exponential backoff multiplier for general A2A retries
// Used by: a2a/client.ts default backoff config
// Env: AGENTS_A2A_BACKOFF_EXPONENT
export const A2A_BACKOFF_EXPONENT = 1.5;

// Total maximum time for general A2A retries before giving up
// Used by: a2a/client.ts default backoff config
// Env: AGENTS_A2A_BACKOFF_MAX_ELAPSED_TIME_MS
export const A2A_BACKOFF_MAX_ELAPSED_TIME_MS = 30_000; // 30 seconds

// HTTP status codes that trigger A2A request retry
// Covers rate limits and server errors
// Used by: a2a/client.ts retry logic
export const A2A_RETRY_STATUS_CODES = ['429', '500', '502', '503', '504'] as const;

/* =============================================================================
 * Artifact Processing
 * Controls async artifact generation/processing within agent sessions
 * Artifacts = UI components generated by agents (e.g., charts, code editors)
 * ============================================================================= */

// Maximum retry attempts for failed artifact generation
// Used by: AgentSession.ts artifact processing, artifact generation calls
// Env: AGENTS_ARTIFACT_GENERATION_MAX_RETRIES
export const ARTIFACT_GENERATION_MAX_RETRIES = 3;

// Maximum number of pending artifacts in session queue
// Prevents unbounded memory growth from artifact backlog
// Used by: AgentSession.ts pendingArtifacts set size check
// Env: AGENTS_ARTIFACT_SESSION_MAX_PENDING
export const ARTIFACT_SESSION_MAX_PENDING = 100;

// Maximum number of previous artifact summaries retained in context
// Used by: AgentSession.ts previousSummaries array trimming
// Env: AGENTS_ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES
export const ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES = 3;

// Initial backoff delay for artifact generation retries
// Used by: AgentSession.ts artifact generation retry backoff calculation
// Env: AGENTS_ARTIFACT_GENERATION_BACKOFF_INITIAL_MS
export const ARTIFACT_GENERATION_BACKOFF_INITIAL_MS = 1_000; // 1 second

// Maximum backoff delay for artifact generation retries
// Caps exponential backoff to prevent excessive waits
// Used by: AgentSession.ts artifact generation retry backoff
// Env: AGENTS_ARTIFACT_GENERATION_BACKOFF_MAX_MS
export const ARTIFACT_GENERATION_BACKOFF_MAX_MS = 10_000; // 10 seconds

/* =============================================================================
 * Session & Cache Management
 * Controls session state, tool result caching, and cleanup timeouts
 * ============================================================================= */

// Timeout for tool result cache cleanup (NOT execution time limit)
// Only affects how long tool results are cached for artifact processing
// Does NOT limit overall agent execution time
// Used by: ToolSessionManager.ts cache expiration
// Env: AGENTS_SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS
export const SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS = 300_000; // 5 minutes

// Interval for running cleanup of expired tool sessions
// Background job frequency for cache maintenance
// Used by: ToolSessionManager.ts setInterval for cleanup
// Env: AGENTS_SESSION_CLEANUP_INTERVAL_MS
export const SESSION_CLEANUP_INTERVAL_MS = 60_000; // 1 minute

/* =============================================================================
 * Status Updates & Streaming
 * Controls frequency and batching of status updates sent to clients
 * ============================================================================= */

// Default number of events to batch before sending status update
// Lower = more frequent updates, higher = less network overhead
// Used by: AgentSession.ts status update config defaults
// Env: AGENTS_STATUS_UPDATE_DEFAULT_NUM_EVENTS
export const STATUS_UPDATE_DEFAULT_NUM_EVENTS = 1;

// Default time interval (seconds) between status updates
// Used by: AgentSession.ts status update config defaults
// Env: AGENTS_STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS
export const STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS = 2;

// Maximum number of events that can be batched for status updates
// Used by: validation/schemas.ts StatusUpdateSchema
// Env: AGENTS_STATUS_UPDATE_MAX_NUM_EVENTS
export const STATUS_UPDATE_MAX_NUM_EVENTS = 100;

// Maximum time interval (seconds) for status updates
// Used by: validation/schemas.ts StatusUpdateSchema
// Env: AGENTS_STATUS_UPDATE_MAX_INTERVAL_SECONDS
export const STATUS_UPDATE_MAX_INTERVAL_SECONDS = 600; // 10 minutes

/* =============================================================================
 * Stream Buffer Limits
 * Controls memory and size limits for buffering streaming LLM responses
 * ============================================================================= */

// Maximum number of content items in stream snapshot
// Prevents memory bloat from accumulating too many content pieces
// Used by: IncrementalStreamParser.ts snapshot size limiting
// Env: AGENTS_STREAM_PARSER_MAX_SNAPSHOT_SIZE
export const STREAM_PARSER_MAX_SNAPSHOT_SIZE = 100;

// Maximum number of content items tracked across stream
// Used by: IncrementalStreamParser.ts streamed content limiting
// Env: AGENTS_STREAM_PARSER_MAX_STREAMED_SIZE
export const STREAM_PARSER_MAX_STREAMED_SIZE = 1000;

// Maximum number of collected content parts in parser
// Used by: IncrementalStreamParser.ts collected parts limiting
// Env: AGENTS_STREAM_PARSER_MAX_COLLECTED_PARTS
export const STREAM_PARSER_MAX_COLLECTED_PARTS = 10_000;

// Maximum buffer size for text streaming before forcing flush
// Prevents excessive memory usage from large text accumulation
// Used by: stream-helpers.ts buffer management
// Env: AGENTS_STREAM_BUFFER_MAX_SIZE_BYTES
export const STREAM_BUFFER_MAX_SIZE_BYTES = 5_242_880; // 5 MB

// Time gap threshold for flushing text chunks in stream
// If no new text for this duration, flush accumulated buffer
// Used by: stream-helpers.ts text gap detection
// Env: AGENTS_STREAM_TEXT_GAP_THRESHOLD_MS
export const STREAM_TEXT_GAP_THRESHOLD_MS = 2_000; // 2 seconds

// Maximum lifetime for stream before forced termination
// Prevents indefinitely hanging streams
// Used by: stream-helpers.ts stream lifetime management
// Env: AGENTS_STREAM_MAX_LIFETIME_MS
export const STREAM_MAX_LIFETIME_MS = 600_000; // 10 minutes

/* =============================================================================
 * API Validation Limits
 * Hard limits enforced by manage-api validation schemas
 * Applied at API layer before execution begins
 * ============================================================================= */

// Maximum character limit for sub-agent system prompts
// Used by: validation/schemas.ts SubAgentApiInsert schema
// Env: AGENTS_VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS
export const VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS = 2_000;

// Maximum character limit for agent-level system prompts
// Used by: validation/schemas.ts AgentApiUpdate schema
// Env: AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS
export const VALIDATION_AGENT_PROMPT_MAX_CHARS = 5_000;

// Maximum results per page for paginated API endpoints
// Used by: validation/schemas.ts pagination schemas
// Env: AGENTS_VALIDATION_PAGINATION_MAX_LIMIT
export const VALIDATION_PAGINATION_MAX_LIMIT = 100;

// Default page size when limit not specified in pagination
// Used by: validation/schemas.ts pagination schemas
// Env: AGENTS_VALIDATION_PAGINATION_DEFAULT_LIMIT
export const VALIDATION_PAGINATION_DEFAULT_LIMIT = 50;

/* =============================================================================
 * Data Component & Context Fetching
 * Limits for fetching external data during agent execution
 * ============================================================================= */

// Default timeout for data component HTTP fetch requests
// Used by: validation/schemas.ts FetchConfig schema
// Env: AGENTS_DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT
export const DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT = 10_000; // 10 seconds

/* =============================================================================
 * Conversation History
 * Limits for retrieving conversation history context
 * ============================================================================= */

// Default limit for conversation history retrieval
// Controls how many messages are fetched when no limit specified
// Used by: conversations.ts getUserFacingHistory default parameter
// Env: AGENTS_CONVERSATION_HISTORY_DEFAULT_LIMIT
export const CONVERSATION_HISTORY_DEFAULT_LIMIT = 50;

/* =============================================================================
 * Bundled Runtime Constants
 * All runtime constants bundled into a single object for cleaner imports
 * ============================================================================= */

/**
 * Bundled runtime constants object for cleaner imports.
 * Import this instead of individual constants for less verbose code.
 *
 * Example:
 *   import { runtimeConsts } from '@inkeep/agents-core';
 *   const timeout = runtimeConsts.AGENT_EXECUTION_TIMEOUT_MS;
 */
export const runtimeConsts = {
  // Agent Execution Loop
  AGENT_EXECUTION_TRANSFER_COUNT_MIN,
  AGENT_EXECUTION_TRANSFER_COUNT_MAX,
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT,
  AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS,

  // Sub-Agent Turn Execution
  SUB_AGENT_TURN_GENERATION_STEPS_MIN,
  SUB_AGENT_TURN_GENERATION_STEPS_MAX,
  SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT,

  // LLM Generation Timeouts
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING,
  LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS,
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,

  // Function Tool Execution (Sandbox)
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES,
  FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS,
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,

  // MCP Tool Execution
  MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT,
  MCP_TOOL_CONNECTION_TIMEOUT_MS,
  MCP_TOOL_MAX_RETRIES,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS,
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS,
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR,

  // Delegation Tool Execution
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_EXPONENT,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,

  // General A2A Communication
  A2A_BACKOFF_INITIAL_INTERVAL_MS,
  A2A_BACKOFF_MAX_INTERVAL_MS,
  A2A_BACKOFF_EXPONENT,
  A2A_BACKOFF_MAX_ELAPSED_TIME_MS,
  A2A_RETRY_STATUS_CODES,

  // Artifact Processing
  ARTIFACT_GENERATION_MAX_RETRIES,
  ARTIFACT_SESSION_MAX_PENDING,
  ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES,
  ARTIFACT_GENERATION_BACKOFF_INITIAL_MS,
  ARTIFACT_GENERATION_BACKOFF_MAX_MS,

  // Session & Cache Management
  SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,

  // Status Updates & Streaming
  STATUS_UPDATE_DEFAULT_NUM_EVENTS,
  STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS,
  STATUS_UPDATE_MAX_NUM_EVENTS,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS,

  // Stream Buffer Limits
  STREAM_PARSER_MAX_SNAPSHOT_SIZE,
  STREAM_PARSER_MAX_STREAMED_SIZE,
  STREAM_PARSER_MAX_COLLECTED_PARTS,
  STREAM_BUFFER_MAX_SIZE_BYTES,
  STREAM_TEXT_GAP_THRESHOLD_MS,
  STREAM_MAX_LIFETIME_MS,

  // API Validation Limits
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_PAGINATION_MAX_LIMIT,
  VALIDATION_PAGINATION_DEFAULT_LIMIT,

  // Data Component & Context Fetching
  DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT,

  // Conversation History
  CONVERSATION_HISTORY_DEFAULT_LIMIT,
};
