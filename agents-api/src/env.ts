import { z } from '@hono/zod-openapi';
import { loadEnvironmentFiles } from '@inkeep/agents-core';

// Load all environment files using shared logic
loadEnvironmentFiles();

const envSchema = z
  .object({
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
    INKEEP_AGENTS_MANAGE_DATABASE_URL: z
      .string()
      .describe(
        'PostgreSQL connection URL for the management database (Doltgres with Git version control)'
      ),
    INKEEP_AGENTS_RUN_DATABASE_URL: z
      .string()
      .describe(
        'PostgreSQL connection URL for the runtime database (Doltgres with Git version control)'
      ),
    INKEEP_AGENTS_MANAGE_UI_URL: z
      .string()
      .optional()
      .describe('URL where the management UI is hosted'),
    INKEEP_AGENTS_API_URL: z
      .string()
      .optional()
      .default('http://localhost:3002')
      .describe('URL where the agents management API is running'),
    AUTH_COOKIE_DOMAIN: z
      .string()
      .optional()
      .describe(
        'Explicit cookie domain for cross-subdomain auth (e.g., .inkeep.com). Required when the API and UI do not share a common 3-part parent domain.'
      ),

    // Authentication
    BETTER_AUTH_SECRET: z
      .string()
      .optional()
      .describe('Secret key for Better Auth session encryption (change in production)'),
    INKEEP_AGENTS_MANAGE_UI_USERNAME: z
      .string()
      .optional()
      .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
        message: 'Invalid email address',
      })
      .describe('Admin email address for management UI login'),
    INKEEP_AGENTS_MANAGE_UI_PASSWORD: z
      .string()
      .optional()
      .refine((val) => !val || val.length >= 8, {
        message: 'Password must be at least 8 characters',
      })
      .describe('Admin password for management UI login (min 8 characters)'),

    // API Bypass Secrets (for local development and testing, skips auth)
    INKEEP_AGENTS_API_BYPASS_SECRET: z
      .string()
      .optional()
      .describe('API bypass secret for local development and testing (skips auth)'),
    INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: z
      .string()
      .optional()
      .describe('Management API bypass secret for local development and testing (skips auth)'),
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z
      .string()
      .optional()
      .describe('Run API bypass secret for local development and testing (skips auth)'),
    INKEEP_AGENTS_EVAL_API_BYPASS_SECRET: z
      .string()
      .optional()
      .describe('Eval API bypass secret for local development and testing (skips auth)'),

    // JWT Keys (for Playground)
    INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY: z
      .string()
      .optional()
      .describe(
        'Temporary JWT public key for Playground (generate with scripts/generate-jwt-keys.sh)'
      ),
    INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY: z
      .string()
      .optional()
      .describe(
        'Temporary JWT private key for Playground (generate with scripts/generate-jwt-keys.sh)'
      ),

    // Nango (OAuth integrations)
    NANGO_SERVER_URL: z
      .string()
      .optional()
      .default('https://api.nango.dev')
      .describe('Nango server URL for OAuth integrations'),
    NANGO_SECRET_KEY: z.string().optional().describe('Nango secret key for OAuth integrations'),

    // OpenTelemetry Configuration
    OTEL_BSP_SCHEDULE_DELAY: z.coerce
      .number()
      .optional()
      .default(500)
      .describe('OpenTelemetry batch span processor schedule delay in milliseconds'),
    OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.coerce
      .number()
      .optional()
      .default(64)
      .describe('OpenTelemetry batch span processor max export batch size'),

    // Tenant Configuration
    TENANT_ID: z
      .string()
      .optional()
      .default('default')
      .describe('Default tenant ID for development'),

    // SigNoz (Observability)
    SIGNOZ_URL: z.string().optional().describe('SigNoz server URL for observability'),
    SIGNOZ_API_KEY: z.string().optional().describe('SigNoz API key for authentication'),
    PUBLIC_SIGNOZ_URL: z
      .string()
      .optional()
      .describe('Public SigNoz URL accessible from the browser'),

    // AI Providers
    ANTHROPIC_API_KEY: z
      .string()
      .describe(
        'Anthropic API key for Claude models (required for agent execution). Get from https://console.anthropic.com/'
      ),
    OPENAI_API_KEY: z
      .string()
      .optional()
      .describe('OpenAI API key for GPT models. Get from https://platform.openai.com/'),
    GOOGLE_GENERATIVE_AI_API_KEY: z
      .string()
      .optional()
      .describe('Google Generative AI API key for Gemini models'),

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

    // Slack Socket Mode (local development)
    SLACK_APP_TOKEN: z
      .string()
      .optional()
      .describe('Slack App-Level Token for Socket Mode (xapp-*)'),

    // Workflow Configuration
    WORKFLOW_TARGET_WORLD: z.string().optional().describe('Target world for workflow execution'),
    WORKFLOW_POSTGRES_URL: z
      .string()
      .optional()
      .describe('PostgreSQL connection URL for workflow job queue'),
    WORKFLOW_POSTGRES_JOB_PREFIX: z
      .string()
      .optional()
      .describe('Prefix for workflow job names in the queue'),
    WORKFLOW_POSTGRES_WORKER_CONCURRENCY: z
      .string()
      .optional()
      .describe('Number of concurrent workflow workers'),

    // Blob Storage (local filesystem fallback, or inferred S3/Vercel)
    BLOB_STORAGE_LOCAL_PATH: z
      .string()
      .optional()
      .default('.blob-storage')
      .describe(
        'Directory path for local blob storage fallback. Resolved relative to process cwd. Default .blob-storage.'
      ),
    BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: z
      .string()
      .optional()
      .describe(
        'Vercel Blob read-write token. Used when S3 is not configured and this token is set.'
      ),
    BLOB_STORAGE_S3_ENDPOINT: z
      .string()
      .optional()
      .describe('S3-compatible endpoint URL (omit for AWS S3, which uses the default endpoint)'),
    BLOB_STORAGE_S3_BUCKET: z
      .string()
      .optional()
      .describe('S3 bucket name for storing uploaded media'),
    BLOB_STORAGE_S3_REGION: z.string().optional().describe('AWS region for the S3 bucket'),
    BLOB_STORAGE_S3_ACCESS_KEY_ID: z
      .string()
      .optional()
      .describe('AWS access key ID for S3 (required when S3 storage is inferred).'),
    BLOB_STORAGE_S3_SECRET_ACCESS_KEY: z
      .string()
      .optional()
      .describe('AWS secret access key for S3 (required when S3 storage is inferred).'),
    BLOB_STORAGE_S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .default('false')
      .transform((val) => val === 'true')
      .describe(
        'Force path-style S3 URLs: false for AWS S3 (default), true for path-style/self-hosted S3-compatible.'
      ),
  })
  .superRefine((data, ctx) => {
    const hasS3Bucket =
      data.BLOB_STORAGE_S3_BUCKET !== undefined &&
      String(data.BLOB_STORAGE_S3_BUCKET).trim() !== '';

    if (hasS3Bucket) {
      const required = [
        { key: 'BLOB_STORAGE_S3_BUCKET', val: data.BLOB_STORAGE_S3_BUCKET },
        { key: 'BLOB_STORAGE_S3_REGION', val: data.BLOB_STORAGE_S3_REGION },
        { key: 'BLOB_STORAGE_S3_ACCESS_KEY_ID', val: data.BLOB_STORAGE_S3_ACCESS_KEY_ID },
        { key: 'BLOB_STORAGE_S3_SECRET_ACCESS_KEY', val: data.BLOB_STORAGE_S3_SECRET_ACCESS_KEY },
      ] as const;
      for (const { key, val } of required) {
        if (val === undefined || String(val).trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `When S3 storage is inferred from BLOB_STORAGE_S3_BUCKET, ${key} must be set and non-empty.`,
          });
        }
      }
    }

    if (
      data.BLOB_STORAGE_LOCAL_PATH === undefined ||
      String(data.BLOB_STORAGE_LOCAL_PATH).trim() === ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BLOB_STORAGE_LOCAL_PATH'],
        message: 'BLOB_STORAGE_LOCAL_PATH must be set and non-empty. Default is .blob-storage.',
      });
    }
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
