import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppVariables } from '../../types';
import agentRoutes from './routes/agents';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import chatDataRoutes from './routes/chatDataStream';
import conversationRoutes from './routes/conversations';
import executionsRoutes from './routes/executions';
import mcpRoutes from './routes/mcp';
import webhookRoutes from './routes/webhooks';

export function createRunRoutes() {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  app.route('/v1/chat', chatRoutes);
  app.route('/v1/conversations', conversationRoutes);
  app.route('/api', chatDataRoutes);
  app.route('/api', executionsRoutes);
  app.route('/v1/mcp', mcpRoutes);
  app.route('/agents', agentRoutes);
  app.route('/auth', authRoutes);
  app.route('/', webhookRoutes);

  return app;
}

export const runRoutes = createRunRoutes();
