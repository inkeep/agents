import { z } from '@hono/zod-openapi';
import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  INKEEP_AGENTS_MANAGE_DATABASE_URL: z.string(),
  INKEEP_AGENTS_RUN_DATABASE_URL: z.string(),
  INKEEP_AGENTS_MANAGE_UI_URL: z.string().optional(),
  INKEEP_AGENTS_API_URL: z.string().optional(),

  INKEEP_AGENTS_API_BYPASS_SECRET: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),

  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z.string().optional(),

  INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: z.string().optional(),
  INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY: z.string().optional(),

  NANGO_SERVER_URL: z.string().optional().default('https://api.nango.dev'),
  NANGO_SECRET_KEY: z.string().optional(),

  OTEL_BSP_SCHEDULE_DELAY: z.coerce.number().optional().default(500),
  OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.coerce.number().optional().default(64),

  DISABLE_AUTH: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  
  TENANT_ID: z.string().optional().default('default'),

  SIGNOZ_URL: z.string().optional(),
  SIGNOZ_API_KEY: z.string().optional(),
  PUBLIC_SIGNOZ_URL: z.string().optional(),
});


const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
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
