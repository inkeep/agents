import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  fetchSingleComposioServer,
  getComposioOAuthRedirectUrl,
  TenantProjectParamsSchema,
  ThirdPartyMCPServerResponse,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const ThirdPartyMCPServerBodySchema = z.object({
  url: z.url().describe('The MCP server URL to fetch details for'),
  credentialScope: z.enum(['project', 'user']).default('project').optional(),
});

const GetOAuthRedirectBodySchema = z.object({
  url: z.url().describe('The MCP server URL'),
  credentialScope: z.enum(['project', 'user']).describe('The credential scope'),
});

const OAuthRedirectResponse = z.object({
  data: z.object({
    redirectUrl: z.string().nullable(),
  }),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Get Third-Party MCP Server Details',
    operationId: 'get-third-party-mcp-server',
    tags: ['Third-Party MCP Servers'],
    description:
      'Fetch details for a specific third-party MCP server (e.g., Composio) including authentication status and connect URL',
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ThirdPartyMCPServerBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Third-party MCP server details',
        content: {
          'application/json': {
            schema: ThirdPartyMCPServerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { url, credentialScope } = c.req.valid('json');
    const userId = c.get('userId');

    const server = await fetchSingleComposioServer(
      tenantId,
      projectId,
      url,
      credentialScope ?? 'project',
      userId
    );

    return c.json({
      data: server,
    });
  }
);

// Get OAuth redirect URL for a third-party MCP server based on credential scope
app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/oauth-redirect',
    summary: 'Get OAuth Redirect URL',
    operationId: 'get-oauth-redirect-url',
    tags: ['Third-Party MCP Servers'],
    description:
      'Get the OAuth redirect URL for a third-party MCP server. Call this after scope selection to get the correct URL for the selected scope.',
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: GetOAuthRedirectBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OAuth redirect URL',
        content: {
          'application/json': {
            schema: OAuthRedirectResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { url, credentialScope } = c.req.valid('json');
    const userId = c.get('userId');

    if (credentialScope === 'user' && !userId) {
      throw createApiError({
        code: 'bad_request',
        message: 'User ID required for user-scoped credentials',
      });
    }

    const redirectUrl = await getComposioOAuthRedirectUrl(
      tenantId,
      projectId,
      url,
      credentialScope,
      userId
    );

    return c.json({
      data: { redirectUrl },
    });
  }
);

export default app;
