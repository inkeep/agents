import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppVariables } from '../../types';
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import chatDataRoutes from './routes/chatDataStream';
import internalRoutes from './routes/internal';
import mcpRoutes from './routes/mcp';
import webhookRoutes from './routes/webhooks';

export function createRunRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  app.route('/v1/chat', chatRoutes);
  app.route('/api', chatDataRoutes);
  app.route('/api/internal', internalRoutes);
  app.route('/v1/mcp', mcpRoutes);
  app.route('/agents', agentRoutes);
  app.route('/', webhookRoutes);

  return app;
}

export const runRoutes = createRunRoutes();
