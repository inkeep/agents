import { loadEnvironmentFiles } from '../../env';
import { z } from 'zod';
import { executionLimitsSharedDefaults } from './defaults';

// Load all environment files using shared logic
loadEnvironmentFiles();

// Auto-generate Zod schema from executionLimitsSharedDefaults keys
// This ensures we only define constants once in defaults.ts
const constantsSchema = z.object(
  Object.fromEntries(
    Object.keys(executionLimitsSharedDefaults).map((key) => [
      `AGENTS_${key}`,
      z.coerce.number().optional(),
    ])
  ) as Record<string, z.ZodOptional<z.ZodNumber>>
);

const parseConstants = () => {
  const envOverrides = constantsSchema.parse(process.env);

  // Merge environment overrides with defaults
  return Object.fromEntries(
    Object.entries(executionLimitsSharedDefaults).map(([key, defaultValue]) => [
      key,
      envOverrides[`AGENTS_${key}` as keyof typeof envOverrides] ?? defaultValue,
    ])
  ) as typeof executionLimitsSharedDefaults;
};

const constants = parseConstants();

// Export individual constants for clean imports
export const {
  MCP_TOOL_CONNECTION_TIMEOUT_MS,
  MCP_TOOL_MAX_RETRIES,
  MCP_TOOL_MAX_RECONNECTION_DELAY_MS,
  MCP_TOOL_INITIAL_RECONNECTION_DELAY_MS,
  MCP_TOOL_RECONNECTION_DELAY_GROWTH_FACTOR,
  CONVERSATION_HISTORY_MAX_OUTPUT_TOKENS_DEFAULT,
} = constants;

// Also export the defaults for use in other packages
export { executionLimitsSharedDefaults } from './defaults';
