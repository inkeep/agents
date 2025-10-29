/* =============================================================================
 * Shared Execution Limits Constants
 *
 * These constants are used for runtime execution across both manage-api and run-api.
 * They are not used for schema validation but for actual execution behavior.
 *
 * Environment Variable Overrides:
 * All constants can be overridden via environment variables prefixed with AGENTS_.
 * The constants/execution-limits-shared/index.ts file validates these overrides at startup.
 * If not set, constants use the default values defined below.
 *
 * Example: AGENTS_MCP_TOOL_CONNECTION_TIMEOUT_MS=5000
 * ============================================================================= */

/**
 * Shared execution limit default constants used for runtime behavior across services.
 * These define limits and defaults for runtime execution, not schema validation.
 */
export const executionLimitsSharedDefaults = {
  // MCP Tool Connection and Retry Behavior
  // Model Context Protocol (MCP) enables agents to connect to external tools and services.
  // These constants control connection timeouts and retry strategy with exponential backoff.
  // CONNECTION_TIMEOUT_MS: Maximum wait time for initial MCP server connection
  // MAX_RETRIES: Maximum number of connection retry attempts before failing
  // INITIAL_RECONNECTION_DELAY_MS: Starting delay between retry attempts
  // MAX_RECONNECTION_DELAY_MS: Maximum delay between retry attempts (after exponential growth)
  // RECONNECTION_DELAY_GROWTH_FACTOR: Multiplier applied to delay after each failed retry (exponential backoff)
  MCP_TOOL_CONNECTION_TIMEOUT_MS: 3_000, // 3 seconds
  MCP_TOOL_MAX_RETRIES: 3,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS: 30_000, // 30 seconds
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS: 1_000, // 1 second
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR: 1.5,

  // Conversation History Context Window
  // Maximum number of tokens from previous conversation messages to include in the LLM prompt.
  // Prevents excessive token usage while maintaining relevant conversation context.
  // Messages exceeding this limit are truncated from the beginning of the conversation.
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT: 4_000,
} as const;
