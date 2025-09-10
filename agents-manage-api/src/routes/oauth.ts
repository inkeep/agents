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
  type CredentialStoreRegistry,
  CredentialStoreType,
  createCredentialReference,
  dbResultToMcpTool,
  getCredentialReference,
  getToolById,
  type ServerConfig,
  updateCredentialReference,
  updateTool,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';
import { oauthService, retrievePKCEVerifier } from '../utils/oauth-service';

type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('oauth-callback');

// OAuth callback endpoint schema
const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

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
      logger.info('Exchanging authorization code for access token');

      // Convert database result to McpTool (using helper function)
      const mcpTool = dbResultToMcpTool(tool);

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

      // Store access token in keychain
      const credentialStores = c.get('credentialStores');
      const keychainStore = credentialStores.get('keychain-default');
      const keychainKey = `oauth_token_${toolId}`;
      await keychainStore?.set(keychainKey, JSON.stringify(tokens));

      const credentialId = tool.name;

      const existingCredential = await getCredentialReference(dbClient)({
        scopes: { tenantId, projectId },
        id: credentialId,
      });

      const credentialData = {
        type: CredentialStoreType.keychain,
        credentialStoreId: 'keychain-default',
        retrievalParams: {
          key: keychainKey,
        },
      };

      let credential: any;
      if (existingCredential) {
        // Update existing credential
        logger.info({ credentialId: existingCredential.id }, 'Updating existing credential');
        credential = await updateCredentialReference(dbClient)({
          scopes: { tenantId, projectId },
          id: existingCredential.id,
          data: credentialData,
        });
      } else {
        // Create new credential
        logger.info('Creating new credential');
        credential = await createCredentialReference(dbClient)({
          tenantId,
          projectId,
          id: credentialId,
          ...credentialData,
        });
      }

      if (!credential) {
        throw new Error('Failed to create or update credential');
      }

      // Update MCP tool to link the credential
      await updateTool(dbClient)({
        scopes: { tenantId, projectId },
        toolId,
        data: {
          credentialReferenceId: credential.id,
        },
      });

      logger.info({ toolId, credentialId: credential.id }, 'OAuth flow completed successfully');

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
