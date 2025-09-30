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
  dbResultToMcpTool,
  getCredentialReferenceWithTools,
  getToolById,
  type ServerConfig,
  updateTool,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { oauthService, retrievePKCEVerifier } from '../utils/oauth-service';

/**
 * Find existing credential or create a new one (idempotent operation)
 */
async function findOrCreateCredential(
  tenantId: string,
  projectId: string,
  credentialData: CredentialReferenceApiInsert
) {
  try {
    // Try to find existing credential first
    const existingCredential = await getCredentialReferenceWithTools(dbClient)({
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

  // Create new credential
  try {
    const credential = await createCredentialReference(dbClient)({
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
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('oauth-callback');

// OAuth login endpoint schema
const OAuthLoginQuerySchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  projectId: z.string().min(1, 'Project ID is required'),
  toolId: z.string().min(1, 'Tool ID is required'),
});

// OAuth callback endpoint schema
const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

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

    try {
      // 1. Get the tool
      const tool = await getToolById(dbClient)({ scopes: { tenantId, projectId }, toolId });

      if (!tool) {
        logger.error({ toolId, tenantId, projectId }, 'Tool not found for OAuth login');
        return c.text('Tool not found', 404);
      }

      const credentialStores = c.get('credentialStores');
      const mcpTool = await dbResultToMcpTool(tool, dbClient, credentialStores);

      // 2. Initiate OAuth flow using centralized service
      const { redirectUrl } = await oauthService.initiateOAuthFlow({
        tool: mcpTool,
        tenantId,
        projectId,
        toolId,
      });

      // 3. Immediate redirect
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
    try {
      const { code, state, error, error_description } = c.req.valid('query');

      logger.info({ state, hasCode: !!code }, 'OAuth callback received');

      // Check for OAuth errors
      if (error) {
        logger.error({ error, error_description }, 'OAuth authorization failed');
        const errorMessage = 'OAuth Authorization Failed. Please try again.';
        return c.text(errorMessage, 400);
      }

      // Retrieve PKCE verifier and tool info
      const pkceData = retrievePKCEVerifier(state);
      if (!pkceData) {
        logger.error({ state }, 'Invalid or expired OAuth state');
        return c.text(
          'OAuth Session Expired: The OAuth session has expired or is invalid. Please try again.',
          400
        );
      }

      const { codeVerifier, toolId, tenantId, projectId, clientId } = pkceData;

      // Get the MCP tool
      const tool = await getToolById(dbClient)({
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

      // Convert database result to McpTool (using helper function)
      const mcpTool = await dbResultToMcpTool(tool, dbClient, credentialStores);

      const { tokens } = await oauthService.exchangeCodeForTokens({
        code,
        codeVerifier,
        clientId,
        tool: mcpTool,
      });

      logger.info(
        { toolId, tokenType: tokens.token_type, hasRefresh: !!tokens.refresh_token },
        'Token exchange successful'
      );

      // Store access token in keychain, or fall back to nango
      const credentialTokenKey = `oauth_token_${toolId}`;
      let newCredentialData: CredentialReferenceApiInsert | undefined;

      const keychainStore = credentialStores.get('keychain-default');
      if (keychainStore) {
        try {
          await keychainStore.set(credentialTokenKey, JSON.stringify(tokens));
          newCredentialData = {
            id: mcpTool.name,
            type: CredentialStoreType.keychain,
            credentialStoreId: 'keychain-default',
            retrievalParams: {
              key: credentialTokenKey,
            },
          };
        } catch {
          // Fall through to Nango fallback
        }
      }

      if (!newCredentialData && process.env.NANGO_SECRET_KEY) {
        const nangoStore = credentialStores.get('nango-default');
        await nangoStore?.set(credentialTokenKey, JSON.stringify(tokens));
        newCredentialData = {
          id: mcpTool.name,
          type: CredentialStoreType.nango,
          credentialStoreId: 'nango-default',
          retrievalParams: {
            connectionId: credentialTokenKey,
            providerConfigKey: credentialTokenKey,
            provider: 'private-api-bearer',
            authMode: 'API_KEY',
          },
        };
      }

      if (!newCredentialData) {
        throw new Error('No credential store found');
      }

      const newCredential = await findOrCreateCredential(tenantId, projectId, newCredentialData);

      // Update MCP tool to link the credential
      await updateTool(dbClient)({
        scopes: { tenantId, projectId },
        toolId,
        data: {
          credentialReferenceId: newCredential.id,
        },
      });

      logger.info({ toolId, credentialId: newCredential.id }, 'OAuth flow completed successfully');

      // Show simple success page that auto-closes the tab
      const successPage = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Complete</title>
          <meta charset="utf-8">
        </head>
        <body>
          <p>Authentication successful. Closing in <span id="countdown">3</span> seconds...</p>
          <script>
            let countdown = 3;
            const countdownEl = document.getElementById('countdown');
            
            // Notify parent window of successful authentication
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'oauth-success', 
                toolId: '${toolId}' 
              }, '*');
            }
            
            const timer = setInterval(() => {
              countdown--;
              countdownEl.textContent = countdown;
              
              if (countdown <= 0) {
                clearInterval(timer);
                window.close();
              }
            }, 1000);
            
            // Also try to close immediately for some browsers
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `;

      return c.html(successPage);
    } catch (error) {
      logger.error({ error }, 'OAuth callback processing failed');

      const errorMessage = 'OAuth Processing Failed. Please try again.';
      return c.text(errorMessage, 500);
    }
  }
);

export default app;
