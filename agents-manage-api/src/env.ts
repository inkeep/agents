import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  // Standardized naming - prefer INKEEP_AGENTS_MANAGE_API_URL
  INKEEP_AGENTS_MANAGE_API_URL: z.string().optional().default('http://localhost:3002'),
  // Legacy naming - deprecated, will be removed in a future version
  AGENTS_MANAGE_API_URL: z.string().optional().default('http://localhost:3002'),
  AGENTS_RUN_API_URL: z.string().optional().default('http://localhost:3003'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('debug'),
  NANGO_SERVER_URL: z.string().optional().default('https://api.nango.dev'),
  NANGO_SECRET_KEY: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
});

const parseEnv = () => {
  try {
    const parsedEnv = envSchema.parse(process.env);

    // Handle backward compatibility: prefer INKEEP_AGENTS_MANAGE_API_URL, fallback to AGENTS_MANAGE_API_URL
    const manageApiUrl =
      process.env.INKEEP_AGENTS_MANAGE_API_URL || process.env.AGENTS_MANAGE_API_URL || 'http://localhost:3002';

    // Warn if using deprecated variable
    if (process.env.AGENTS_MANAGE_API_URL && !process.env.INKEEP_AGENTS_MANAGE_API_URL) {
      console.warn(
        '⚠️  DEPRECATED: AGENTS_MANAGE_API_URL is deprecated. Please use INKEEP_AGENTS_MANAGE_API_URL instead. ' +
          'This will be removed in a future version.'
      );
    }

    return {
      ...parsedEnv,
      // Expose standardized name, resolving from either variable
      INKEEP_AGENTS_MANAGE_API_URL: manageApiUrl,
    };
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
