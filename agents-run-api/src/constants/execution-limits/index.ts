import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';
import { executionLimitsDefaults } from './defaults';

// Load all environment files using shared logic
loadEnvironmentFiles();

// Auto-generate Zod schema from executionLimitsDefaults keys
// This ensures we only define constants once in defaults.ts
const constantsSchema = z.object(
  Object.fromEntries(
    Object.keys(executionLimitsDefaults).map((key) => [`AGENTS_${key}`, z.coerce.number().optional()])
  ) as Record<string, z.ZodOptional<z.ZodNumber>>
);

const parseConstants = () => {
  const envOverrides = constantsSchema.parse(process.env);

  // Merge environment overrides with defaults
  return Object.fromEntries(
    Object.entries(executionLimitsDefaults).map(([key, defaultValue]) => [
      key,
      envOverrides[`AGENTS_${key}` as keyof typeof envOverrides] ?? defaultValue,
    ])
  ) as typeof executionLimitsDefaults;
};

const constants = parseConstants();

// Export individual constants for clean imports
export const {
  AGENT_EXECUTION_MAX_CONSECUTIVE_ERRORS,
  AGENT_EXECUTION_MAX_GENERATION_STEPS,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_STREAMING,
  LLM_GENERATION_FIRST_CALL_TIMEOUT_MS_NON_STREAMING,
  LLM_GENERATION_SUBSEQUENT_CALL_TIMEOUT_MS,
  LLM_GENERATION_MAX_ALLOWED_TIMEOUT_MS,
  FUNCTION_TOOL_EXECUTION_TIMEOUT_MS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_VCPUS_DEFAULT,
  FUNCTION_TOOL_SANDBOX_POOL_TTL_MS,
  FUNCTION_TOOL_SANDBOX_MAX_USE_COUNT,
  FUNCTION_TOOL_SANDBOX_MAX_OUTPUT_SIZE_BYTES,
  FUNCTION_TOOL_SANDBOX_QUEUE_WAIT_TIMEOUT_MS,
  FUNCTION_TOOL_SANDBOX_CLEANUP_INTERVAL_MS,
  MCP_TOOL_REQUEST_TIMEOUT_MS_DEFAULT,
  DELEGATION_TOOL_BACKOFF_INITIAL_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_MAX_INTERVAL_MS,
  DELEGATION_TOOL_BACKOFF_EXPONENT,
  DELEGATION_TOOL_BACKOFF_MAX_ELAPSED_TIME_MS,
  A2A_BACKOFF_INITIAL_INTERVAL_MS,
  A2A_BACKOFF_MAX_INTERVAL_MS,
  A2A_BACKOFF_EXPONENT,
  A2A_BACKOFF_MAX_ELAPSED_TIME_MS,
  ARTIFACT_GENERATION_MAX_RETRIES,
  ARTIFACT_SESSION_MAX_PENDING,
  ARTIFACT_SESSION_MAX_PREVIOUS_SUMMARIES,
  ARTIFACT_GENERATION_BACKOFF_INITIAL_MS,
  ARTIFACT_GENERATION_BACKOFF_MAX_MS,
  SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  STATUS_UPDATE_DEFAULT_NUM_EVENTS,
  STATUS_UPDATE_DEFAULT_INTERVAL_SECONDS,
  STREAM_PARSER_MAX_SNAPSHOT_SIZE,
  STREAM_PARSER_MAX_STREAMED_SIZE,
  STREAM_PARSER_MAX_COLLECTED_PARTS,
  STREAM_BUFFER_MAX_SIZE_BYTES,
  STREAM_TEXT_GAP_THRESHOLD_MS,
  STREAM_MAX_LIFETIME_MS,
  CONVERSATION_HISTORY_DEFAULT_LIMIT,
} = constants;

// Also export the defaults for potential use elsewhere
export { executionLimitsDefaults } from './defaults';
