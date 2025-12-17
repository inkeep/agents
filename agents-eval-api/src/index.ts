import './workflow-bootstrap';

import { createEvaluationHono } from './app';

const app = createEvaluationHono();

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createEvaluationHono };

// Export evaluation service for use in other packages (like agents-run-api)
// This encapsulates workflow logic so consumers don't need workflow dependencies
export { startConversationEvaluation, type StartEvaluationParams } from './services/startEvaluation';
