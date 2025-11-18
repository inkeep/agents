import { createEvaluationHono } from './app';

const app = createEvaluationHono();

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createEvaluationHono };
