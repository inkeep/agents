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
  // Agent Execution Transfer Count
  // Controls how many times an agent can transfer control to sub-agents in a single conversation turn.
  // This prevents infinite transfer loops while allowing multi-agent collaboration workflows.
  AGENT_EXECUTION_TRANSFER_COUNT_MIN: 1,
  AGENT_EXECUTION_TRANSFER_COUNT_MAX: 1000,
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT: 10,

  // Sub-Agent Turn Generation Steps
  // Limits how many AI generation steps a sub-agent can perform within a single turn.
  // Each generation step typically involves sending a prompt to the LLM and processing its response.
  // This prevents runaway token usage while allowing complex multi-step reasoning.
  SUB_AGENT_TURN_GENERATION_STEPS_MIN: 1,
  SUB_AGENT_TURN_GENERATION_STEPS_MAX: 1000,
  SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT: 12,

  // Status Update Thresholds
  // Real-time status updates are triggered when either threshold is exceeded during longer operations.
  // MAX_NUM_EVENTS: Maximum number of internal events before forcing a status update to the client.
  // MAX_INTERVAL_SECONDS: Maximum time between status updates regardless of event count.
  STATUS_UPDATE_MAX_NUM_EVENTS: 100,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS: 600, // 10 minutes

  // Prompt Text Length Validation
  // VALIDATION_AGENT_PROMPT_MAX_CHARS is the shared cap for the main system prompts:
  // both the agent-level prompt (rendered as <agent_context>) and each sub-agent's own
  // prompt (rendered as <core_instructions>). A generous ceiling that comfortably fits
  // large grounding/context documents (~200k chars ≈ ~50k tokens) while still guarding
  // against pathological input. Override via AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS.
  // NOTE: VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS (despite its name) caps the status-update
  // "custom prompt", NOT a sub-agent prompt. Renaming it is tracked as follow-up work.
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS: 2_000,
  VALIDATION_AGENT_PROMPT_MAX_CHARS: 200_000,

  // Context Fetcher HTTP Timeout
  // Maximum time allowed for HTTP requests made by Context Fetchers (e.g., CRM lookups, external API calls).
  // Context Fetchers automatically retrieve external data at the start of a conversation to enrich agent context.
  CONTEXT_FETCHER_HTTP_TIMEOUT_MS_DEFAULT: 10_000, // 10 seconds
} as const;
