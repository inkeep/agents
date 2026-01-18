import { OpenAPIHono } from '@hono/zod-openapi';

import type { AppVariables } from '../../types';
import triggerRoutes from './routes';

export function createEvalRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  app.route('/tenants/:tenantId/projects/:projectId/', triggerRoutes);

  return app;
}

export const evalRoutes = createEvalRoutes();
