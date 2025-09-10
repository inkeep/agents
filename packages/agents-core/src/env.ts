import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import { z } from 'zod';

// Find monorepo root by looking for pnpm-workspace.yaml
const findMonorepoRoot = (): string => {
  let dir = __dirname;
  while (dir !== '/') {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
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
  DB_FILE_NAME: z.string().default('file:../../local.db'),
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
