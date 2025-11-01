import { loadEnvironmentFiles } from '../../env';
import { z } from 'zod';
import { schemaValidationDefaults } from './defaults';

// Load all environment files using shared logic
loadEnvironmentFiles();

// Auto-generate Zod schema from schemaValidationDefaults keys
// This ensures we only define constants once in defaults.ts
const constantsSchema = z.object(
  Object.fromEntries(
    Object.keys(schemaValidationDefaults).map((key) => [`AGENTS_${key}`, z.coerce.number().optional()])
  ) as Record<string, z.ZodOptional<z.ZodNumber>>
);

const parseConstants = () => {
  const envOverrides = constantsSchema.parse(process.env);

  // Merge environment overrides with defaults
  return Object.fromEntries(
    Object.entries(schemaValidationDefaults).map(([key, defaultValue]) => [
      key,
      envOverrides[`AGENTS_${key}` as keyof typeof envOverrides] ?? defaultValue,
    ])
  ) as typeof schemaValidationDefaults;
};

const constants = parseConstants();

// Export individual constants for clean imports
export const {
  AGENT_EXECUTION_TRANSFER_COUNT_MIN,
  AGENT_EXECUTION_TRANSFER_COUNT_MAX,
  AGENT_EXECUTION_TRANSFER_COUNT_DEFAULT,
  SUB_AGENT_TURN_GENERATION_STEPS_MIN,
  SUB_AGENT_TURN_GENERATION_STEPS_MAX,
  SUB_AGENT_TURN_GENERATION_STEPS_DEFAULT,
  STATUS_UPDATE_MAX_NUM_EVENTS,
  STATUS_UPDATE_MAX_INTERVAL_SECONDS,
  VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
  VALIDATION_AGENT_PROMPT_MAX_CHARS,
  CONTEXT_FETCHER_HTTP_TIMEOUT_MS_DEFAULT,
} = constants;

// Also export the defaults for use in other packages
export { schemaValidationDefaults } from './defaults';
