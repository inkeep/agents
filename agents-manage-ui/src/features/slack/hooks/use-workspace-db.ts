'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localDb } from '../db';
import type { SlackUserConnection, WorkspaceRecord } from '../db/schema';

const logger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(`[useWorkspaceDb] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (msg: string, error?: unknown) => {
    console.error(`[useWorkspaceDb] ERROR: ${msg}`, error);
  },
};

interface UseWorkspaceDbOptions {
  tenantId: string;
  userId?: string;
}

export function useWorkspaceDb({ tenantId, userId }: UseWorkspaceDbOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [userConnections, setUserConnections] = useState<SlackUserConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      setIsLoading(true);
      const ws = localDb.workspaces.findAll(tenantId);
      setWorkspaces(ws);

      let conns: SlackUserConnection[] = [];
      if (userId) {
        conns = localDb.slackUserConnections.findByInkeepUser(userId);
        setUserConnections(conns);
      }

      logger.info('Data refreshed', {
        workspaceCount: ws.length,
        connectionCount: conns.length,
        tenantId,
      });
    } catch (err) {
      logger.error('Failed to refresh', err);
    } finally {
      setIsLoading(false);
      setMounted(true);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const slackWorkspaces = useMemo(
    () => workspaces.filter((w) => w.integrationType === 'slack'),
    [workspaces]
  );

  const latestWorkspace = useMemo(
    () =>
      slackWorkspaces.length > 0
        ? slackWorkspaces.sort(
            (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
          )[0]
        : null,
    [slackWorkspaces]
  );

  const isWorkspaceInstalled = useMemo(() => slackWorkspaces.length > 0, [slackWorkspaces]);

  const currentUserConnection = useMemo(
    () => userConnections.find((c) => c.status === 'active') || null,
    [userConnections]
  );

  const isUserLinked = useMemo(() => currentUserConnection !== null, [currentUserConnection]);

  const canLink = useMemo(
    () => isWorkspaceInstalled && !isUserLinked,
    [isWorkspaceInstalled, isUserLinked]
  );

  const saveWorkspaceFromInstall = useCallback(
    (
      installData: {
        ok: boolean;
        teamId: string;
        teamName: string;
        teamDomain?: string;
        enterpriseId?: string;
        enterpriseName?: string;
        isEnterpriseInstall?: boolean;
        botUserId?: string;
        botToken?: string;
        botScopes?: string;
        installerUserId?: string;
      },
      installerUser: { id: string; email?: string }
    ) => {
      try {
        const workspace = localDb.workspaces.upsert({
          tenantId,
          integrationType: 'slack',
          externalId: installData.teamId,
          enterpriseId: installData.enterpriseId,
          enterpriseName: installData.enterpriseName,
          name: installData.teamName,
          domain: installData.teamDomain,
          isEnterpriseInstall: installData.isEnterpriseInstall || false,
          botUserId: installData.botUserId,
          botToken: installData.botToken,
          botScopes: installData.botScopes,
          installedByUserId: installerUser.id,
          installedByUserEmail: installerUser.email,
          installedByExternalUserId: installData.installerUserId,
          installedAt: new Date().toISOString(),
          metadata: {},
        });

        localDb.auditLogs.create({
          tenantId,
          userId: installerUser.id,
          action: 'workspace.install',
          resourceType: 'workspace',
          resourceId: workspace.id,
          integrationType: 'slack',
          details: {
            teamId: installData.teamId,
            teamName: installData.teamName,
            enterpriseId: installData.enterpriseId,
          },
        });

        refresh();
        logger.info('Workspace saved from install', {
          id: workspace.id,
          name: workspace.name,
        });
        return workspace;
      } catch (err) {
        logger.error('Failed to save workspace', err);
        throw err;
      }
    },
    [tenantId, refresh]
  );

  const saveUserConnection = useCallback(
    (
      connectionData: {
        slackUserId: string;
        slackWorkspaceId: string;
        slackEnterpriseId?: string;
        slackUsername?: string;
        slackDisplayName?: string;
        slackEmail?: string;
        isSlackAdmin?: boolean;
        isSlackOwner?: boolean;
        nangoConnectionId: string;
        nangoIntegrationId?: string;
      },
      inkeepUser: { id: string; email?: string; name?: string }
    ) => {
      if (!latestWorkspace) {
        throw new Error('Cannot link user without an installed workspace');
      }

      try {
        const connection = localDb.slackUserConnections.upsert({
          slackUserId: connectionData.slackUserId,
          slackWorkspaceId: connectionData.slackWorkspaceId,
          slackEnterpriseId: connectionData.slackEnterpriseId,
          slackUsername: connectionData.slackUsername,
          slackDisplayName: connectionData.slackDisplayName,
          slackEmail: connectionData.slackEmail,
          isSlackAdmin: connectionData.isSlackAdmin || false,
          isSlackOwner: connectionData.isSlackOwner || false,
          inkeepUserId: inkeepUser.id,
          inkeepUserEmail: inkeepUser.email,
          inkeepUserName: inkeepUser.name,
          tenantId,
          organizationId: tenantId,
          slackAppClientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || '',
          nangoConnectionId: connectionData.nangoConnectionId,
          nangoIntegrationId: connectionData.nangoIntegrationId || 'slack-agent',
          connectedAt: new Date().toISOString(),
          status: 'active',
          metadata: {},
        });

        localDb.auditLogs.create({
          tenantId,
          userId: inkeepUser.id,
          action: 'connection.create',
          resourceType: 'connection',
          resourceId: connection.id,
          integrationType: 'slack',
          details: {
            slackUserId: connectionData.slackUserId,
            slackWorkspaceId: connectionData.slackWorkspaceId,
            nangoConnectionId: connectionData.nangoConnectionId,
          },
        });

        refresh();
        logger.info('User connection saved', {
          id: connection.id,
          slackUserId: connection.slackUserId,
          inkeepUserId: connection.inkeepUserId,
        });
        return connection;
      } catch (err) {
        logger.error('Failed to save user connection', err);
        throw err;
      }
    },
    [tenantId, latestWorkspace, refresh]
  );

  const removeUserConnection = useCallback(
    (connectionId: string) => {
      try {
        const connection = localDb.slackUserConnections.findById(connectionId);
        if (connection) {
          localDb.slackUserConnections.updateStatus(connectionId, 'revoked');

          localDb.auditLogs.create({
            tenantId,
            userId: connection.inkeepUserId,
            action: 'connection.delete',
            resourceType: 'connection',
            resourceId: connectionId,
            integrationType: 'slack',
            details: { reason: 'user_disconnected' },
          });
        }
        refresh();
        logger.info('User connection removed', { connectionId });
      } catch (err) {
        logger.error('Failed to remove connection', err);
        throw err;
      }
    },
    [tenantId, refresh]
  );

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      try {
        localDb.workspaces.delete(workspaceId);

        localDb.auditLogs.create({
          tenantId,
          action: 'workspace.uninstall',
          resourceType: 'workspace',
          resourceId: workspaceId,
          integrationType: 'slack',
          details: { reason: 'manual_removal' },
        });

        refresh();
        logger.info('Workspace removed', { workspaceId });
      } catch (err) {
        logger.error('Failed to remove workspace', err);
        throw err;
      }
    },
    [tenantId, refresh]
  );

  const clearAll = useCallback(() => {
    localDb.workspaces.clear();
    localDb.slackUserConnections.clear();
    localDb.auditLogs.clear();
    refresh();
    logger.info('All data cleared');
  }, [refresh]);

  return {
    workspaces,
    slackWorkspaces,
    latestWorkspace,
    userConnections,
    currentUserConnection,

    isLoading,
    mounted,
    isWorkspaceInstalled,
    isUserLinked,
    canLink,

    refresh,
    saveWorkspaceFromInstall,
    saveUserConnection,
    removeUserConnection,
    removeWorkspace,
    clearAll,
  };
}
