import { swaggerUI } from '@hono/swagger-ui';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Env } from 'hono';

export const TagToDescription = {
  Agent: 'Operations for managing individual agents',
  'Agent Artifact Component Relations':
    'Operations for managing agent artifact component relationships',
  'Agent Data Component Relations': 'Operations for managing agent data component relationships',
  Agents: 'Operations for managing agents',
  'API Keys': 'Operations for managing API keys',
  'Artifact Component': 'Operations for managing artifact components',
  'Context Config': 'Operations for managing context configurations',
  Credential: 'Operations for managing credentials',
  'Credential Store': 'Operations for managing credential stores',
  'Data Component': 'Operations for managing data components',
  'External Agents': 'Operations for managing external agents',
  'Full Agent': 'Operations for managing complete agent definitions',
  'Full Project': 'Operations for managing complete project definitions',
  'Function Tools': 'Operations for managing function tools',
  Functions: 'Operations for managing functions',
  OAuth: 'OAuth authentication endpoints for MCP tools',
  Projects: 'Operations for managing projects',
  'Sub Agent External Agent Relations':
    'Operations for managing sub agent external agent relationships',
  'Sub Agent Relations': 'Operations for managing sub agent relationships',
  'Sub Agent Team Agent Relations': 'Operations for managing sub agent team agent relationships',
  SubAgent: 'Operations for managing sub agents',
  'SubAgent Tool Relations': 'Operations for managing sub agent tool relationships',
  Tools: 'Operations for managing MCP tools',
  Workflows: 'Workflow trigger endpoints',
  UserOrganizations: 'Operations for managing user organizations',
  CLI: 'CLI authentication endpoints',
  Invitations: 'Operations for managing invitations',
};

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
        openapi: '3.1.0',
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
        tags: Object.entries(TagToDescription).map(([key, value]) => ({
          name: key,
          description: value,
        })),
      });

      // Add security schemes and global security requirements
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
