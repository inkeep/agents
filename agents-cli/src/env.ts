import { loadEnvironmentFiles } from '@inkeep/agents-core';
import { z } from 'zod';

// Load environment files to get secrets (API keys, bypass tokens)
// These files are loaded from:
// 1. Current directory .env (where the CLI command is run)
// 2. Parent directories .env (searching upwards)
// 3. ~/.inkeep/config (user global config)
//
// NOTE: We load these for secrets, but the CLI will IGNORE the URL configuration
// values (INKEEP_AGENTS_MANAGE_API_URL, INKEEP_AGENTS_RUN_API_URL) from .env files.
// URL configuration should only come from inkeep.config.ts or CLI flags.
loadEnvironmentFiles();

const envSchema = z.object({
  DEBUG: z.string().optional(),
  // Secrets loaded from .env files (relative to where CLI is executed)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
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
