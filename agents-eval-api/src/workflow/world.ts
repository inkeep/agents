// Import all world creation functions
// Must use static imports instead of getWorld() which does dynamic imports
// that Vercel's NFT can't trace in bundled code
import { createLocalWorld } from '@workflow/world-local';
import { createWorld as createPostgresWorld } from '@workflow/world-postgres';
import { createVercelWorld } from '@workflow/world-vercel';

// Debug: Intercept fetch calls to Vercel Workflow API
const originalFetch = globalThis.fetch;
globalThis.fetch = async function debugFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // Only log workflow-related requests
  if (url.includes('vercel-workflow') || url.includes('vercel-queue') || url.includes('workflow')) {
    // Convert headers to a readable format
  let headersObj: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      headersObj = Object.fromEntries(init.headers.entries());
    } else if (Array.isArray(init.headers)) {
      headersObj = Object.fromEntries(init.headers);
    } else {
      headersObj = init.headers as Record<string, string>;
    }
  }
  
  console.log('[workflow-fetch] Outgoing request', {
      url,
      method: init?.method || 'GET',
      hasBody: Boolean(init?.body),
      headers: headersObj,
    });
    
    try {
      const response = await originalFetch(input, init);
      const clonedResponse = response.clone();
      
      console.log('[workflow-fetch] Response received', {
        url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });
      
      // Try to log response body for debugging (only for errors or important calls)
      if (!response.ok || url.includes('/runs/create') || url.includes('/messages')) {
        try {
          const body = await clonedResponse.text();
          console.log('[workflow-fetch] Response body', {
            url,
            body: body.substring(0, 500), // Truncate for safety
          });
        } catch (e) {
          // Ignore body parsing errors
        }
      }
      
      return response;
    } catch (error: any) {
      console.error('[workflow-fetch] Request failed', {
        url,
        error: error?.message || String(error),
      });
      throw error;
    }
  }
  
  return originalFetch(input, init);
};

// Manually select and initialize world based on env var
// Accept both short names ('local', 'vercel', 'postgres') and full package names
// const targetWorld = process.env.WORKFLOW_TARGET_WORLD || 'local';
const targetWorld = process.env.WORKFLOW_TARGET_WORLD || '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let world: any;

if (targetWorld === '@workflow/world-vercel' || targetWorld === 'vercel') {
  // Debug logging for vercel world config
  const token = process.env.WORKFLOW_VERCEL_AUTH_TOKEN;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const vercelUrl = process.env.VERCEL_URL;
  
  // Explicit environment value for debugging - this is what gets passed to workflow
  const environment = process.env.VERCEL_ENV;
  
  console.log('[vercel-world-config]', {
    projectId: process.env.VERCEL_PROJECT_ID,
    teamIdPresent: Boolean(process.env.VERCEL_TEAM_ID),
    teamIdLen: process.env.VERCEL_TEAM_ID?.length ?? 0,
    env: environment,
    envIsUndefined: environment === undefined,
    envIsEmptyString: environment === '',
    envType: typeof environment,
    tokenPresent: Boolean(token),
    tokenLen: token?.length ?? 0,
    // If token is empty string, OIDC should be used instead
    willUseOidc: !token || token.trim() === '',
    // Additional debug info for callback routing
    deploymentId: deploymentId || '[NOT SET]',
    vercelUrl: vercelUrl || '[NOT SET]',
    vercelRegion: process.env.VERCEL_REGION || '[NOT SET]',
    // WARNING: If env is undefined, @workflow/world-vercel may default to 'production'
    warningCallbackRouting: !environment ? '⚠️ VERCEL_ENV not set - callbacks may route to production!' : 'OK',
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
} else if (targetWorld === '@workflow/world-postgres' || targetWorld === 'postgres') {
  // Postgres world configuration (for self-hosted deployments)
  console.log('[postgres-world-config]', {
    connectionStringPresent: Boolean(process.env.WORKFLOW_POSTGRES_URL),
    jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
    concurrency: Number(process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) || 10,
  });

  world = createPostgresWorld({
    connectionString:
      process.env.WORKFLOW_POSTGRES_URL ||
      'postgres://world:world@localhost:5432/world',
    jobPrefix: process.env.WORKFLOW_POSTGRES_JOB_PREFIX,
    queueConcurrency: Number(process.env.WORKFLOW_POSTGRES_WORKER_CONCURRENCY) || 10,
  });

  console.log('[postgres-world-created]', {
    hasRuns: Boolean(world.runs),
    hasQueue: Boolean(world.queue),
    hasStart: Boolean(world.start),
  });
} else if (targetWorld === '@workflow/world-local' || targetWorld === 'local') {
  // Local world configuration (for quickstart and local development)
  // No external dependencies needed - uses in-memory queuing and filesystem storage
  console.log('[local-world-config]', {
    port: process.env.PORT || '3005',
    targetWorld,
  });

  world = createLocalWorld();

  console.log('[local-world-created]', {
    hasRuns: Boolean(world.runs),
    hasQueue: Boolean(world.queue),
    hasStart: Boolean(world.start),
    runsKeys: world.runs ? Object.keys(world.runs) : [],
    queueKeys: world.queue ? Object.keys(world.queue) : [],
  });
} else {
  // Unknown world - fall back to local
//   console.warn('[world-config] Unknown WORKFLOW_TARGET_WORLD:', targetWorld, '- falling back to local world');
//   world = createLocalWorld();
}

export { world };

