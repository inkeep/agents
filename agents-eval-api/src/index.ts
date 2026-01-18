import './workflow-bootstrap';

import { createEvaluationHono } from './app';
import { getLogger } from './logger';
import { world } from './workflow';

const logger = getLogger('agents-eval-api');

/**
 * Start the workflow worker for processing background jobs.
 * This is separated from app creation to avoid module-level side effects.
 */
export async function startWorkflowWorker(): Promise<void> {
  if (world?.start) {
    await world.start();
    logger.info({}, 'Workflow worker started');
  }
}

// Only auto-start when running as a server, not when imported as library
// VERCEL_FUNCTION_BUILD is set during Vercel's build phase - skip startup then
if (typeof globalThis !== 'undefined' && !process.env.VERCEL_FUNCTION_BUILD) {
  startWorkflowWorker().catch((err) => {
    logger.error({ error: err }, 'Failed to start workflow worker');
  });
}

const app = createEvaluationHono();

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createEvaluationHono };

// Export evaluation service for use in other packages (like agents-run-api)
// This encapsulates workflow logic so consumers don't need workflow dependencies
export {
  type StartEvaluationParams,
  startConversationEvaluation,
} from './services/startEvaluation';
