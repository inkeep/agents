import { OpenAPIHono } from '@hono/zod-openapi';
import tokenExchangeRoutes from './routes/tokenExchange';

export function createGithubRoutes() {
  const app = new OpenAPIHono();

  app.route('/token-exchange', tokenExchangeRoutes);

  return app;
}

export const githubRoutes = createGithubRoutes();
