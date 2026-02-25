import type { SlackLinkIntent } from '@inkeep/agents-core';
import {
  createInvitationInDb,
  findWorkAppSlackWorkspaceByTeamId,
  getOrganizationMemberByEmail,
  getPendingInvitationsByEmail,
  signSlackLinkToken,
} from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import { createCreateInkeepAccountMessage, createSmartLinkMessage } from './blocks';
import { getSlackClient } from './client';

const logger = getLogger('slack-link-prompt');

const LINK_CODE_TTL_MINUTES = 10;

export type LinkPromptResult =
  | { type: 'auto_invite'; url: string; email: string; expiresInMinutes: number }
  | { type: 'jwt_link'; url: string; expiresInMinutes: number };

export interface ResolveLinkActionParams {
  tenantId: string;
  teamId: string;
  slackUserId: string;
  botToken: string;
  slackEnterpriseId?: string;
  slackUsername?: string;
  intent?: SlackLinkIntent;
}

export async function resolveUnlinkedUserAction(
  params: ResolveLinkActionParams
): Promise<LinkPromptResult> {
  const { tenantId, teamId, slackUserId, botToken, slackEnterpriseId, slackUsername, intent } =
    params;
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  const autoInvite = await tryAutoInvite({ tenantId, teamId, slackUserId, botToken });

  if (autoInvite) {
    const linkToken = await signSlackLinkToken({
      tenantId,
      slackTeamId: teamId,
      slackUserId,
      slackEnterpriseId,
      slackUsername,
      intent,
    });

    const authMethod = autoInvite.authMethod;

    const linkReturnUrl = `/link?token=${encodeURIComponent(linkToken)}`;
    const acceptUrl =
      authMethod === 'email-password'
        ? `${manageUiUrl}/accept-invitation/${autoInvite.invitationId}?email=${encodeURIComponent(autoInvite.email)}&returnUrl=${encodeURIComponent(linkReturnUrl)}`
        : `${manageUiUrl}/login?invitation=${encodeURIComponent(autoInvite.invitationId)}&returnUrl=${encodeURIComponent(linkReturnUrl)}&email=${encodeURIComponent(autoInvite.email)}&authMethod=${encodeURIComponent(authMethod)}`;

    logger.info(
      { invitationId: autoInvite.invitationId, email: autoInvite.email, hasIntent: !!intent },
      'Directing unlinked user to accept-invitation page'
    );

    return {
      type: 'auto_invite',
      url: acceptUrl,
      email: autoInvite.email,
      expiresInMinutes: LINK_CODE_TTL_MINUTES,
    };
  }

  const linkToken = await signSlackLinkToken({
    tenantId,
    slackTeamId: teamId,
    slackUserId,
    slackEnterpriseId,
    slackUsername,
    intent,
  });

  const linkUrl = `${manageUiUrl}/link?token=${encodeURIComponent(linkToken)}`;

  logger.info(
    { slackUserId, tenantId, hasIntent: !!intent },
    'Generated JWT link token for unlinked user'
  );

  return { type: 'jwt_link', url: linkUrl, expiresInMinutes: LINK_CODE_TTL_MINUTES };
}

export function buildLinkPromptMessage(result: LinkPromptResult) {
  if (result.type === 'auto_invite') {
    return createCreateInkeepAccountMessage(result.url, result.expiresInMinutes);
  }
  return createSmartLinkMessage(result.url);
}

async function tryAutoInvite(params: {
  tenantId: string;
  teamId: string;
  slackUserId: string;
  botToken: string;
}): Promise<{ invitationId: string; email: string; authMethod: string } | null> {
  const { tenantId, teamId, slackUserId, botToken } = params;

  if (!botToken) {
    return null;
  }

  try {
    const workspace = await findWorkAppSlackWorkspaceByTeamId(runDbClient)(tenantId, teamId);

    if (!workspace?.shouldAllowJoinFromWorkspace) {
      logger.warn(
        { userId: slackUserId, tenantId, teamId },
        'Workspace should not allow join from workspace'
      );
      return null;
    }

    const slackClient = getSlackClient(botToken);

    let userEmail: string | undefined;
    try {
      const userInfo = await slackClient.users.info({ user: slackUserId });
      userEmail = userInfo.user?.profile?.email;
    } catch (error) {
      logger.warn({ error, userId: slackUserId }, 'Failed to get user info from Slack');
      return null;
    }

    if (!userEmail) {
      logger.warn({ userId: slackUserId }, 'No email found in Slack user profile');
      return null;
    }

    const existingUser = await getOrganizationMemberByEmail(runDbClient)(tenantId, userEmail);
    if (existingUser) {
      logger.debug(
        { userId: slackUserId, email: userEmail },
        'User already has Inkeep account, skipping auto-invite'
      );
      return null;
    }

    const pendingInvitations = await getPendingInvitationsByEmail(runDbClient)(userEmail);
    const existingInvitation = pendingInvitations.find((inv) => inv.organizationId === tenantId);
    if (existingInvitation) {
      logger.info(
        { userId: slackUserId, tenantId, invitationId: existingInvitation.id, email: userEmail },
        'Reusing existing pending invitation for Slack user'
      );
      return {
        invitationId: existingInvitation.id,
        email: userEmail,
        authMethod: existingInvitation.authMethod ?? 'email-password',
      };
    }

    const invitation = await createInvitationInDb(runDbClient)({
      organizationId: tenantId,
      email: userEmail,
    });

    logger.info(
      { userId: slackUserId, tenantId, invitationId: invitation.id, email: userEmail },
      'Invitation created for Slack user without Inkeep account'
    );

    return { invitationId: invitation.id, email: userEmail, authMethod: invitation.authMethod };
  } catch (error) {
    logger.warn({ error, userId: slackUserId, tenantId }, 'Auto-invite attempt failed');
    return null;
  }
}
