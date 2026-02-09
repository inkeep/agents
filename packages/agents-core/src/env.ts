import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from '@hono/zod-openapi';
import dotenv from 'dotenv'; // Still needed for parsing additional config files
import { expand } from 'dotenv-expand';
import { findUpSync } from 'find-up';

export const loadEnvironmentFiles = () => {
  // Define files in priority order (highest to lowest priority)
  const environmentFiles: string[] = [];

  const currentEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(currentEnv)) {
    environmentFiles.push(currentEnv);
  }

  const rootEnv = findUpSync('.env', { cwd: path.dirname(process.cwd()) });
  if (rootEnv) {
    if (rootEnv !== currentEnv) {
      environmentFiles.push(rootEnv);
    }
  }

  // This allows sharing API keys across multiple local repo copies
  const userConfigPath = path.join(os.homedir(), '.inkeep', 'config');
  if (fs.existsSync(userConfigPath)) {
    dotenv.config({ path: userConfigPath, override: true, quiet: true });
  }

  // Load all at once with dotenv supporting multiple files
  if (environmentFiles.length > 0) {
    dotenv.config({
      path: environmentFiles,
      override: false,
      quiet: true,
    });
    expand({ processEnv: process.env as Record<string, string> });
  }
};

loadEnvironmentFiles();

const envSchema = z.object({
  // Core Environment
  ENVIRONMENT: z
    .enum(['development', 'production', 'pentest', 'test'])
    .optional()
    .describe('Application environment mode'),

  // Database
  INKEEP_AGENTS_MANAGE_DATABASE_URL: z
    .string()
    .optional()
    .describe(
      'PostgreSQL connection URL for the management database (Doltgres with Git version control)'
    ),
  INKEEP_AGENTS_RUN_DATABASE_URL: z
    .string()
    .optional()
    .describe(
      'PostgreSQL connection URL for the runtime database (Doltgres with Git version control)'
    ),
  POSTGRES_POOL_SIZE: z
    .string()
    .optional()
    .describe('Maximum number of connections in the PostgreSQL connection pool'),

  // Authentication & Security
  INKEEP_AGENTS_JWT_SIGNING_SECRET: z
    .string()
    .min(32, 'INKEEP_AGENTS_JWT_SIGNING_SECRET must be at least 32 characters')
    .optional()
    .describe('Secret key for signing JWT tokens (minimum 32 characters)'),
  BETTER_AUTH_SECRET: z
    .string()
    .optional()
    .describe('Secret key for Better Auth session encryption (change in production)'),
  TRUSTED_ORIGIN: z
    .string()
    .optional()
    .describe('Trusted origin URL for CORS in local/preview environments'),
  OAUTH_PROXY_PRODUCTION_URL: z
    .string()
    .optional()
    .describe('OAuth proxy URL for production environment (used in local/preview environments)'),

  // API Endpoints
  INKEEP_AGENTS_MANAGE_UI_URL: z
    .string()
    .optional()
    .describe('URL where the management UI is hosted'),
  INKEEP_AGENTS_API_URL: z
    .string()
    .optional()
    .describe('URL where the agents management API is running'),
  AUTH_COOKIE_DOMAIN: z
    .string()
    .optional()
    .describe(
      'Explicit cookie domain for cross-subdomain auth (e.g., .inkeep.com). Required when the API and UI do not share a common 3-part parent domain.'
    ),
  GITHUB_MCP_API_KEY: z.string().optional().describe('API key for the GitHub MCP'),
  SPICEDB_ENDPOINT: z.string().optional().describe('SpiceDB endpoint'),
  SPICEDB_PRESHARED_KEY: z.string().optional().describe('SpiceDB pre-shared key'),
  SPICEDB_TLS_ENABLED: z.stringbool().optional().describe('SpiceDB TLS enabled'),
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
