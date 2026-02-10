import {
  createApiError,
  findWorkAppSlackUserMappingByInkeepUserId,
  getUserOrganizationsFromDb,
  OrgRoles,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { checkUserIsChannelMember, getSlackClient } from '../services/client';
import { findWorkspaceConnectionByTeamId } from '../services/nango';
import type { ManageAppVariables } from '../types';

const logger = getLogger('slack-permissions');

/**
 * Check if user has admin role (owner or admin)
 */
export function isOrgAdmin(tenantRole: string | undefined): boolean {
  return tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
}

/**
 * Resolve tenantId and tenantRole from a Slack teamId.
 * Looks up the workspace connection to find the owning tenant,
 * then checks the user's org membership to determine their role.
 *
 * This is needed because /work-apps/* routes don't go through requireTenantAccess
 * middleware (which normally sets tenantRole on /manage/* routes).
 */
async function resolveWorkAppTenantContext(c: Context, teamId: string, userId: string) {
  const workspace = await findWorkspaceConnectionByTeamId(teamId);
  if (!workspace?.tenantId) {
    throw createApiError({
      code: 'not_found',
      message: 'Slack workspace not found or not associated with a tenant',
      instance: c.req.path,
    });
  }

  const userOrganizations = await getUserOrganizationsFromDb(runDbClient)(userId);
  const orgAccess = userOrganizations.find((org) => org.organizationId === workspace.tenantId);

  if (!orgAccess) {
    throw createApiError({
      code: 'forbidden',
      message: 'Access denied to this organization',
      instance: c.req.path,
    });
  }

  c.set('tenantId', workspace.tenantId);
  c.set('tenantRole', orgAccess.role);
}

/**
 * Middleware that requires Inkeep org admin/owner role.
 * Use for workspace-level settings that only Inkeep organization admins can modify.
 */
export const requireWorkspaceAdmin = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>() =>
  createMiddleware<Env>(async (c: Context, next: Next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    if (isTestEnvironment) {
      await next();
      return;
    }

    const userId = c.get('userId');

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User context not found',
        instance: c.req.path,
      });
    }

    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    // Resolve tenant context from teamId for session-based users
    const teamId = c.req.param('teamId') || c.req.param('workspaceId');
    if (teamId && !c.get('tenantId')) {
      await resolveWorkAppTenantContext(c, teamId, userId);
    }

    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    if (!tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Organization context not found',
        instance: c.req.path,
      });
    }

    if (!isOrgAdmin(tenantRole)) {
      throw createApiError({
        code: 'forbidden',
        message: 'Only organization administrators can modify workspace settings',
        instance: c.req.path,
        extensions: {
          requiredRole: 'admin or owner',
          currentRole: tenantRole,
        },
      });
    }

    await next();
  });

/**
 * Middleware that requires either:
 * 1. Org admin/owner role (can modify any channel), OR
 * 2. Member role AND membership in the specific Slack channel
 *
 * Use for channel-level settings where members can configure their own channels.
 */
export const requireChannelMemberOrAdmin = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>() =>
  createMiddleware<Env>(async (c: Context, next: Next) => {
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    if (isTestEnvironment) {
      await next();
      return;
    }

    const userId = c.get('userId');

    if (!userId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User context not found',
        instance: c.req.path,
      });
    }

    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    // Resolve tenant context from teamId for session-based users
    const teamId = c.req.param('teamId');
    if (teamId && !c.get('tenantId')) {
      await resolveWorkAppTenantContext(c, teamId, userId);
    }

    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    if (!tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Organization context not found',
        instance: c.req.path,
      });
    }

    // Admins can modify any channel
    if (isOrgAdmin(tenantRole)) {
      await next();
      return;
    }

    // For members, verify they are in the Slack channel
    const channelId = c.req.param('channelId');

    if (!teamId || !channelId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Team ID and Channel ID are required',
        instance: c.req.path,
      });
    }

    // Get the user's Slack mappings and find the one for this workspace
    const userMappings = await findWorkAppSlackUserMappingByInkeepUserId(runDbClient)(userId);
    const userMapping = userMappings.find(
      (m) => m.tenantId === tenantId && m.slackTeamId === teamId
    );

    if (!userMapping) {
      throw createApiError({
        code: 'forbidden',
        message:
          'You must link your Slack account to modify channel settings. Use /inkeep link in Slack.',
        instance: c.req.path,
      });
    }

    // Get workspace connection to get bot token
    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace?.botToken) {
      throw createApiError({
        code: 'not_found',
        message: 'Slack workspace not found or not properly configured',
        instance: c.req.path,
      });
    }

    // Check if user is a member of the channel
    const slackClient = getSlackClient(workspace.botToken);
    const isMember = await checkUserIsChannelMember(
      slackClient,
      channelId,
      userMapping.slackUserId
    );

    if (!isMember) {
      logger.info(
        { userId, slackUserId: userMapping.slackUserId, channelId, teamId },
        'User is not a member of the channel'
      );
      throw createApiError({
        code: 'forbidden',
        message: 'You can only configure channels you are a member of',
        instance: c.req.path,
        extensions: {
          channelId,
          reason: 'not_channel_member',
        },
      });
    }

    logger.debug(
      { userId, slackUserId: userMapping.slackUserId, channelId, teamId },
      'User verified as channel member'
    );

    await next();
  });
