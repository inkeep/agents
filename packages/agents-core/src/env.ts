import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config({ quiet: true });

const environmentSchema = z.enum(['development', 'pentest', 'production', 'test']);

const criticalEnv = z
  .object({
    ENVIRONMENT: environmentSchema,
  })
  .parse(process.env);

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
  }
};

loadEnvFile();
const envSchema = z.object({
  ENVIRONMENT: z.enum(['development', 'production', 'pentest', 'test']).optional(),
  DB_FILE_NAME: z.string(),
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
