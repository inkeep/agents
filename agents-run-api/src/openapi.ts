import { swaggerUI } from '@hono/swagger-ui';
import type { Context } from 'hono';
import { env } from './env';

export function setupOpenAPIRoutes(app: any) {
  // OpenAPI specification endpoint - serves the complete API spec
  app.get('/openapi.json', (c: Context) => {
    try {
      const document = app.getOpenAPIDocument({
        openapi: '3.0.0',
        info: {
          title: 'Inkeep Agents Run API',
          version: '1.0.0',
          description:
            'Chat completions, MCP, and A2A run endpoints in the Inkeep Agent Framework.',
        },
        servers: [
          {
            url: env.AGENTS_RUN_API_URL,
            description: 'Development server',
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
      title: 'Inkeep Agents Run API Documentation',
    })
  );
}
