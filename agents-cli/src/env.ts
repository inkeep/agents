import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  DEBUG: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_URL: z.string().optional(),
  INKEEP_AGENTS_RUN_API_URL: z.string().optional(),
  INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z.string().optional(),
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z.string().optional(),
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
