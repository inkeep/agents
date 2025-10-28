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
  // MCP Tool Execution (used by mcp-client.ts in agents-core for runtime connection behavior)
  MCP_TOOL_CONNECTION_TIMEOUT_MS: 3_000, // 3 seconds
  MCP_TOOL_MAX_RETRIES: 3,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS: 30_000, // 30 seconds
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS: 1_000, // 1 second
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR: 1.5,

  // Conversation History (used by both manage-api and run-api for conversation context management)
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT: 4_000, // Maximum tokens for conversation history context
} as const;
