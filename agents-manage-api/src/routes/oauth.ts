/**
 * OAuth Callback Handler
 *
 * Handles OAuth 2.1 authorization code flows for MCP tools:
 * - Processes authorization codes from OAuth providers
 * - Exchanges codes for access tokens using PKCE
 * - Stores credentials in Keychain
 * - Updates MCP tool status
 * - Redirects users back to frontend
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialReferenceApiInsert,
  CredentialReferenceApiSelectSchema,
  type CredentialStoreRegistry,
  CredentialStoreType,
  createCredentialReference,
  type DatabaseClient,
  generateId,
  getCredentialReferenceWithResources,
  getToolById,
  OAuthCallbackQuerySchema,
  OAuthLoginQuerySchema,
  type ServerConfig,
  updateTool,
} from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { oauthService, retrievePKCEVerifier } from '../utils/oauth-service';

/**
 * Find existing credential or create a new one (idempotent operation)
 */
async function findOrCreateCredential(
  db: DatabaseClient,
  tenantId: string,
  projectId: string,
  credentialData: CredentialReferenceApiInsert
) {
  try {
    // Try to find existing credential first
    const existingCredential = await getCredentialReferenceWithResources(db)({
      scopes: { tenantId, projectId },
      id: credentialData.id,
    });

    if (existingCredential) {
      const validatedCredential = CredentialReferenceApiSelectSchema.parse(existingCredential);
      return validatedCredential;
    }
  } catch {
    // Credential not found, continue with creation
  }

  try {
    const credential = await createCredentialReference(db)({
      ...credentialData,
      tenantId,
      projectId,
    });

    const validatedCredential = CredentialReferenceApiSelectSchema.parse(credential);
    return validatedCredential;
  } catch (error) {
    console.error('Failed to save credential to database:', error);
    throw new Error(`Failed to save credential '${credentialData.id}' to database`);
  }
}

type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  db: DatabaseClient;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('oauth-callback');

/**
 * Extract base URL from request context
 */
function getBaseUrlFromRequest(c: any): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Generate OAuth callback HTML page
 */
function generateOAuthCallbackPage(params: {
  title: string;
  message: string;
  isSuccess: boolean;
}): string {
  const { title, message, isSuccess } = params;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <style>
        body {
          background-color: #000;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        .container {
          max-width: 400px;
          padding: 2rem;
        }
        .title {
          font-size: 1.2rem;
          margin-bottom: 1rem;
        }
        .message {
          color: #ccc;
          line-height: 1.5;
        }
        .countdown {
          margin-top: 1rem;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">${title}</div>
        <div class="message">${message}</div>
        <div class="message countdown">
          ${isSuccess ? 'Closing automatically...' : ''}
        </div>
      </div>
      <script>
        ${
          isSuccess &&
          `
        // Success: Send PostMessage then auto-close
        if (window.opener) {
          try {
            window.opener.postMessage({
              type: 'oauth-success',
              timestamp: Date.now()
            }, '*');
          } catch (error) {
            console.error('PostMessage failed:', error);
          }
        }
        
        // Auto-close after brief delay
        setTimeout(() => {
          window.close();
        }, 1000);
          `
        }
      </script>
    </body>
    </html>
  `;
}

// OAuth login initiation endpoint (public - no API key required)
app.openapi(
  createRoute({
    method: 'get',
    path: '/login',
    summary: 'Initiate OAuth login for MCP tool',
    description:
      'Detects OAuth requirements and redirects to authorization server (public endpoint)',
    operationId: 'initiate-oauth-login-public',
    tags: ['OAuth'],
    request: {
      query: OAuthLoginQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to OAuth authorization server',
      },
      400: {
        description: 'OAuth not supported or configuration error',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
      404: {
        description: 'Tool not found',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, projectId, toolId } = c.req.valid('query');
    const db = c.get('db');

    try {
      const tool = await getToolById(db)({ scopes: { tenantId, projectId }, toolId });

      if (!tool) {
        logger.error({ toolId, tenantId, projectId }, 'Tool not found for OAuth login');
        return c.text('Tool not found', 404);
      }

      const baseUrl = getBaseUrlFromRequest(c);
      const { redirectUrl } = await oauthService.initiateOAuthFlow({
        tenantId,
        projectId,
        toolId,
        mcpServerUrl: tool.config.mcp.server.url,
        baseUrl,
      });

      return c.redirect(redirectUrl, 302);
    } catch (error) {
      logger.error({ toolId, tenantId, projectId, error }, 'OAuth login failed');

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to initiate OAuth login';
      return c.text(`OAuth Error: ${errorMessage}`, 500);
    }
  }
);

// OAuth callback endpoint
app.openapi(
  createRoute({
    method: 'get',
    path: '/callback',
    summary: 'OAuth authorization callback',
    description: 'Handles OAuth authorization codes and completes the authentication flow',
    operationId: 'oauth-callback',
    tags: ['OAuth'],
    request: {
      query: OAuthCallbackQuerySchema,
    },
    responses: {
      302: {
        description: 'Redirect to frontend after successful OAuth',
      },
      400: {
        description: 'OAuth error or invalid request',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'text/html': {
            schema: z.string(),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = c.get('db');
    try {
      const { code, state, error, error_description } = c.req.valid('query');

      logger.info({ state, hasCode: !!code }, 'OAuth callback received');

      // Check for OAuth errors
      if (error) {
        logger.error({ error, error_description }, 'OAuth authorization failed');
        const errorMessage =
          error_description || error || 'OAuth Authorization Failed. Please try again.';

        const errorPage = generateOAuthCallbackPage({
          title: 'Authentication Failed',
          message: errorMessage,
          isSuccess: false,
        });

        return c.html(errorPage);
      }

      // Retrieve PKCE verifier and tool info
      const pkceData = retrievePKCEVerifier(state);
      if (!pkceData) {
        logger.error({ state }, 'Invalid or expired OAuth state');

        const errorMessage =
          'OAuth Session Expired: The OAuth session has expired or is invalid. Please try again.';

        const expiredPage = generateOAuthCallbackPage({
          title: 'Session Expired',
          message: errorMessage,
          isSuccess: false,
        });

        return c.html(expiredPage);
      }

      const {
        codeVerifier,
        toolId,
        tenantId,
        projectId,
        clientInformation,
        metadata,
        resourceUrl,
      } = pkceData;

      const tool = await getToolById(db)({
        scopes: { tenantId, projectId },
        toolId,
      });
      if (!tool) {
        throw new Error(`Tool ${toolId} not found`);
      }

      logger.info({ toolId, tenantId, projectId }, 'Processing OAuth callback');

      // Exchange authorization code for access token using OAuth service
      logger.info({ toolId }, 'Exchanging authorization code for access token');

      const credentialStores = c.get('credentialStores');

      const baseUrl = getBaseUrlFromRequest(c);
      const { tokens } = await oauthService.exchangeCodeForTokens({
        code,
        codeVerifier,
        clientInformation,
        metadata,
        resourceUrl,
        mcpServerUrl: tool.config.mcp.server.url,
        baseUrl,
      });

      logger.info(
        { toolId, tokenType: tokens.token_type, hasRefresh: !!tokens.refresh_token },
        'Token exchange successful'
      );

      // Store access token in keychain.
      const credentialTokenKey = `oauth_token_${toolId}`;
      let newCredentialData: CredentialReferenceApiInsert | undefined;

      const keychainStore = credentialStores.get('keychain-default');
      if (keychainStore) {
        try {
          await keychainStore.set(credentialTokenKey, JSON.stringify(tokens));
          newCredentialData = {
            id: generateId(),
            name: tool.name,
            type: CredentialStoreType.keychain,
            credentialStoreId: 'keychain-default',
            retrievalParams: {
              key: credentialTokenKey,
            },
          };
        } catch (error) {
          logger.info(
            { error: error instanceof Error ? error.message : error },
            'Keychain store not available.'
          );
        }
      }

      if (!newCredentialData) {
        throw new Error('No credential store found');
      }

      const newCredential = await findOrCreateCredential(
        db,
        tenantId,
        projectId,
        newCredentialData
      );

      // Update MCP tool to link the credential
      await updateTool(db)({
        scopes: { tenantId, projectId },
        toolId,
        data: {
          credentialReferenceId: newCredential.id,
        },
      });

      logger.info({ toolId, credentialId: newCredential.id }, 'OAuth flow completed successfully');

      // Show simple success page that auto-closes the tab
      const successPage = generateOAuthCallbackPage({
        title: 'Authentication Complete',
        message: 'You have been successfully authenticated.',
        isSuccess: true,
      });

      return c.html(successPage);
    } catch (error) {
      logger.error({ error }, 'OAuth callback processing failed');

      const errorMessage = 'OAuth Processing Failed. Please try again.';

      const errorPage = generateOAuthCallbackPage({
        title: 'Processing Failed',
        message: errorMessage,
        isSuccess: false,
      });

      return c.html(errorPage);
    }
  }
);

export default app;
