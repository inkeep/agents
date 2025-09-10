import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import { z } from 'zod';

dotenv.config({ quiet: true });

// Calculate workspace root from agents-core package location
// This ensures consistent database path regardless of where commands are run from
const currentFileDir = path.dirname(fileURLToPath(import.meta.url)); // Current file directory
const workspaceRoot = path.resolve(currentFileDir, '../../../'); // agents-core/src -> agents-core -> packages -> workspace
const defaultDbPath = `file:${path.join(workspaceRoot, 'local.db')}`;

const environmentSchema = z.enum(['development', 'pentest', 'production', 'test']);

// Parse critical environment with a default fallback for CLI usage
const criticalEnv = (() => {
  try {
    return z
      .object({
        ENVIRONMENT: environmentSchema,
      })
      .parse(process.env);
  } catch (error) {
    // For CLI usage, provide a sensible default if ENVIRONMENT is not set
    // This allows the CLI to run without requiring ENVIRONMENT for simple operations
    if (!process.env.ENVIRONMENT) {
      // Check if we're running from a globally installed package (production)
      // or from a local development environment
      const isGlobalInstall =
        __dirname.includes('node_modules/@inkeep/agents-cli') ||
        __dirname.includes('.nvm') ||
        __dirname.includes('.npm');

      const defaultEnv = isGlobalInstall ? 'production' : 'development';
      process.env.ENVIRONMENT = defaultEnv;
      return { ENVIRONMENT: defaultEnv as 'production' | 'development' };
    }
    throw error;
  }
})();

const loadEnvFile = () => {
  // Priority of environment variables:
  // 1. Existing process.env variables (highest priority)
  // 2. Values from .env.{nodeEnv}.nonsecret file (lower priority)
  // 3. Default values defined in schema (lowest priority)

  const envPath = path.resolve(process.cwd(), `.env.${criticalEnv.ENVIRONMENT}.nonsecret`);

  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      // Only set if the environment variable doesn't already exist
      // This preserves any values that were already set in process.env
      if (!(k in process.env)) {
        process.env[k] = envConfig[k];
      }
    }
    dir = path.dirname(dir);
  }
  // Fallback to current working directory if not in a monorepo
  return process.cwd();
};

// Load environment configuration following Cal.com pattern
// Single root .env file for entire monorepo
export const loadEnv = () => {
  const root = findMonorepoRoot();

  // 1. Load .env.example as base (defaults)
  const examplePath = path.join(root, '.env.example');
  if (fs.existsSync(examplePath)) {
    dotenv.config({ path: examplePath });
  }

  // 2. Load root .env (main configuration)
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }

  // 3. Load user global config if exists (~/.inkeep/config)
  // This allows sharing API keys across multiple local repo copies
  const userConfigPath = path.join(os.homedir(), '.inkeep', 'config');
  if (fs.existsSync(userConfigPath)) {
    dotenv.config({ path: userConfigPath, override: true });
  }

  // 4. Load repo-specific .env.local (for multiple local copies)
  const localEnvPath = path.join(root, '.env.local');
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true });
  }

  // Expand variables that reference other variables
  expand({ processEnv: process.env });
};

// Load environment variables
loadEnv();
const envSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  DB_FILE_NAME: z.string().default(defaultDbPath),
  OTEL_TRACES_FORCE_FLUSH_ENABLED: z.stringbool().optional(),
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
