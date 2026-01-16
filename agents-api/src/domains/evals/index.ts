import { OpenAPIHono } from '@hono/zod-openapi';

import type { AppVariables } from '../../types';

export function createEvalRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // TODO: Import and mount routes from agents-eval-api
  // These will be migrated incrementally from agents-eval-api/src/routes/

  return app;
}

export const evalRoutes = createEvalRoutes();
