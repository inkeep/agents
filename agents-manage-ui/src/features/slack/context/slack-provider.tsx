'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthSession } from '@/hooks/use-auth';
import {
  slackQueryKeys,
  useSlackUninstallWorkspaceMutation,
  useSlackWorkspacesQuery,
} from '../api/queries';
import { slackApi } from '../api/slack-api';
import { localDb } from '../db';
import { useSlackStore } from '../store/slack-store';
import type { SlackNotification, SlackWorkspace } from '../types';

interface SlackContextValue {
  user: { id: string; email?: string; name?: string } | null;
  session: { token?: string; expiresAt?: string } | null;
  isLoading: boolean;
  tenantId: string;

  workspaces: SlackWorkspace[];
  latestWorkspace: SlackWorkspace | null;

  installedWorkspaces: {
    data: Array<{
      connectionId: string;
      teamId: string;
      teamName?: string;
      tenantId: string;
      hasDefaultAgent: boolean;
      defaultAgentName?: string;
    }>;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };

  ui: {
    isConnecting: boolean;
    notification: SlackNotification | null;
  };

  actions: {
    handleInstallClick: () => void;
    uninstallWorkspace: (connectionId: string) => Promise<void>;
    addOrUpdateWorkspace: (workspace: SlackWorkspace) => void;
    removeWorkspace: (teamId: string) => void;
    clearAllWorkspaces: () => void;
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

  const workspaces = useSlackStore((state) => state.workspaces);
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
    }))
  );

  const latestWorkspace = workspaces.length > 0 ? workspaces[workspaces.length - 1] : null;

  const workspacesQuery = useSlackWorkspacesQuery();
  const uninstallMutation = useSlackUninstallWorkspaceMutation();

  useEffect(() => {
    if (notification?.type === 'success' && notification.action === 'installed') {
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaces() });
    }
  }, [notification, queryClient]);

  const handleInstallClick = useCallback(() => {
    window.location.href = slackApi.getInstallUrl();
  }, []);

  const uninstallWorkspace = useCallback(
    async (connectionId: string) => {
      try {
        await uninstallMutation.mutateAsync(connectionId);

        const teamId = connectionId.replace('T:', '').split(':').pop() || connectionId;
        const workspace = workspaces.find((w) => w.teamId === teamId);
        if (workspace?.teamId) {
          storeActions.removeWorkspace(workspace.teamId);
          const allWorkspaces = localDb.workspaces.findAll();
          const toDelete = allWorkspaces.find(
            (w) => w.externalId === teamId && w.integrationType === 'slack'
          );
          if (toDelete?.id) {
            localDb.workspaces.delete(toDelete.id);
          }
        }

        storeActions.setNotification({
          type: 'success',
          message: 'Workspace uninstalled successfully',
          action: 'disconnected',
        });
      } catch (error) {
        console.error('Failed to uninstall workspace:', error);
        storeActions.setNotification({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to uninstall workspace',
          action: 'error',
        });
      }
    },
    [uninstallMutation, workspaces, storeActions]
  );

  const value: SlackContextValue = {
    user: user
      ? { id: user.id, email: user.email || undefined, name: user.name || undefined }
      : null,
    session: session ? { token: session.token, expiresAt: session.expiresAt?.toString() } : null,
    isLoading: isAuthLoading,
    tenantId,

    workspaces,
    latestWorkspace,

    installedWorkspaces: {
      data: workspacesQuery.data?.workspaces ?? [],
      isLoading: workspacesQuery.isLoading,
      error: workspacesQuery.error,
      refetch: () => workspacesQuery.refetch(),
    },

    ui: {
      isConnecting,
      notification,
    },

    actions: {
      handleInstallClick,
      uninstallWorkspace,
      addOrUpdateWorkspace: storeActions.addOrUpdateWorkspace,
      removeWorkspace: storeActions.removeWorkspace,
      clearAllWorkspaces: storeActions.clearAllWorkspaces,
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

export function useSlackInstalledWorkspaces() {
  const ctx = useSlack();
  return ctx.installedWorkspaces;
}

export function useSlackActions() {
  const ctx = useSlack();
  return ctx.actions;
}
