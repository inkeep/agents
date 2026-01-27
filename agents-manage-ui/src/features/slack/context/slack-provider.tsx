'use client';

import Nango from '@nangohq/frontend';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthSession } from '@/hooks/use-auth';
import {
  slackQueryKeys,
  useSlackConnectionStatusQuery,
  useSlackDisconnectMutation,
  useSlackRefreshSessionMutation,
  useSlackWorkspaceInfoQuery,
} from '../api/queries';
import { slackApi } from '../api/slack-api';
import { localDb } from '../db';
import { useSlackStore } from '../store/slack-store';
import type {
  SlackNotification,
  SlackUserLink,
  SlackWorkspace,
  SlackWorkspaceInfo,
} from '../types';

function saveUserLinkToLocalDb(
  link: SlackUserLink,
  tenantId: string,
  options?: { skipAuditLog?: boolean }
) {
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inkeep-db-update'));
  }
}

function removeUserLinkFromLocalDb(userId: string, tenantId: string, connectionId?: string) {
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inkeep-db-update'));
  }
}

function clearAllUserLinksFromLocalDb(tenantId: string) {
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

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inkeep-db-update'));
  }
}

interface SlackContextValue {
  user: { id: string; email?: string; name?: string } | null;
  session: { token?: string; expiresAt?: string } | null;
  isLoading: boolean;
  tenantId: string;

  workspaces: SlackWorkspace[];
  latestWorkspace: SlackWorkspace | null;
  userLinks: SlackUserLink[];
  currentUserLink: SlackUserLink | undefined;

  connectionStatus: {
    isConnected: boolean;
    connection: { connectionId: string; appUserEmail: string; linkedAt: string } | null;
    isLoading: boolean;
    error: Error | null;
  };

  workspaceInfo: {
    data: SlackWorkspaceInfo | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };

  ui: {
    isConnecting: boolean;
    notification: SlackNotification | null;
  };

  actions: {
    connectSlack: () => Promise<void>;
    disconnectSlack: () => Promise<void>;
    handleInstallClick: () => void;
    addOrUpdateWorkspace: (workspace: SlackWorkspace) => void;
    removeWorkspace: (teamId: string) => void;
    clearAllWorkspaces: () => void;
    addOrUpdateUserLink: (link: SlackUserLink) => void;
    removeUserLink: (appUserId: string) => void;
    clearAllUserLinks: () => void;
    setNotification: (notification: SlackNotification | null) => void;
    clearNotification: () => void;
  };
}

const SlackContext = createContext<SlackContextValue | null>(null);

interface SlackProviderProps {
  children: ReactNode;
  tenantId: string;
}

export function SlackProvider({ children, tenantId }: SlackProviderProps) {
  const { user, session, isLoading: isAuthLoading } = useAuthSession();
  const queryClient = useQueryClient();
  const hasRefreshedSession = useRef(false);

  const workspaces = useSlackStore((state) => state.workspaces);
  const userLinks = useSlackStore((state) => state.userLinks);
  const isConnecting = useSlackStore((state) => state.isConnecting);
  const notification = useSlackStore((state) => state.notification);
  const storeActions = useSlackStore(
    useShallow((state) => ({
      setIsConnecting: state.setIsConnecting,
      setNotification: state.setNotification,
      clearNotification: state.clearNotification,
      addOrUpdateWorkspace: state.addOrUpdateWorkspace,
      removeWorkspace: state.removeWorkspace,
      clearAllWorkspaces: state.clearAllWorkspaces,
      addOrUpdateUserLink: state.addOrUpdateUserLink,
      removeUserLink: state.removeUserLink,
      clearAllUserLinks: state.clearAllUserLinks,
    }))
  );

  const currentUserLink = user?.id
    ? userLinks.find((link) => link.appUserId === user.id)
    : undefined;
  const latestWorkspace = workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;

  const connectionStatusQuery = useSlackConnectionStatusQuery(user?.id);
  const connectionId =
    connectionStatusQuery.data?.connection?.connectionId || currentUserLink?.nangoConnectionId;
  const workspaceInfoQuery = useSlackWorkspaceInfoQuery(connectionId);

  const disconnectMutation = useSlackDisconnectMutation();
  const refreshSessionMutation = useSlackRefreshSessionMutation();

  useEffect(() => {
    if (
      user?.id &&
      session?.token &&
      connectionStatusQuery.data?.connected &&
      connectionStatusQuery.data?.connection &&
      !hasRefreshedSession.current
    ) {
      hasRefreshedSession.current = true;
      refreshSessionMutation.mutate({
        userId: user.id,
        sessionToken: session.token,
        sessionExpiresAt:
          session.expiresAt instanceof Date ? session.expiresAt.toISOString() : session.expiresAt,
      });
    }
  }, [user?.id, session, connectionStatusQuery.data, refreshSessionMutation]);

  useEffect(() => {
    if (connectionStatusQuery.data?.connected && connectionStatusQuery.data?.connection) {
      const conn = connectionStatusQuery.data.connection;
      if (!currentUserLink || currentUserLink.nangoConnectionId !== conn.connectionId) {
        const syncedLink: SlackUserLink = {
          slackUserId: currentUserLink?.slackUserId || '',
          slackTeamId: currentUserLink?.slackTeamId || latestWorkspace?.teamId || '',
          appUserId: conn.appUserId,
          appUserEmail: conn.appUserEmail || currentUserLink?.appUserEmail,
          appUserName: currentUserLink?.appUserName || user?.name || '',
          nangoConnectionId: conn.connectionId,
          isLinked: true,
          linkedAt: conn.linkedAt,
        };
        storeActions.addOrUpdateUserLink(syncedLink);
        saveUserLinkToLocalDb(syncedLink, tenantId, { skipAuditLog: true });
      }
    } else if (
      connectionStatusQuery.data &&
      !connectionStatusQuery.data.connected &&
      currentUserLink &&
      user?.id
    ) {
      storeActions.removeUserLink(user.id);
      removeUserLinkFromLocalDb(user.id, tenantId, currentUserLink.nangoConnectionId);
    }
  }, [
    connectionStatusQuery.data,
    currentUserLink,
    user?.id,
    user?.name,
    latestWorkspace?.teamId,
    storeActions,
    tenantId,
  ]);

  useEffect(() => {
    if (notification?.type === 'success' && notification.message.includes('connected')) {
      connectionStatusQuery.refetch();
      if (connectionId) {
        workspaceInfoQuery.refetch();
      }
    }
  }, [notification, connectionId, connectionStatusQuery, workspaceInfoQuery]);

  const connectSlack = useCallback(async () => {
    if (!user) return;

    storeActions.setIsConnecting(true);

    try {
      const { sessionToken } = await slackApi.createConnectSession({
        userId: user.id,
        userEmail: user.email || undefined,
        userName: user.name || undefined,
        tenantId,
        sessionToken: session?.token,
        sessionExpiresAt:
          session?.expiresAt instanceof Date ? session.expiresAt.toISOString() : session?.expiresAt,
      });

      const nango = new Nango();

      await new Promise<void>((resolve) => {
        const connect = nango.openConnectUI({
          onEvent: (event) => {
            if (event.type === 'connect' && 'payload' in event) {
              const payload = event.payload as { connectionId?: string };
              const connId = payload.connectionId || user.id;

              const newLink: SlackUserLink = {
                slackUserId: '',
                slackTeamId: latestWorkspace?.teamId || '',
                appUserId: user.id,
                appUserEmail: user.email || undefined,
                appUserName: user.name || undefined,
                nangoConnectionId: connId,
                isLinked: true,
                linkedAt: new Date().toISOString(),
              };

              storeActions.addOrUpdateUserLink(newLink);
              saveUserLinkToLocalDb(newLink, tenantId);

              queryClient.invalidateQueries({ queryKey: slackQueryKeys.status(user.id) });
              if (connId) {
                queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaceInfo(connId) });
              }

              storeActions.setNotification({
                type: 'success',
                message: 'Slack account connected successfully!',
              });
              resolve();
            } else if (event.type === 'close') {
              resolve();
            }
          },
        });

        connect.setSessionToken(sessionToken);
      });
    } catch (error) {
      console.error('Failed to connect Slack:', error);
      storeActions.setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to connect Slack account',
      });
    } finally {
      storeActions.setIsConnecting(false);
    }
  }, [user, session, tenantId, latestWorkspace?.teamId, storeActions, queryClient]);

  const disconnectSlack = useCallback(async () => {
    if (!user) return;

    try {
      await disconnectMutation.mutateAsync({
        userId: user.id,
        connectionId: currentUserLink?.nangoConnectionId,
      });

      storeActions.removeUserLink(user.id);
      removeUserLinkFromLocalDb(user.id, tenantId, currentUserLink?.nangoConnectionId);
      storeActions.setNotification({ type: 'success', message: 'Disconnected from Slack' });
    } catch (error) {
      console.error('Failed to disconnect:', error);
      storeActions.setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to disconnect',
      });
    }
  }, [user, currentUserLink?.nangoConnectionId, disconnectMutation, storeActions, tenantId]);

  const handleInstallClick = useCallback(() => {
    window.location.href = slackApi.getInstallUrl();
  }, []);

  const handleRemoveUserLink = useCallback(
    (appUserId: string) => {
      const link = userLinks.find((l) => l.appUserId === appUserId);
      storeActions.removeUserLink(appUserId);
      removeUserLinkFromLocalDb(appUserId, tenantId, link?.nangoConnectionId);
    },
    [userLinks, storeActions, tenantId]
  );

  const handleClearAllUserLinks = useCallback(() => {
    storeActions.clearAllUserLinks();
    clearAllUserLinksFromLocalDb(tenantId);
  }, [storeActions, tenantId]);

  const value: SlackContextValue = {
    user: user
      ? { id: user.id, email: user.email || undefined, name: user.name || undefined }
      : null,
    session: session ? { token: session.token, expiresAt: session.expiresAt?.toString() } : null,
    isLoading: isAuthLoading,
    tenantId,

    workspaces,
    latestWorkspace,
    userLinks,
    currentUserLink,

    connectionStatus: {
      isConnected: connectionStatusQuery.data?.connected ?? false,
      connection: connectionStatusQuery.data?.connection ?? null,
      isLoading: connectionStatusQuery.isLoading,
      error: connectionStatusQuery.error,
    },

    workspaceInfo: {
      data: workspaceInfoQuery.data ?? null,
      isLoading: workspaceInfoQuery.isLoading,
      error: workspaceInfoQuery.error,
      refetch: () => workspaceInfoQuery.refetch(),
    },

    ui: {
      isConnecting,
      notification,
    },

    actions: {
      connectSlack,
      disconnectSlack,
      handleInstallClick,
      addOrUpdateWorkspace: storeActions.addOrUpdateWorkspace,
      removeWorkspace: storeActions.removeWorkspace,
      clearAllWorkspaces: storeActions.clearAllWorkspaces,
      addOrUpdateUserLink: storeActions.addOrUpdateUserLink,
      removeUserLink: handleRemoveUserLink,
      clearAllUserLinks: handleClearAllUserLinks,
      setNotification: storeActions.setNotification,
      clearNotification: storeActions.clearNotification,
    },
  };

  return <SlackContext value={value}>{children}</SlackContext>;
}

export function useSlack() {
  const context = useContext(SlackContext);
  if (!context) {
    throw new Error('useSlack must be used within a SlackProvider');
  }
  return context;
}

export function useSlackConnectionStatus() {
  const ctx = useSlack();
  return ctx.connectionStatus;
}

export function useSlackWorkspaceInfo() {
  const ctx = useSlack();
  return ctx.workspaceInfo;
}

export function useSlackActions() {
  const ctx = useSlack();
  return ctx.actions;
}
