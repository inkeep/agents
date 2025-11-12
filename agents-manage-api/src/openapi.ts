import { swaggerUI } from '@hono/swagger-ui';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Env } from 'hono';
import { env } from './env';

export function setupOpenAPIRoutes<E extends Env = Env>(app: OpenAPIHono<E>) {
  // OpenAPI specification endpoint - serves the complete API spec
  app.get('/openapi.json', (c: Context) => {
    try {
      // Support Vercel domain names:
      // - Production: Use VERCEL_PROJECT_PRODUCTION_URL (built-in Vercel env var)
      // - Preview: Use VERCEL_URL (automatically provided by Vercel)
      // - Otherwise: Fall back to configured URL
      const serverUrl =
        process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : env.INKEEP_AGENTS_MANAGE_API_URL;

      const document = app.getOpenAPIDocument({
        openapi: '3.0.0',
        info: {
          title: 'Inkeep Agents Manage API',
          version: '1.0.0',
          description: 'REST API for the management of the Inkeep Agent Framework.',
        },
        servers: [
          {
            url: serverUrl,
            description: 'API Server',
          },
        ],
      });
      return c.json(document);
    } catch (error) {
      console.error('OpenAPI document generation failed:', error);
      const errorDetails =
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : JSON.stringify(error, null, 2);
      return c.json({ error: 'Failed to generate OpenAPI document', details: errorDetails }, 500);
    }
  });

  // Swagger UI endpoint for interactive documentation
  app.get(
    '/docs',
    swaggerUI({
      url: '/openapi.json',
      title: 'Inkeep Agents Manage API Documentation',
    })
  );
}
