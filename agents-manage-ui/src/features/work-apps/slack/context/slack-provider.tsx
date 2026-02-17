'use client';

import { createContext, type ReactNode, use, useCallback } from 'react';
import { useAuthSession } from '@/hooks/use-auth';
import { toast } from '@/lib/toast';
import { useSlackUninstallWorkspaceMutation, useSlackWorkspacesQuery } from '../api/queries';
import { slackApi } from '../api/slack-api';

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

  actions: {
    handleInstallClick: () => void;
    uninstallWorkspace: (connectionId: string) => Promise<void>;
  };
}

const SlackContext = createContext<SlackContextValue | null>(null);

interface SlackProviderProps {
  children: ReactNode;
  tenantId: string;
}

export function SlackProvider({ children, tenantId }: SlackProviderProps) {
  const { user, isLoading: isAuthLoading } = useAuthSession();

  const workspacesQuery = useSlackWorkspacesQuery();
  const uninstallMutation = useSlackUninstallWorkspaceMutation();

  const handleInstallClick = useCallback(() => {
    window.location.href = slackApi.getInstallUrl(tenantId);
  }, [tenantId]);

  const uninstallWorkspace = useCallback(
    async (connectionId: string) => {
      try {
        await uninstallMutation.mutateAsync(connectionId);
        toast.success('Workspace uninstalled successfully');
      } catch (error) {
        console.error('Failed to uninstall workspace:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to uninstall workspace');
      }
    },
    [uninstallMutation]
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

    actions: {
      handleInstallClick,
      uninstallWorkspace,
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
