import { swaggerUI } from '@hono/swagger-ui';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Env } from 'hono';

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
            : `http://localhost:3002`;
      // : env.INKEEP_AGENTS_API_URL;

      const document = app.getOpenAPIDocument({
        openapi: '3.0.0',
        info: {
          title: 'Inkeep Agents API',
          version: '1.0.0',
          description: 'REST API for the Inkeep Agent Framework.',
        },
        servers: [
          {
            url: serverUrl,
            description: 'API Server',
          },
        ],
        tags: [
          {
            name: 'Agent',
            description: 'Operations for managing individual agents',
          },
          {
            name: 'Agent Artifact Component Relations',
            description: 'Operations for managing agent artifact component relationships',
          },
          {
            name: 'Agent Data Component Relations',
            description: 'Operations for managing agent data component relationships',
          },
          {
            name: 'Agents',
            description: 'Operations for managing agents',
          },
          {
            name: 'API Keys',
            description: 'Operations for managing API keys',
          },
          {
            name: 'Artifact Component',
            description: 'Operations for managing artifact components',
          },
          {
            name: 'Context Config',
            description: 'Operations for managing context configurations',
          },
          {
            name: 'Credential',
            description: 'Operations for managing credentials',
          },
          {
            name: 'Credential Store',
            description: 'Operations for managing credential stores',
          },
          {
            name: 'Data Component',
            description: 'Operations for managing data components',
          },
          {
            name: 'External Agents',
            description: 'Operations for managing external agents',
          },
          {
            name: 'Full Agent',
            description: 'Operations for managing complete agent definitions',
          },
          {
            name: 'Full Project',
            description: 'Operations for managing complete project definitions',
          },
          {
            name: 'Function Tools',
            description: 'Operations for managing function tools',
          },
          {
            name: 'Functions',
            description: 'Operations for managing functions',
          },
          {
            name: 'OAuth',
            description: 'OAuth authentication endpoints for MCP tools',
          },
          {
            name: 'Projects',
            description: 'Operations for managing projects',
          },
          {
            name: 'Sub Agent External Agent Relations',
            description: 'Operations for managing sub agent external agent relationships',
          },
          {
            name: 'Sub Agent Relations',
            description: 'Operations for managing sub agent relationships',
          },
          {
            name: 'Sub Agent Team Agent Relations',
            description: 'Operations for managing sub agent team agent relationships',
          },
          {
            name: 'SubAgent',
            description: 'Operations for managing sub agents',
          },
          {
            name: 'SubAgent Tool Relations',
            description: 'Operations for managing sub agent tool relationships',
          },
          {
            name: 'Tools',
            description: 'Operations for managing MCP tools',
          },
        ],
      });

      // Add security schemes and global security requirements
      //TODO: this is a copy from agents-manage-api
      document.components = {
        ...document.components,
        securitySchemes: {
          ...(document.components?.securitySchemes || {}),
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'better-auth.session_token',
            description:
              'Session-based authentication using HTTP-only cookies. Cookies are automatically sent by browsers. For server-side requests, include cookies with names starting with "better-auth." in the Cookie header.',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'Token',
            description:
              'Bearer token authentication. Use this for API clients and service-to-service communication. Set the Authorization header to "Bearer <token>".',
          },
        },
      };

      // Set global security (applies to all routes unless overridden)
      // This allows either cookieAuth OR bearerAuth (both are valid)
      document.security = [
        {
          cookieAuth: [],
          bearerAuth: [],
        },
      ];
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
      title: 'Inkeep Agents API Documentation',
    })
  );
}
