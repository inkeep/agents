// ============================================================
// src/lib/env.ts
// Environment configuration with Zod validation
// ============================================================
import { z } from 'zod';

const envSchema = z.object({
  // Slack
  SLACK_BOT_TOKEN: z.string().optional(), // Only for single-workspace dev
  SLACK_SIGNING_SECRET: z.string().min(1, 'SLACK_SIGNING_SECRET is required'),
  SLACK_BOT_USER_ID: z.string().default(''),
  SLACK_CLIENT_ID: z.string().min(1, 'SLACK_CLIENT_ID is required'),
  SLACK_CLIENT_SECRET: z.string().min(1, 'SLACK_CLIENT_SECRET is required'),

  // Nango (aligned with NangoCredentialStore patterns)
  NANGO_SECRET_KEY: z.string().min(1, 'NANGO_SECRET_KEY is required'),
  NANGO_SERVER_URL: z.string().url().default('https://api.nango.dev'),
  NANGO_INTEGRATION_ID: z.string().default('slack'),
  NANGO_WEBHOOK_VERIFY_SECRET: z.string().optional(),

  // Database
  DB_URL: z.string().url().default('http://localhost:3002'),
  INKEEP_AGENTS_MANAGE_DATABASE_URL: z
    .string()
    .min(1, 'INKEEP_AGENTS_MANAGE_DATABASE_URL is required'),

  // Inkeep
  INKEEP_API_URL: z.string().url().default('https://run-api.pilot.inkeep.com'),
  INKEEP_API_SECRET: z.string().min(1, 'INKEEP_API_SECRET is required'),
  INKEEP_TENANT_ID: z.string().default('default'),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3004'),
  PROJECT_ID: z.string().default('default'),

  // Development
  NGROK_AUTH_TOKEN: z.string().optional(),
  NGROK_DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Get validated environment variables (cached after first call)
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    const result = envSchema.safeParse({
      // Slack
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
      SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
      SLACK_BOT_USER_ID: process.env.SLACK_BOT_USER_ID,
      SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
      // Nango
      NANGO_SECRET_KEY: process.env.NANGO_SECRET_KEY,
      NANGO_SERVER_URL: process.env.NANGO_SERVER_URL,
      NANGO_INTEGRATION_ID: process.env.NANGO_INTEGRATION_ID,
      NANGO_WEBHOOK_VERIFY_SECRET: process.env.NANGO_WEBHOOK_VERIFY_SECRET,
      // Database
      DB_URL: process.env.DB_URL,
      INKEEP_AGENTS_MANAGE_DATABASE_URL: process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
      // Inkeep (mapping legacy env var names)
      INKEEP_API_URL: process.env.INKEEP_RUN_API_URL,
      INKEEP_API_SECRET: process.env.INKEEP_RUN_API_BYPASS_SECRET,
      INKEEP_TENANT_ID: process.env.INKEEP_TENANT_ID ?? process.env.TENANT_ID,
      // App
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      PROJECT_ID: process.env.PROJECT_ID,
      // Development
      NGROK_AUTH_TOKEN: process.env.NGROK_AUTH_TOKEN,
      NGROK_DOMAIN: process.env.NGROK_DOMAIN,
    });

    if (!result.success) {
      console.error('❌ Invalid environment variables:', result.error.format());
      throw new Error('Invalid environment configuration');
    }
    cachedEnv = result.data;
  }
  return cachedEnv;
}

/**
 * Get a single env var (for cases where you don't need full validation)
 */
export function getEnvVar(key: keyof Env): string | undefined {
  return getEnv()[key];
}

/**
 * Convenience export for direct destructuring
 * @example const { SLACK_BOT_TOKEN } = ENV;
 */
export const ENV = new Proxy({} as Env, {
  get(_, key: string) {
    return getEnv()[key as keyof Env];
  },
});

export const STREAM_CONFIG = {
  throttleMs: 650,
  minDeltaChars: 40,
  maxRetries: 2,
  baseRetryDelayMs: 900,
  finalizationDelayMs: 160,
  cursor: ' ▌',
} as const;

export type StreamConfig = typeof STREAM_CONFIG;
