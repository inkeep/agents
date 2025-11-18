import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, ServerConfig } from '@inkeep/agents-core';
import {
  commonGetErrorResponses,
  TenantProjectParamsSchema,
  ThirdPartyMCPServerResponse,
} from '@inkeep/agents-core';
import { z } from 'zod';
import { fetchSingleComposioServer } from '../utils/composio-service';

type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const ThirdPartyMCPServerBodySchema = z.object({
  url: z.url().describe('The MCP server URL to fetch details for'),
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Get Third-Party MCP Server Details',
    operationId: 'get-third-party-mcp-server',
    tags: ['Third-Party MCP Servers'],
    description:
      'Fetch details for a specific third-party MCP server (e.g., Composio) including authentication status and connect URL',
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
    const { url } = c.req.valid('json');

    const server = await fetchSingleComposioServer(tenantId, projectId, url);

    return c.json({
      data: server,
    });
  }
);

export default app;

