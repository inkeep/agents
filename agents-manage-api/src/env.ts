import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  INKEEP_AGENTS_MANAGE_API_URL: z.string().optional().default('http://localhost:3002'),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('debug'),
  NANGO_SERVER_URL: z.string().optional().default('https://api.nango.dev'),
  NANGO_SECRET_KEY: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  TENANT_ID: z.string().optional().default('default'),
  INKEEP_AGENTS_MANAGE_UI_USERNAME: z
    .string()
    .optional()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Invalid email address',
    }),
  INKEEP_AGENTS_MANAGE_UI_PASSWORD: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 8, {
      message: 'Password must be at least 8 characters',
    }),
  DISABLE_AUTH: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
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
