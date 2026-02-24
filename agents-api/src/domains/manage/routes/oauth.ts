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

import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AgentsManageDatabaseClient,
  type CredentialReferenceApiInsert,
  CredentialReferenceApiSelectSchema,
  CredentialStoreType,
  createCredentialReference,
  generateId,
  getCredentialReferenceWithResources,
  getInProcessFetch,
  getProjectMainResolvedRef,
  getToolById,
  OAuthCallbackQuerySchema,
  updateTool,
  withRef,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import manageDbClient from '../../../data/db/manageDbClient';
import manageDbPool from '../../../data/db/manageDbPool';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import { oauthService, retrievePKCEVerifier } from '../../../utils/oauthService';

/**
 * Find existing credential or create a new one (idempotent operation)
 */
async function findOrCreateCredential(
  db: AgentsManageDatabaseClient,
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

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
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

// MCP OAuth callback endpoint (for direct MCP tool OAuth flows)
// Secured via PKCE state parameter, not HTTP authentication (external redirect from OAuth provider)
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/callback',
    summary: 'MCP OAuth authorization callback',
    description:
      'Handles OAuth authorization codes for MCP tools and completes the authentication flow. ' +
      'Secured via PKCE state parameter (not HTTP authentication) since this is an external redirect from an OAuth provider.',
    operationId: 'mcp-oauth-callback',
    tags: ['OAuth'],
    permission: noAuth(),
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
        redirectAfter,
        userId,
      } = pkceData;

      // Resolve the project's main branch (tenant/project come from PKCE state, not query params)
      const resolvedRef = await getProjectMainResolvedRef(manageDbClient)(tenantId, projectId);

      const tool = await withRef(manageDbPool, resolvedRef, (db) =>
        getToolById(db)({
          scopes: { tenantId, projectId },
          toolId,
        })
      );
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
      // For user-scoped credentials, include userId in the key to avoid collisions
      const credentialTokenKey = userId
        ? `oauth_token_${toolId}_${userId}`
        : `oauth_token_${toolId}`;
      let newCredentialData: CredentialReferenceApiInsert | undefined;

      const keychainStore = credentialStores.get('keychain-default');
      if (keychainStore) {
        try {
          await keychainStore.set(credentialTokenKey, JSON.stringify(tokens));
          newCredentialData = {
            id: generateId(),
            name: userId ? `${tool.name} (user)` : tool.name,
            type: CredentialStoreType.keychain,
            credentialStoreId: 'keychain-default',
            retrievalParams: {
              key: credentialTokenKey,
            },
            ...(userId && { toolId, userId }),
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

      const commitOptions = {
        commit: true,
        commitMessage: `OAuth: Link credential to tool ${toolId}`,
        author: { name: 'oauth-callback', email: 'api@inkeep.com' },
      };

      // Create credential and update tool in a single withRef scope with auto-commit
      const isUserScoped = !!userId;
      const newCredential = await withRef(
        manageDbPool,
        resolvedRef,
        async (db) => {
          const credential = await findOrCreateCredential(
            db,
            tenantId,
            projectId,
            newCredentialData
          );

          // Only link credential to tool for project-scoped credentials.
          // User-scoped credentials are looked up by (toolId, userId) at runtime.
          if (!isUserScoped) {
            await updateTool(db)({
              scopes: { tenantId, projectId },
              toolId,
              data: {
                credentialReferenceId: credential.id,
              },
            });
          }

          return credential;
        },
        commitOptions
      );

      logger.info(
        { toolId, credentialId: newCredential.id, isUserScoped, userId },
        'OAuth flow completed successfully'
      );

      // Fire-and-forget: trigger auto-continue for any pending conversations
      if (userId) {
        getInProcessFetch()('/run/api/internal/tool-auth-completed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, toolId, tenantId, projectId }),
        }).catch((err) => logger.warn({ err }, 'Failed to trigger tool-auth-completed'));
      }

      // Redirect to manage UI when redirectAfter is present, otherwise show close-popup HTML
      if (redirectAfter) {
        return c.redirect(redirectAfter, 302);
      }

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
