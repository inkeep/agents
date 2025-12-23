/**
 * Workflow route handlers for Hono.
 * 
 * These routes expose the generated workflow handlers from `workflow build`.
 * The postgres world queues jobs via pg-boss, then calls these endpoints.
 * 
 * Generated files:
 * - .well-known/workflow/v1/flow.cjs (CJS bundle)
 * - .well-known/workflow/v1/step.cjs (CJS bundle)
 * - .well-known/workflow/v1/webhook.cjs (ESM - the builder doesn't convert this one)
 */
import { Hono } from 'hono';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

// Use createRequire for CJS modules in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Log initial path info for debugging
console.log('[workflow-routes] Initializing workflow routes');
console.log('[workflow-routes] __dirname:', __dirname);
console.log('[workflow-routes] __filename:', __filename);

// Resolve paths to generated handlers
// In dev: code runs from src/workflow/, .well-known is at ../../.well-known
// In prod: code runs from dist/index.js, .well-known is at .well-known (copied by build)
function resolveWorkflowPath(filename: string): string {
  // Try dist-relative path first (production)
  const prodPath = resolve(__dirname, '.well-known/workflow/v1', filename);
  console.log(`[workflow-routes] Checking prod path: ${prodPath}, exists: ${existsSync(prodPath)}`);
  if (existsSync(prodPath)) {
    return prodPath;
  }
  // Fall back to dev path (source-relative)
  const devPath = resolve(__dirname, '../../.well-known/workflow/v1', filename);
  console.log(`[workflow-routes] Checking dev path: ${devPath}, exists: ${existsSync(devPath)}`);
  if (existsSync(devPath)) {
    return devPath;
  }
  // If neither exists, log directory contents for debugging
  console.error(`[workflow-routes] Handler ${filename} not found!`);
  try {
    const parentDir = resolve(__dirname);
    console.log(`[workflow-routes] Contents of ${parentDir}:`, readdirSync(parentDir));
    const wellKnownDir = resolve(__dirname, '.well-known');
    if (existsSync(wellKnownDir)) {
      console.log(`[workflow-routes] Contents of ${wellKnownDir}:`, readdirSync(wellKnownDir));
    }
  } catch (e) {
    console.error('[workflow-routes] Error listing directory:', e);
  }
  return prodPath;
}

const flowPath = resolveWorkflowPath('flow.cjs');
const stepPath = resolveWorkflowPath('step.cjs');
// Webhook path for dynamic import (it's ESM, use .mjs)
const webhookPath = resolveWorkflowPath('webhook.mjs');

console.log('[workflow-routes] Resolved paths:', { flowPath, stepPath, webhookPath });

// Lazy-load handlers
let flowHandler: any;
let stepHandler: any;
let webhook: any;

// Load CJS handlers synchronously
function loadCjsHandlers() {
  if (!flowHandler) {
    console.log('[workflow-routes] Loading CJS handlers...');
    try {
      flowHandler = require(flowPath);
      stepHandler = require(stepPath);
      console.log('[workflow-routes] CJS handlers loaded successfully');
      console.log('[workflow-routes] flowHandler keys:', Object.keys(flowHandler || {}));
      console.log('[workflow-routes] stepHandler keys:', Object.keys(stepHandler || {}));
    } catch (err) {
      console.error('[workflow-routes] Failed to load CJS handlers:', err);
      throw err;
    }
  }
}

// Load ESM webhook handler asynchronously
async function loadWebhookHandler() {
  if (!webhook) {
    console.log('[workflow-routes] Loading ESM webhook handler...');
    try {
      webhook = await import(webhookPath);
      console.log('[workflow-routes] Webhook handler loaded, keys:', Object.keys(webhook || {}));
    } catch (err) {
      console.error('[workflow-routes] Failed to load webhook handler:', err);
      throw err;
    }
  }
}

export const workflowRoutes = new Hono();

// CRITICAL: Catch-all logger for ANY request to workflow routes
// This will log even if method is wrong, path doesn't match exactly, etc.
workflowRoutes.use('*', async (c, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[WORKFLOW-CALLBACK] ${timestamp} INCOMING REQUEST`, {
    method: c.req.method,
    path: c.req.path,
    url: c.req.url,
    contentType: c.req.header('content-type'),
    userAgent: c.req.header('user-agent'),
    vercelId: c.req.header('x-vercel-id'),
    // Check for Vercel internal headers
    vercelDeploymentUrl: c.req.header('x-vercel-deployment-url'),
    forwardedFor: c.req.header('x-forwarded-for'),
  });
  await next();
  console.log(`[WORKFLOW-CALLBACK] ${timestamp} RESPONSE`, {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });
});

// Smart dispatcher that routes to flow or step handler based on queueName
// This handles cases where Vercel Queue delivers step messages to /flow endpoint
async function dispatchFlowOrStep(c: any) {
  loadCjsHandlers();

  const bodyBuf = await c.req.arrayBuffer();

  // Check header first (postgres world/local world uses x-vqs-queue-name header)
  let queueName: string | undefined = c.req.header('x-vqs-queue-name');
  
  // Fall back to body for Vercel Queue envelope
  if (!queueName) {
    try {
      const evt = JSON.parse(new TextDecoder().decode(bodyBuf));
      queueName = evt?.data?.queueName; // Vercel Queue envelope field
    } catch {
      // Ignore parse errors
    }
  }

  const isStep = typeof queueName === 'string' && queueName.startsWith('__wkf_step_');

  const rawUrl = c.req.raw.url;
  const url = new URL(rawUrl);

  // Point the URL pathname at the handler's expected path
  url.pathname = isStep
    ? '/.well-known/workflow/v1/step'
    : '/.well-known/workflow/v1/flow';

  const fixedRequest = new Request(url.toString(), {
    method: 'POST',
    headers: c.req.raw.headers,
    body: bodyBuf,
  });

  const flow = flowHandler?.POST || flowHandler?.default?.POST || flowHandler?.default || flowHandler;
  const step = stepHandler?.POST || stepHandler?.default?.POST || stepHandler?.default || stepHandler;

  const handler = isStep ? step : flow;
  if (typeof handler !== 'function') {
    console.error('[workflow-routes] Handler not callable', { isStep, queueName });
    return c.json({ error: 'Handler not found' }, 500);
  }

  console.log('[workflow-routes] dispatching', { queueName, isStep, to: url.pathname });
  return handler(fixedRequest);
}

// Workflow orchestration endpoint
workflowRoutes.post('/workflow/v1/flow', dispatchFlowOrStep);

// Step execution endpoint - also uses dispatcher as safety net
workflowRoutes.post('/workflow/v1/step', dispatchFlowOrStep);

// Webhook delivery endpoint
workflowRoutes.all('/workflow/v1/webhook/:token', async (c) => {
  console.log('[workflow-routes] /workflow/v1/webhook received, method:', c.req.method);
  try {
    await loadWebhookHandler();
    const req = c.req.raw;
    const method = req.method as string;
    const handler = webhook[method] ?? webhook.default?.[method] ?? webhook.default;
    if (handler) {
      console.log('[workflow-routes] Calling webhook handler for method:', method);
      return handler(req);
    }
    return c.json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[workflow-routes] Error in /v1/webhook:', err);
    return c.json({ error: String(err) }, 500);
  }
});
