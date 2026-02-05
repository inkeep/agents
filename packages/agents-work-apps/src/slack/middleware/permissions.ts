import {
  createApiError,
  findWorkAppSlackUserMappingByInkeepUserId,
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
 * Middleware that requires org admin/owner role.
 * Use for workspace-level settings that only admins can modify.
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
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization context not found',
        instance: c.req.path,
      });
    }

    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    if (!isOrgAdmin(tenantRole)) {
      throw createApiError({
        code: 'forbidden',
        message: 'Only workspace administrators can modify workspace settings',
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
    const tenantId = c.get('tenantId');
    const tenantRole = c.get('tenantRole');

    if (!userId || !tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'User or organization context not found',
        instance: c.req.path,
      });
    }

    if (userId === 'system' || userId.startsWith('apikey:')) {
      await next();
      return;
    }

    // Admins can modify any channel
    if (isOrgAdmin(tenantRole)) {
      await next();
      return;
    }

    // For members, verify they are in the Slack channel
    const teamId = c.req.param('teamId');
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
