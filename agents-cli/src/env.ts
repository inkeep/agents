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

const envSchema: z.ZodType<Env> = z.object({
  // Debug Configuration
  DEBUG: z.string().optional().describe('Enable debug mode for verbose logging'),

  // AI Provider API Keys (loaded from .env files relative to where CLI is executed)
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .describe('Anthropic API key for Claude models. Get from https://console.anthropic.com/'),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .describe('OpenAI API key for GPT models. Get from https://platform.openai.com/'),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .optional()
    .describe('Google Generative AI API key for Gemini models'),

  // Langfuse Configuration (LLM observability)
  LANGFUSE_SECRET_KEY: z.string().optional().describe('Langfuse secret key for LLM observability'),
  LANGFUSE_PUBLIC_KEY: z.string().optional().describe('Langfuse public key for LLM observability'),
  LANGFUSE_BASEURL: z
    .string()
    .optional()
    .default('https://cloud.langfuse.com')
    .describe('Langfuse server base URL'),
  LANGFUSE_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .describe('Enable Langfuse LLM observability (set to "true" to enable)'),
});

const parseEnv = (): Env => {
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

export const env: Env = parseEnv();

export interface Env {
  DEBUG?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_BASEURL: string;
  LANGFUSE_ENABLED: boolean;
}
