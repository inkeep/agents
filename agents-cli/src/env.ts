import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  ENVIRONMENT: z
    .enum(['development', 'production', 'pentest', 'test'])
    .optional()
    .default('development'),
  DEBUG: z.string().optional(),
  TSX_RUNNING: z.string().optional(),
  DB_FILE_NAME: z.string().optional(),
  INKEEP_ENV: z.string().optional(),
  INKEEP_API_URL: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_URL: z.string().optional(),
  INKEEP_AGENTS_RUN_API_URL: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('info'),
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