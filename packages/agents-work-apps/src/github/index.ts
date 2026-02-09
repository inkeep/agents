import { Hono } from 'hono';
import { validateGitHubAppConfigOnStartup, validateGitHubWebhookConfigOnStartup } from './config';
import mcpRoutes from './mcp/index';
import setupRoutes from './routes/setup';
import tokenExchangeRoutes from './routes/tokenExchange';
import webhooksRoutes from './routes/webhooks';

export function createGithubRoutes() {
  validateGitHubAppConfigOnStartup();
  validateGitHubWebhookConfigOnStartup();

  const app = new Hono();

  app.route('/token-exchange', tokenExchangeRoutes);
  app.route('/setup', setupRoutes);
  app.route('/webhooks', webhooksRoutes);
  app.route('/mcp', mcpRoutes);

  return app;
}

export const githubRoutes = createGithubRoutes();

export * from './config';
export * from './installation';
export * from './routes/setup';
export * from './routes/tokenExchange';
export * from './routes/webhooks';
