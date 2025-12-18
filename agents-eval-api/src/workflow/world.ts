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
  // Debug logging for vercel world config
  const token = process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const vercelUrl = process.env.VERCEL_URL;
  
  console.log('[vercel-world-config]', {
    projectId: process.env.VERCEL_PROJECT_ID,
    teamIdPresent: Boolean(process.env.VERCEL_TEAM_ID),
    teamIdLen: process.env.VERCEL_TEAM_ID?.length ?? 0,
    env: process.env.VERCEL_ENV,
    tokenPresent: Boolean(token),
    tokenLen: token?.length ?? 0,
    // If token is empty string, OIDC should be used instead
    willUseOidc: !token || token.trim() === '',
    // Additional debug info for callback routing
    deploymentId: deploymentId || '[NOT SET]',
    vercelUrl: vercelUrl || '[NOT SET]',
    vercelRegion: process.env.VERCEL_REGION || '[NOT SET]',
  });

  // Vercel world configuration (for cloud deployments)
  // Use || instead of ?? to treat empty string as "not provided" and fall back to OIDC
  world = createVercelWorld({
    token: token && token.trim() ? token : undefined, // Let OIDC handle auth if token is empty
    baseUrl: process.env.WORKFLOW_VERCEL_BASE_URL || undefined,
    projectConfig: {
      projectId: process.env.VERCEL_PROJECT_ID,
      teamId: process.env.VERCEL_TEAM_ID,
      environment: process.env.VERCEL_ENV,
    },
  });

  // Log world capabilities for debugging
  console.log('[vercel-world-created]', {
    hasRuns: Boolean(world.runs),
    hasQueue: Boolean(world.queue),
    hasStart: Boolean(world.start),
    runsKeys: world.runs ? Object.keys(world.runs) : [],
    queueKeys: world.queue ? Object.keys(world.queue) : [],
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

