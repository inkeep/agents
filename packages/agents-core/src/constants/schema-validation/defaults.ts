/* =============================================================================
 * Schema Validation Constants
 *
 * These constants are used in Zod validation schemas across manage-api and run-api.
 * They define maximum/minimum values and defaults that users can configure via API.
 *
 * Environment Variable Overrides:
 * All constants can be overridden via environment variables prefixed with AGENTS_.
 * The constants/schema-validation/index.ts file validates these overrides at startup.
 * If not set, constants use the default values defined below.
 *
 * Example: AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS=10000
 * ============================================================================= */

/**
 * Schema validation default constants used in Zod schemas.
 * These define limits and defaults for user-configurable values.
 */
export const schemaValidationDefaults = {
  // Agent Execution Loop Limits
  AGENT_EXECUTION_TRANSFER_COUNT_MIN: 1,
  AGENT_EXECUTION_TRANSFER_COUNT_MAX: 1000,
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT: 10,

  // Sub-Agent Turn Generation Limits
  SUB_AGENT_TURN_GENERATION_STEPS_MIN: 1,
  SUB_AGENT_TURN_GENERATION_STEPS_MAX: 1000,
  SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT: 12,

  // Status Updates Limits
  STATUS_UPDATE_MAX_NUM_EVENTS: 100,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS: 600, // 10 minutes

  // Prompt Validation Limits
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS: 2_000,
  VALIDATION_AGENT_PROMPT_MAX_CHARS: 5_000,

  // Data Component Fetching
  DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT: 10_000, // 10 seconds
} as const;
