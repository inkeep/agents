/**
 * Slack User Routes
 *
 * Endpoints for user linking:
 * - GET /link-status - Check link status
 * - POST /link/verify-token - Verify JWT link token (primary linking method)
 * - POST /connect - Create Nango session
 * - POST /disconnect - Disconnect user
 */

import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createWorkAppSlackUserMapping,
  deleteWorkAppSlackUserMapping,
  findWorkAppSlackUserMapping,
  findWorkAppSlackUserMappingByInkeepUserId,
  flushTraces,
  getWaitUntil,
  isUniqueConstraintError,
  verifySlackLinkToken,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedWorkAppsAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { createConnectSession } from '../services';
import { resumeSmartLinkIntent } from '../services/resume-intent';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-users');

/**
 * Verify the authenticated caller matches the requested userId.
 * System tokens and API keys are allowed to act on behalf of any user.
 */
function isAuthorizedForUser(
  c: { get: (key: string) => unknown },
  requestedUserId: string
): boolean {
  const sessionUserId = c.get('userId') as string | undefined;
  if (!sessionUserId) return false; // Require authentication
  if (sessionUserId === requestedUserId) return true;
  if (sessionUserId === 'system' || sessionUserId.startsWith('apikey:')) return true;
  // Dev bypass only in development/test environments
  if (
    sessionUserId === 'dev-user' &&
    (process.env.ENVIRONMENT === 'development' || process.env.ENVIRONMENT === 'test')
  ) {
    return true;
  }
  return false;
}

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/link-status',
    summary: 'Check Link Status',
    description: 'Check if a Slack user is linked to an Inkeep account',
    operationId: 'slack-link-status',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      query: z.object({
        slackUserId: z.string(),
        slackTeamId: z.string(),
        tenantId: z.string().optional().default('default'),
      }),
    },
    responses: {
      200: {
        description: 'Link status',
        content: {
          'application/json': {
            schema: z.object({
              linked: z.boolean(),
              linkId: z.string().optional(),
              linkedAt: z.string().optional(),
              slackUsername: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { slackUserId, slackTeamId, tenantId } = c.req.valid('query');

    // Verify the caller has access to this tenant
    const sessionTenantId = c.get('tenantId') as string | undefined;
    if (sessionTenantId && sessionTenantId !== tenantId) {
      return c.json({ linked: false });
    }

    const link = await findWorkAppSlackUserMapping(runDbClient)(
      tenantId,
      slackUserId,
      slackTeamId,
      'work-apps-slack'
    );

    if (link) {
      return c.json({
        linked: true,
        linkId: link.id,
        linkedAt: link.linkedAt,
        slackUsername: link.slackUsername || undefined,
      });
    }

    return c.json({ linked: false });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/link/verify-token',
    summary: 'Verify Link Token',
    description: 'Verify a JWT link token and create user mapping',
    operationId: 'slack-verify-link-token',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              token: z.string().min(1),
              userId: z.string().min(1),
              userEmail: z.string().email().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Link successful',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              linkId: z.string().optional(),
              slackUsername: z.string().optional(),
              slackTeamId: z.string().optional(),
              tenantId: z.string().optional(),
            }),
          },
        },
      },
      400: {
        description: 'Invalid or expired token',
      },
      409: {
        description: 'Account already linked',
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');

    try {
      const verifyResult = await verifySlackLinkToken(body.token);

      if (!verifyResult.valid || !verifyResult.payload) {
        const isExpired = verifyResult.error?.includes('"exp" claim timestamp check failed');
        const errorMessage = isExpired
          ? 'Token expired. Please run /inkeep link in Slack to get a new one.'
          : verifyResult.error ||
            'Invalid or expired link token. Please run /inkeep link in Slack to get a new one.';
        logger.warn({ error: verifyResult.error, isExpired }, 'Invalid link token');
        return c.json({ error: errorMessage }, 400);
      }

      const { tenantId, slack } = verifyResult.payload;
      const { teamId, userId: slackUserId, enterpriseId, username } = slack;

      const sessionUserId = c.get('userId') as string | undefined;
      const isRealSessionUser =
        sessionUserId &&
        sessionUserId !== 'dev-user' &&
        !sessionUserId.startsWith('apikey:') &&
        sessionUserId !== 'system';

      if (!isRealSessionUser) {
        logger.warn({ sessionUserId }, 'Link token verification rejected: no valid session user');
        return c.json({ error: 'Session authentication required for account linking' }, 403);
      }

      const inkeepUserId = sessionUserId;

      const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
        tenantId,
        slackUserId,
        teamId,
        'work-apps-slack'
      );

      if (existingLink && existingLink.inkeepUserId === inkeepUserId) {
        logger.info(
          { slackUserId, tenantId, inkeepUserId: body.userId },
          'Slack user already linked to same account'
        );
        return c.json({
          success: true,
          linkId: existingLink.id,
          slackUsername: existingLink.slackUsername || undefined,
          slackTeamId: teamId,
          tenantId,
        });
      }

      if (existingLink) {
        logger.info(
          {
            slackUserId,
            existingUserId: existingLink.inkeepUserId,
            newUserId: inkeepUserId,
            tenantId,
          },
          'Slack user already linked, updating to new user'
        );
        await deleteWorkAppSlackUserMapping(runDbClient)(
          tenantId,
          slackUserId,
          teamId,
          'work-apps-slack'
        );
      }

      const slackUserMapping = await createWorkAppSlackUserMapping(runDbClient)({
        tenantId,
        clientId: 'work-apps-slack',
        slackUserId,
        slackTeamId: teamId,
        slackEnterpriseId: enterpriseId,
        slackUsername: username,
        slackEmail: body.userEmail,
        inkeepUserId: inkeepUserId,
      });

      logger.info(
        {
          slackUserId,
          slackTeamId: teamId,
          tenantId,
          inkeepUserId: body.userId,
          linkId: slackUserMapping.id,
        },
        'Successfully linked Slack user to Inkeep account via JWT token'
      );

      const { intent } = verifyResult.payload;
      if (intent) {
        logger.info(
          {
            event: 'smart_link_intent_resume_triggered',
            entryPoint: intent.entryPoint,
            questionLength: intent.question.length,
          },
          'Smart link intent detected in verify-token'
        );

        const resumeWork = resumeSmartLinkIntent({
          intent,
          teamId,
          slackUserId,
          inkeepUserId,
          tenantId,
          slackEnterpriseId: enterpriseId,
          slackUsername: username,
        })
          .catch((error) => logger.error({ error }, 'Resume smart link intent failed'))
          .finally(() => flushTraces());

        const waitUntil = await getWaitUntil();
        if (waitUntil) {
          waitUntil(resumeWork);
        } else {
          logger.warn(
            { entryPoint: intent.entryPoint },
            'waitUntil not available, resume work may not complete'
          );
        }
      }

      return c.json({
        success: true,
        linkId: slackUserMapping.id,
        slackUsername: username || undefined,
        slackTeamId: teamId,
        tenantId,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        logger.info({ userId: body.userId }, 'Concurrent link resolved — mapping already exists');
        return c.json({ success: true });
      }

      logger.error({ error, userId: body.userId }, 'Failed to verify link token');
      return c.json({ error: 'Failed to verify link. Please try again.' }, 500);
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/connect',
    summary: 'Create Nango Connect Session',
    description: 'Create a Nango session for Slack OAuth flow. Used by the dashboard.',
    operationId: 'slack-user-connect',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userId: z.string().describe('Inkeep user ID'),
              userEmail: z.string().optional().describe('User email'),
              userName: z.string().optional().describe('User display name'),
              tenantId: z.string().optional().describe('Tenant ID'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Connect session created',
        content: {
          'application/json': {
            schema: z.object({
              sessionToken: z.string().optional(),
              connectUrl: z.string().optional(),
            }),
          },
        },
      },
      400: { description: 'Missing required userId' },
      500: { description: 'Failed to create session' },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const { userId, userEmail, userName, tenantId } = body;

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    if (!isAuthorizedForUser(c, userId)) {
      return c.json({ error: 'Can only create sessions for your own account' }, 403);
    }

    logger.debug({ userId, userEmail, userName }, 'Creating Nango connect session');

    const session = await createConnectSession({
      userId,
      userEmail,
      userName,
      tenantId: tenantId || (c.get('tenantId') as string) || '',
    });

    if (!session) {
      return c.json({ error: 'Failed to create session' }, 500);
    }

    return c.json(session);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/disconnect',
    summary: 'Disconnect User',
    description: 'Unlink a Slack user from their Inkeep account.',
    operationId: 'slack-user-disconnect',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userId: z.string().optional().describe('Inkeep user ID'),
              slackUserId: z.string().optional().describe('Slack user ID'),
              slackTeamId: z.string().optional().describe('Slack team ID'),
              tenantId: z.string().optional().describe('Tenant ID'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'User disconnected',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
      400: { description: 'Missing required identifiers' },
      404: { description: 'No connection found' },
      500: { description: 'Failed to disconnect' },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');
    const { userId, slackUserId, slackTeamId, tenantId } = body;

    if (!userId && !(slackUserId && slackTeamId)) {
      return c.json({ error: 'Either userId or (slackUserId + slackTeamId) is required' }, 400);
    }

    if (userId && !isAuthorizedForUser(c, userId)) {
      return c.json({ error: 'Can only disconnect your own account' }, 403);
    }

    try {
      const effectiveTenantId = tenantId || (c.get('tenantId') as string) || '';

      if (slackUserId && slackTeamId) {
        const mapping = await findWorkAppSlackUserMapping(runDbClient)(
          effectiveTenantId,
          slackUserId,
          slackTeamId,
          'work-apps-slack'
        );

        if (!mapping) {
          return c.json({ error: 'No link found for this user' }, 404);
        }

        if (!isAuthorizedForUser(c, mapping.inkeepUserId)) {
          return c.json({ error: 'Can only disconnect your own account' }, 403);
        }

        const deleted = await deleteWorkAppSlackUserMapping(runDbClient)(
          effectiveTenantId,
          slackUserId,
          slackTeamId,
          'work-apps-slack'
        );

        if (deleted) {
          logger.info({ slackUserId, slackTeamId, tenantId: effectiveTenantId }, 'User unlinked');
          return c.json({ success: true });
        }

        return c.json({ error: 'Failed to unlink user' }, 500);
      }

      if (userId) {
        const userMappings = await findWorkAppSlackUserMappingByInkeepUserId(runDbClient)(userId);

        if (userMappings.length === 0) {
          return c.json({ error: 'No link found for this user' }, 404);
        }

        let deletedCount = 0;
        for (const mapping of userMappings) {
          const deleted = await deleteWorkAppSlackUserMapping(runDbClient)(
            mapping.tenantId,
            mapping.slackUserId,
            mapping.slackTeamId,
            'work-apps-slack'
          );
          if (deleted) deletedCount++;
        }

        logger.info({ userId, deletedCount }, 'User disconnected from Slack');
        return c.json({ success: true });
      }

      return c.json({ error: 'No connection found for this user' }, 404);
    } catch (error) {
      logger.error({ error, userId, slackUserId, slackTeamId }, 'Failed to disconnect from Slack');
      return c.json({ error: 'Failed to disconnect' }, 500);
    }
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/status',
    summary: 'Get Connection Status',
    description: 'Check if an Inkeep user has a linked Slack account.',
    operationId: 'slack-user-status',
    tags: ['Work Apps', 'Slack', 'Users'],
    permission: inheritedWorkAppsAuth(),
    request: {
      query: z.object({
        userId: z.string().describe('Inkeep user ID'),
      }),
    },
    responses: {
      200: {
        description: 'Connection status',
        content: {
          'application/json': {
            schema: z.object({
              connected: z.boolean(),
              connection: z
                .object({
                  connectionId: z.string(),
                  appUserId: z.string(),
                  appUserEmail: z.string(),
                  slackDisplayName: z.string(),
                  linkedAt: z.string(),
                  tenantId: z.string(),
                  slackUserId: z.string(),
                  slackTeamId: z.string(),
                })
                .nullable(),
            }),
          },
        },
      },
      400: { description: 'Missing userId' },
      500: { description: 'Failed to get status' },
    },
  }),
  async (c) => {
    const { userId: appUserId } = c.req.valid('query');

    if (!isAuthorizedForUser(c, appUserId)) {
      return c.json({ error: 'Can only query your own connection status' }, 403);
    }

    try {
      const userMappings = await findWorkAppSlackUserMappingByInkeepUserId(runDbClient)(appUserId);

      if (userMappings.length === 0) {
        logger.debug({ appUserId, connected: false }, 'Retrieved connection status from DB');
        return c.json({ connected: false, connection: null });
      }

      const mostRecent = userMappings.sort(
        (a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime()
      )[0];

      const connection = {
        connectionId: mostRecent.id,
        appUserId: mostRecent.inkeepUserId,
        appUserEmail: mostRecent.slackEmail || '',
        slackDisplayName: mostRecent.slackUsername || '',
        linkedAt: mostRecent.linkedAt,
        tenantId: mostRecent.tenantId,
        slackUserId: mostRecent.slackUserId,
        slackTeamId: mostRecent.slackTeamId,
      };

      logger.debug({ appUserId, connected: true }, 'Retrieved connection status from DB');

      return c.json({ connected: true, connection });
    } catch (error) {
      logger.error({ error, appUserId }, 'Failed to get connection status');
      return c.json({ error: 'Failed to get connection status' }, 500);
    }
  }
);

export default app;
