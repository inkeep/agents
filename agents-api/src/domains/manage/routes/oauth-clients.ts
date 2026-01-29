import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AppVariables } from 'src/types';

const app = new OpenAPIHono<{ Variables: AppVariables }>();

/**
 * Schema for creating an OAuth client
 */
const CreateOAuthClientSchema = z.object({
  name: z.string().min(1).describe('Display name for the OAuth client'),
  redirectUris: z.array(z.string().url()).min(1).describe('Allowed redirect URIs'),
  scopes: z
    .array(z.string())
    .optional()
    .default(['openid', 'profile', 'email', 'offline_access', 'agents'])
    .describe('Allowed scopes'),
  grantTypes: z
    .array(z.enum(['authorization_code', 'refresh_token', 'client_credentials']))
    .optional()
    .default(['authorization_code', 'refresh_token'])
    .describe('Allowed grant types'),
  tokenEndpointAuthMethod: z
    .enum(['client_secret_basic', 'client_secret_post', 'none'])
    .optional()
    .default('client_secret_basic')
    .describe('Token endpoint authentication method'),
  skipConsent: z.boolean().optional().default(false).describe('Skip user consent screen'),
  uri: z.string().url().optional().describe('Client website URL'),
  icon: z.string().url().optional().describe('Client icon URL'),
});

const OAuthClientResponseSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  name: z.string().nullable(),
  redirectUris: z.array(z.string()),
  scopes: z.array(z.string()).nullable(),
  createdAt: z.string(),
});

const ListOAuthClientsResponseSchema = z.object({
  clients: z.array(
    z.object({
      clientId: z.string(),
      name: z.string().nullable(),
      uri: z.string().nullable(),
      disabled: z.boolean().nullable(),
      createdAt: z.string(),
    })
  ),
});

/**
 * Schema for public OAuth client info response
 */
const PublicOAuthClientSchema = z.object({
  client_id: z.string(),
  client_name: z.string().nullable(),
  client_uri: z.string().nullable(),
  client_icon: z.string().nullable(),
});

/**
 * GET /api/oauth-clients/public
 * Get public info about an OAuth client (for consent screen)
 * This endpoint is intentionally public - it only returns non-sensitive info
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/public',
    operationId: 'getOAuthClientPublic',
    summary: 'Get Public OAuth Client Info',
    description: 'Get public info about an OAuth client for display on consent screens.',
    tags: ['OAuth Clients'],
    request: {
      query: z.object({
        client_id: z.string().describe('The OAuth client ID'),
      }),
    },
    responses: {
      200: {
        description: 'OAuth client info',
        content: {
          'application/json': {
            schema: PublicOAuthClientSchema,
          },
        },
      },
      404: {
        description: 'Client not found',
      },
    },
  }),
  async (c) => {
    const auth = c.get('auth');
    const { client_id } = c.req.valid('query');

    if (!auth) {
      return c.json({ error: 'Auth not configured' }, 500);
    }

    try {
      const clientInfo = await auth.api.getOAuthClientPublic({
        query: { client_id },
        headers: c.req.raw.headers,
      });

      if (!clientInfo) {
        return c.json({ error: 'Client not found' }, 404);
      }

      // Return consistent snake_case response
      const info = clientInfo as Record<string, unknown>;
      return c.json({
        client_id,
        client_name: info.client_name ?? info.name ?? null,
        client_uri: info.client_uri ?? info.uri ?? null,
        client_icon: info.logo_uri ?? info.client_icon ?? info.icon ?? null,
      });
    } catch {
      return c.json({ error: 'Client not found' }, 404);
    }
  }
);

/**
 * POST /api/oauth-clients
 * Create a new OAuth client (admin only)
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    operationId: 'createOAuthClient',
    summary: 'Create OAuth Client',
    description: 'Create a new OAuth client for third-party integrations. Requires admin privileges.',
    tags: ['OAuth Clients'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateOAuthClientSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'OAuth client created successfully',
        content: {
          'application/json': {
            schema: OAuthClientResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized - must be logged in',
      },
      403: {
        description: 'Forbidden - requires admin privileges',
      },
    },
  }),
  async (c) => {
    const auth = c.get('auth');
    const user = c.get('user');
    const session = c.get('session');

    if (!auth) {
      return c.json({ error: 'Auth not configured' }, 500);
    }

    if (!user || !session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = c.req.valid('json');

    try {
      const result = await auth.api.adminCreateOAuthClient({
        body: {
          client_name: body.name,
          redirect_uris: body.redirectUris,
          scope: body.scopes?.join(' '),
          grant_types: body.grantTypes,
          token_endpoint_auth_method: body.tokenEndpointAuthMethod,
          skip_consent: body.skipConsent,
          client_uri: body.uri,
          logo_uri: body.icon,
        },
      });

      // RFC 7591 returns snake_case, map to camelCase
      const response = result as Record<string, unknown>;

      return c.json(
        {
          clientId: response.client_id ?? response.clientId,
          clientSecret: response.client_secret ?? response.clientSecret,
          name: response.client_name ?? response.name,
          redirectUris: response.redirect_uris ?? response.redirectUris,
          scopes: response.scope ? String(response.scope).split(' ') : response.scopes,
          createdAt:
            response.created_at instanceof Date
              ? response.created_at.toISOString()
              : response.createdAt instanceof Date
                ? response.createdAt.toISOString()
                : new Date().toISOString(),
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create OAuth client';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * GET /api/oauth-clients
 * List all OAuth clients (admin only)
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    operationId: 'listOAuthClients',
    summary: 'List OAuth Clients',
    description: 'List all OAuth clients. Requires admin privileges.',
    tags: ['OAuth Clients'],
    responses: {
      200: {
        description: 'List of OAuth clients',
        content: {
          'application/json': {
            schema: ListOAuthClientsResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
      },
    },
  }),
  async (c) => {
    const auth = c.get('auth');
    const user = c.get('user');

    if (!auth) {
      return c.json({ error: 'Auth not configured' }, 500);
    }

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const result = await auth.api.getOAuthClients({
        headers: c.req.raw.headers,
      });

      const clients = (result ?? []).map((client: any) => ({
        clientId: client.clientId,
        name: client.name,
        uri: client.uri,
        disabled: client.disabled,
        createdAt: client.createdAt?.toISOString() ?? new Date().toISOString(),
      }));

      return c.json({ clients });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list OAuth clients';
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * DELETE /api/oauth-clients/:clientId
 * Delete an OAuth client (admin only)
 */
app.openapi(
  createRoute({
    method: 'delete',
    path: '/:clientId',
    operationId: 'deleteOAuthClient',
    summary: 'Delete OAuth Client',
    description: 'Delete an OAuth client. Requires admin privileges.',
    tags: ['OAuth Clients'],
    request: {
      params: z.object({
        clientId: z.string(),
      }),
    },
    responses: {
      204: {
        description: 'OAuth client deleted',
      },
      401: {
        description: 'Unauthorized',
      },
      404: {
        description: 'Client not found',
      },
    },
  }),
  async (c) => {
    const auth = c.get('auth');
    const user = c.get('user');
    const { clientId } = c.req.valid('param');

    if (!auth) {
      return c.json({ error: 'Auth not configured' }, 500);
    }

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      await auth.api.deleteOAuthClient({
        body: { client_id: clientId },
        headers: c.req.raw.headers,
      });

      return c.body(null, 204);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete OAuth client';
      return c.json({ error: message }, 500);
    }
  }
);

export default app;
