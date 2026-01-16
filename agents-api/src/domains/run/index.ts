import { OpenAPIHono } from '@hono/zod-openapi';
import chatRoutes from './routes/chat';
import chatDataRoutes from './routes/chatDataStream';
import mcpRoutes from './routes/mcp';
import agentRoutes from './routes/agents';
import type { AppVariables } from '../../types';

export function createRunRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  app.route('/v1/chat', chatRoutes);
  app.route('/api', chatDataRoutes);
  app.route('/v1/mcp', mcpRoutes);
  app.route('/agents', agentRoutes);

  return app;
}

export const runRoutes = createRunRoutes();
