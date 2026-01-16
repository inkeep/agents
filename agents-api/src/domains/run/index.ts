import { OpenAPIHono } from '@hono/zod-openapi';

import type { AppVariables } from '../../types';

export function createRunRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // TODO: Import and mount routes from agents-run-api
  // These will be migrated incrementally from agents-run-api/src/routes/

  return app;
}

export const runRoutes = createRunRoutes();
