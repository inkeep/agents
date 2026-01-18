/**
 * Workflow route handlers for Hono.
 *
 * These routes expose the generated workflow handlers from `workflow build`.
 * The postgres world queues jobs via pg-boss, then calls these endpoints.
 *
 * Generated files:
 * - .well-known/workflow/v1/flow.cjs (CJS bundle)
 * - .well-known/workflow/v1/step.cjs (CJS bundle)
 * - .well-known/workflow/v1/webhook.mjs (ESM)
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

function findPackageRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 30; i += 1) {
    const pkg = resolve(current, 'package.json');
    if (existsSync(pkg)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return startDir;
}

const packageRoot = findPackageRoot(__dirname);
const distRoot = resolve(packageRoot, 'dist');
const isRunningFromDist = __dirname.startsWith(`${distRoot}${sep}`);

/**
 * Resolve paths to generated handlers.
 * In dev: bundles live at <packageRoot>/.well-known
 * In prod: bundles live at <packageRoot>/dist/.well-known
 */
function resolveWorkflowPath(filename: string): string {
  const devPath = resolve(packageRoot, '.well-known/workflow/v1', filename);
  const prodPath = resolve(packageRoot, 'dist/.well-known/workflow/v1', filename);

  const preferred = isRunningFromDist ? prodPath : devPath;
  if (existsSync(preferred)) {
    return preferred;
  }

  const fallback = isRunningFromDist ? devPath : prodPath;
  if (existsSync(fallback)) {
    return fallback;
  }

  return preferred;
}

const flowPath = resolveWorkflowPath('flow.cjs');
const stepPath = resolveWorkflowPath('step.cjs');
const webhookPath = resolveWorkflowPath('webhook.mjs');

let flowHandler: any;
let stepHandler: any;
let webhook: any;

function loadCjsHandlers() {
  if (!flowHandler) {
    flowHandler = require(flowPath);
    stepHandler = require(stepPath);
  }
}

async function loadWebhookHandler() {
  if (!webhook) {
    webhook = await import(webhookPath);
  }
}

export const workflowRoutes = new Hono();

/**
 * Smart dispatcher that routes to flow or step handler based on queueName.
 * Handles cases where Vercel Queue delivers step messages to /flow endpoint.
 */
async function dispatchFlowOrStep(c: any) {
  loadCjsHandlers();

  const bodyBuf = await c.req.arrayBuffer();

  // Check header first (postgres world/local world uses x-vqs-queue-name header)
  let queueName: string | undefined = c.req.header('x-vqs-queue-name');

  // Fall back to body for Vercel Queue envelope
  if (!queueName) {
    try {
      const evt = JSON.parse(new TextDecoder().decode(bodyBuf));
      queueName = evt?.data?.queueName;
    } catch {
      // Ignore parse errors
    }
  }

  const isStep = typeof queueName === 'string' && queueName.startsWith('__wkf_step_');

  const rawUrl = c.req.raw.url;
  const url = new URL(rawUrl);
  url.pathname = isStep ? '/.well-known/workflow/v1/step' : '/.well-known/workflow/v1/flow';

  const fixedRequest = new Request(url.toString(), {
    method: 'POST',
    headers: c.req.raw.headers,
    body: bodyBuf,
  });

  const flow =
    flowHandler?.POST || flowHandler?.default?.POST || flowHandler?.default || flowHandler;
  const step =
    stepHandler?.POST || stepHandler?.default?.POST || stepHandler?.default || stepHandler;

  const handler = isStep ? step : flow;
  if (typeof handler !== 'function') {
    return c.json({ error: 'Handler not found' }, 500);
  }

  return handler(fixedRequest);
}

workflowRoutes.post('/workflow/v1/flow', dispatchFlowOrStep);
workflowRoutes.post('/workflow/v1/step', dispatchFlowOrStep);

workflowRoutes.all('/workflow/v1/webhook/:token', async (c) => {
  try {
    await loadWebhookHandler();
    const req = c.req.raw;
    const method = req.method as string;
    const handler = webhook[method] ?? webhook.default?.[method] ?? webhook.default;
    if (handler) {
      return handler(req);
    }
    return c.json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
