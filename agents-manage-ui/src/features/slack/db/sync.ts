'use client';

import type { SlackUserLink } from '../types';
import { localDb } from './local-db';

interface SyncOptions {
  skipAuditLog?: boolean;
}

function dispatchDbUpdateEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inkeep-db-update'));
  }
}

export function saveUserLinkToLocalDb(
  link: SlackUserLink,
  tenantId: string,
  options?: SyncOptions
): void {
  localDb.users.upsert({
    id: link.appUserId,
    email: link.appUserEmail || '',
    name: link.appUserName || '',
    tenantId,
    organizationId: tenantId,
    role: 'member',
    metadata: {},
  });

  localDb.slackUserConnections.upsert({
    tenantId,
    organizationId: tenantId,
    inkeepUserId: link.appUserId,
    inkeepUserEmail: link.appUserEmail,
    inkeepUserName: link.appUserName,
    slackUserId: link.slackUserId || '',
    slackWorkspaceId: link.slackTeamId || '',
    slackEnterpriseId: link.enterpriseId,
    slackUsername: link.slackUsername,
    slackDisplayName: link.slackDisplayName,
    slackEmail: link.slackEmail,
    isSlackAdmin: link.isSlackAdmin || false,
    isSlackOwner: link.isSlackOwner || false,
    slackAppClientId: '',
    nangoConnectionId: link.nangoConnectionId,
    nangoIntegrationId: 'slack-agent',
    connectedAt: link.linkedAt || new Date().toISOString(),
    status: link.isLinked ? 'active' : 'inactive',
    metadata: {},
  });

  if (!options?.skipAuditLog) {
    localDb.auditLogs.create({
      tenantId,
      userId: link.appUserId,
      action: 'connection.create',
      resourceType: 'connection',
      resourceId: link.nangoConnectionId,
      integrationType: 'slack',
      details: {
        slackTeamId: link.slackTeamId,
        appUserEmail: link.appUserEmail,
      },
    });
  }

  dispatchDbUpdateEvent();
}

export function removeUserLinkFromLocalDb(
  userId: string,
  tenantId: string,
  connectionId?: string
): void {
  const connections = localDb.slackUserConnections.findByInkeepUser(userId);
  for (const conn of connections) {
    localDb.slackUserConnections.updateStatus(conn.id, 'inactive');
  }

  localDb.auditLogs.create({
    tenantId,
    userId,
    action: 'connection.disconnect',
    resourceType: 'connection',
    resourceId: connectionId,
    integrationType: 'slack',
    details: { disconnectedAt: new Date().toISOString() },
  });

  dispatchDbUpdateEvent();
}

export function clearAllUserLinksFromLocalDb(tenantId: string): void {
  localDb.slackUserConnections.clear();

  localDb.auditLogs.create({
    tenantId,
    userId: undefined,
    action: 'connection.clear_all',
    resourceType: 'connection',
    resourceId: undefined,
    integrationType: 'slack',
    details: { clearedAt: new Date().toISOString() },
  });

  dispatchDbUpdateEvent();
}
