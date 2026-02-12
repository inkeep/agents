'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useEffect } from 'react';
import { useAuthSession } from '@/hooks/use-auth';
import {
  slackQueryKeys,
  useSlackUninstallWorkspaceMutation,
  useSlackWorkspacesQuery,
} from '../api/queries';
import { slackApi } from '../api/slack-api';
import { useSlackStore } from '../store/slack-store';
import type { SlackNotification } from '../types';

interface SlackContextValue {
  user: { id: string; email?: string; name?: string } | null;
  isLoading: boolean;
  tenantId: string;

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
    notification: SlackNotification | null;
  };

  actions: {
    handleInstallClick: () => void;
    uninstallWorkspace: (connectionId: string) => Promise<void>;
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
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const queryClient = useQueryClient();

  const notification = useSlackStore((state) => state.notification);
  const setNotification = useSlackStore((state) => state.setNotification);
  const clearNotification = useSlackStore((state) => state.clearNotification);

  const workspacesQuery = useSlackWorkspacesQuery();
  const uninstallMutation = useSlackUninstallWorkspaceMutation();

  useEffect(() => {
    if (notification?.type === 'success' && notification.action === 'installed') {
      queryClient.invalidateQueries({ queryKey: slackQueryKeys.workspaces() });
    }
  }, [notification, queryClient]);

  const handleInstallClick = useCallback(() => {
    window.location.href = slackApi.getInstallUrl(tenantId);
  }, [tenantId]);

  const uninstallWorkspace = useCallback(
    async (connectionId: string) => {
      try {
        await uninstallMutation.mutateAsync(connectionId);

        setNotification({
          type: 'success',
          message: 'Workspace uninstalled successfully',
          action: 'disconnected',
        });
      } catch (error) {
        console.error('Failed to uninstall workspace:', error);
        setNotification({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to uninstall workspace',
          action: 'error',
        });
      }
    },
    [uninstallMutation, setNotification]
  );

  const value: SlackContextValue = {
    user: user
      ? { id: user.id, email: user.email || undefined, name: user.name || undefined }
      : null,
    isLoading: isAuthLoading,
    tenantId,

    installedWorkspaces: {
      data: workspacesQuery.data?.workspaces ?? [],
      isLoading: workspacesQuery.isLoading,
      error: workspacesQuery.error,
      refetch: () => workspacesQuery.refetch(),
    },

    ui: {
      notification,
    },

    actions: {
      handleInstallClick,
      uninstallWorkspace,
      setNotification,
      clearNotification,
    },
  };

  return <SlackContext value={value}>{children}</SlackContext>;
}

export function useSlack() {
  const context = use(SlackContext);
  if (!context) {
    throw new Error('useSlack must be used within a SlackProvider');
  }
  return context;
}
