// Import both world creation functions
// Must use static imports instead of getWorld() which does dynamic imports
// that Vercel's NFT can't trace in bundled code
import { createWorld as createPostgresWorld } from '@workflow/world-postgres';
import { createVercelWorld } from '@workflow/world-vercel';

// Manually select and initialize world based on env var
// Accept both 'vercel' and '@workflow/world-vercel' for convenience
const targetWorld = process.env.WORKFLOW_TARGET_WORLD || '@workflow/world-postgres';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let world: any;

if (targetWorld === '@workflow/world-vercel' || targetWorld === 'vercel') {
  // Vercel world configuration (for cloud deployments)
  world = createVercelWorld({
    token: process.env.WORKFLOW_VERCEL_AUTH_TOKEN,
    baseUrl: process.env.WORKFLOW_VERCEL_BASE_URL,
    projectConfig: {
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID,
      environment: process.env.VERCEL_ENV,
    },
  });
} else {
  // Postgres world configuration (for local dev and self-hosted)
  world = createPostgresWorld({
    connectionString:
      process.env.WORKFLOW_POSTGRES_URL ||
      'postgres://world:world@localhost:5432/world',
    jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
    queueConcurrency: Number(process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) || 10,
  });
}

export { world };

