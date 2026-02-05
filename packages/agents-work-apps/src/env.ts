import { z } from '@hono/zod-openapi';
import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z.object({
  // Core Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development')
    .describe('Node.js environment mode'),
  ENVIRONMENT: z
    .enum(['development', 'production', 'pentest', 'test'])
    .default('development')
    .describe('Application environment mode'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logging verbosity level'),

  // Database
  INKEEP_AGENTS_RUN_DATABASE_URL: z
    .string()
    .describe(
      'PostgreSQL connection URL for the runtime database (Doltgres with Git version control)'
    ),
  INKEEP_AGENTS_MANAGE_UI_URL: z
    .string()
    .optional()
    .describe('URL where the management UI is hosted'),

  // GitHub App Configuration
  GITHUB_APP_ID: z.string().optional().describe('GitHub App ID for GitHub integration'),
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .optional()
    .describe('GitHub App private key for authentication'),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .optional()
    .describe('Secret for validating GitHub webhook payloads'),
  GITHUB_STATE_SIGNING_SECRET: z
    .string()
    .min(32, 'GITHUB_STATE_SIGNING_SECRET must be at least 32 characters')
    .optional()
    .describe('Secret for signing GitHub OAuth state (minimum 32 characters)'),
  GITHUB_APP_NAME: z.string().optional().describe('Name of the GitHub App'),
  GITHUB_MCP_API_KEY: z.string().optional().describe('API key for the GitHub MCP'),
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
