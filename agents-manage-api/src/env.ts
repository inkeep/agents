import { loadEnvironmentFiles, runtimeConsts } from '@inkeep/agents-core';
import { z } from 'zod';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  AGENTS_MANAGE_API_URL: z.string().optional().default('http://localhost:3002'),
  AGENTS_RUN_API_URL: z.string().optional().default('http://localhost:3003'),
  DB_FILE_NAME: z.string().optional(),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('debug'),
  NANGO_SERVER_URL: z.string().optional().default('https://api.nango.dev'),
  NANGO_SECRET_KEY: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
});

const parseEnv = () => {
  try {
    const parsedEnv = envSchema.parse(process.env);

    return parsedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map((issue) => issue.path.join('.'));
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(', ')}\n${error.message}`
      );
    }
    throw error;
  }
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;

/**
 * Runtime Configuration Schema for Validation Constants
 * These constants control maximum/minimum values that users can configure via manage-api.
 * They are used in validation schemas to enforce limits on user input.
 * All values are optional and default to constants defined in agents-core.
 */
const runtimeConfigSchema = z.object({
  // Sub-Agent Validation
  AGENTS_VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS: z.coerce.number().optional(),
  AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MIN: z.coerce.number().optional(),
  AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MAX: z.coerce.number().optional(),

  // Agent Validation
  AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS: z.coerce.number().optional(),
  AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MIN: z.coerce.number().optional(),
  AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MAX: z.coerce.number().optional(),

  // Status Updates
  AGENTS_STATUS_UPDATE_MAX_NUM_EVENTS: z.coerce.number().optional(),
  AGENTS_STATUS_UPDATE_MAX_INTERVAL_SECONDS: z.coerce.number().optional(),

  // Data Components
  AGENTS_DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT: z.coerce.number().optional(),

  // Pagination
  AGENTS_VALIDATION_PAGINATION_MAX_LIMIT: z.coerce.number().optional(),
  AGENTS_VALIDATION_PAGINATION_DEFAULT_LIMIT: z.coerce.number().optional(),
});

const parseRuntimeConfig = () => {
  const envOverrides = runtimeConfigSchema.parse(process.env);

  return {
    VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS:
      envOverrides.AGENTS_VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS ??
      runtimeConsts.VALIDATION_SUB_AGENT_PROMPT_MAX_CHARS,
    SUB_AGENT_TURN_GENERATION_STEPS_MIN:
      envOverrides.AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MIN ??
      runtimeConsts.SUB_AGENT_TURN_GENERATION_STEPS_MIN,
    SUB_AGENT_TURN_GENERATION_STEPS_MAX:
      envOverrides.AGENTS_SUB_AGENT_TURN_GENERATION_STEPS_MAX ??
      runtimeConsts.SUB_AGENT_TURN_GENERATION_STEPS_MAX,
    VALIDATION_AGENT_PROMPT_MAX_CHARS:
      envOverrides.AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS ??
      runtimeConsts.VALIDATION_AGENT_PROMPT_MAX_CHARS,
    AGENT_EXECUTION_TRANSFER_COUNT_MIN:
      envOverrides.AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MIN ??
      runtimeConsts.AGENT_EXECUTION_TRANSFER_COUNT_MIN,
    AGENT_EXECUTION_TRANSFER_COUNT_MAX:
      envOverrides.AGENTS_AGENT_EXECUTION_TRANSFER_COUNT_MAX ??
      runtimeConsts.AGENT_EXECUTION_TRANSFER_COUNT_MAX,
    STATUS_UPDATE_MAX_NUM_EVENTS:
      envOverrides.AGENTS_STATUS_UPDATE_MAX_NUM_EVENTS ?? runtimeConsts.STATUS_UPDATE_MAX_NUM_EVENTS,
    STATUS_UPDATE_MAX_INTERVAL_SECONDS:
      envOverrides.AGENTS_STATUS_UPDATE_MAX_INTERVAL_SECONDS ??
      runtimeConsts.STATUS_UPDATE_MAX_INTERVAL_SECONDS,
    DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT:
      envOverrides.AGENTS_DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT ??
      runtimeConsts.DATA_COMPONENT_FETCH_TIMEOUT_MS_DEFAULT,
    VALIDATION_PAGINATION_MAX_LIMIT:
      envOverrides.AGENTS_VALIDATION_PAGINATION_MAX_LIMIT ??
      runtimeConsts.VALIDATION_PAGINATION_MAX_LIMIT,
    VALIDATION_PAGINATION_DEFAULT_LIMIT:
      envOverrides.AGENTS_VALIDATION_PAGINATION_DEFAULT_LIMIT ??
      runtimeConsts.VALIDATION_PAGINATION_DEFAULT_LIMIT,
  };
};

/**
 * Runtime configuration object that merges environment variable overrides with default constants.
 * Use this instead of importing constants directly to respect environment variable overrides.
 */
export const runtimeConfig = parseRuntimeConfig();
