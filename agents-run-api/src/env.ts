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
  DATABASE_URL: z.string().optional(),
  AGENTS_RUN_API_URL: z.string().optional().default('http://localhost:3003'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('debug'),
  NANGO_SERVER_URL: z.string().optional().default('https://api.nango.dev'),
  NANGO_SECRET_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z.string().optional(),
  INKEEP_AGENTS_JWT_SIGNING_SECRET: z.string().optional(),
  OTEL_BSP_SCHEDULE_DELAY: z.coerce.number().optional().default(500),
  OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.coerce.number().optional().default(64),
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
