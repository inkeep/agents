/**
 * Workflow world configuration.
 *
 * Static imports are required instead of dynamic imports because
 * Vercel's NFT can't trace dynamic imports in bundled code.
 *
 * Set WORKFLOW_TARGET_WORLD to: 'local' | 'vercel' | '@workflow/world-postgres'
 * Defaults to 'local' for development if not set.
 */
import { createLocalWorld } from '@workflow/world-local';
import { createWorld as createPostgresWorld } from '@workflow/world-postgres';
import { createVercelWorld } from '@workflow/world-vercel';
import { env } from '../../../env';

// Default to 'local' for development environments
const targetWorld = env.WORKFLOW_TARGET_WORLD || 'local';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let world: any;

if (targetWorld === 'vercel') {
  const token = process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
  world = createVercelWorld({
    token: token?.trim() || undefined,
    baseUrl: process.env.WORKFLOW_VERCEL_BASE_URL || undefined,
    projectConfig: {
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID,
      environment: process.env.VERCEL_ENV,
    },
  });
} else if (targetWorld === '@workflow/world-postgres') {
  world = createPostgresWorld({
    connectionString: env.WORKFLOW_POSTGRES_URL || 'postgres://world:world@localhost:5432/world',
    jobPrefix: env.WORKFLOW_POSTGRES_JOB_PREFIX,
    queueConcurrency: Number(env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) || 10,
  });
} else {
  // Default to local world for development and 'local' value
  world = createLocalWorld();
}

export { world };
