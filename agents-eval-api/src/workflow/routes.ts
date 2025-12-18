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
import { existsSync } from 'node:fs';

// Use createRequire for CJS modules in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Resolve paths to generated handlers
// In dev: code runs from src/workflow/, .well-known is at ../../.well-known
// In prod: code runs from dist/index.js, .well-known is at .well-known (copied by build)
function resolveWorkflowPath(filename: string): string {
  // Try dist-relative path first (production)
  const prodPath = resolve(__dirname, '.well-known/workflow/v1', filename);
  if (existsSync(prodPath)) {
    return prodPath;
  }
  // Fall back to dev path (source-relative)
  const devPath = resolve(__dirname, '../../.well-known/workflow/v1', filename);
  if (existsSync(devPath)) {
    return devPath;
  }
  // If neither exists, return prod path and let the error happen at load time
  console.warn(`[workflow] Handler not found at ${prodPath} or ${devPath}`);
  return prodPath;
}

const flowPath = resolveWorkflowPath('flow.cjs');
const stepPath = resolveWorkflowPath('step.cjs');
// Webhook path for dynamic import (it's ESM, use .mjs)
const webhookPath = resolveWorkflowPath('webhook.mjs');

// Lazy-load handlers
let flowHandler: any;
let stepHandler: any;
let webhook: any;

// Load CJS handlers synchronously
function loadCjsHandlers() {
  if (!flowHandler) {
    flowHandler = require(flowPath);
    stepHandler = require(stepPath);
  }
}

// Load ESM webhook handler asynchronously
async function loadWebhookHandler() {
  if (!webhook) {
    // Dynamic import for ESM module
    webhook = await import(webhookPath);
  }
}

export const workflowRoutes = new Hono();

// Workflow orchestration endpoint
workflowRoutes.post('/v1/flow', async (c) => {
  loadCjsHandlers();
  // Handle both default export and named export patterns
  const handler = flowHandler.POST || flowHandler.default?.POST;
  if (!handler) {
    return c.json({ error: 'Flow handler not found' }, 500);
  }
  return handler(c.req.raw);
});

// Step execution endpoint
workflowRoutes.post('/v1/step', async (c) => {
  loadCjsHandlers();
  const handler = stepHandler.POST || stepHandler.default?.POST;
  if (!handler) {
    return c.json({ error: 'Step handler not found' }, 500);
  }
  return handler(c.req.raw);
});

// Webhook delivery endpoint
workflowRoutes.all('/v1/webhook/:token', async (c) => {
  await loadWebhookHandler();
  const req = c.req.raw;
  const method = req.method as string;
  const handler = webhook[method] ?? webhook.default?.[method] ?? webhook.default;
  if (handler) {
    return handler(req);
  }
  return c.json({ error: 'Method not allowed' }, 405);
});
