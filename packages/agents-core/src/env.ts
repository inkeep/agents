import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv'; // Still needed for parsing additional config files
import { expand } from 'dotenv-expand';
import { findUpSync } from 'find-up';
import { z } from 'zod';

export const loadEnvironmentFiles = () => {
  // Define files in priority order (highest to lowest priority)
  const environmentFiles: string[] = [];

  // 1. current directory .env.local (highest priority)
  const localOverride = path.resolve(process.cwd(), '.env.local');
  console.log('Local override:', localOverride);
  if (fs.existsSync(localOverride)) {
    environmentFiles.push(localOverride);
  }

  // 2. Current directory .env
  const currentEnv = path.resolve(process.cwd(), '.env');
  console.log('Current env:', currentEnv);
  if (fs.existsSync(currentEnv)) {
    environmentFiles.push(currentEnv);
  }

  // 3. Search for root .env and root .env.local
  const rootEnv = findUpSync('.env', { cwd: path.dirname(process.cwd()) });
  console.log('Root env:', rootEnv);
  if (rootEnv) {
    const rootDir = path.dirname(rootEnv);
    console.log('Root directory:', rootDir);

    // Check for root .env.local
    const rootEnvLocal = path.join(rootDir, '.env.local');
    if (fs.existsSync(rootEnvLocal) && rootEnvLocal !== localOverride) {
      environmentFiles.push(rootEnvLocal);
    }

    // check for root .env
    if (fs.existsSync(rootEnv) && rootEnv !== currentEnv) {
      environmentFiles.push(rootEnv);
    }
  }

  // 3. Load user global config if exists (~/.inkeep/config)
  // This allows sharing API keys across multiple local repo copies
  const userConfigPath = path.join(os.homedir(), '.inkeep', 'config');
  if (fs.existsSync(userConfigPath)) {
    dotenv.config({ path: userConfigPath, override: true });
  }

  // Load all at once with dotenv supporting multiple files
  if (environmentFiles.length > 0) {
    dotenv.config({
      path: environmentFiles,
      override: false,
    });
    expand({ processEnv: process.env as Record<string, string> });
  }
};

loadEnvironmentFiles();

const envSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  DB_FILE_NAME: z.string(),
  OTEL_TRACES_FORCE_FLUSH_ENABLED: z.coerce.boolean().optional(),
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
