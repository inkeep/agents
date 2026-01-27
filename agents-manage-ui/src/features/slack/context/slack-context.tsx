'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { useAuthSession } from '@/hooks/use-auth';
import { useSlackConnect } from '../hooks/use-slack-connect';
import { useSlackWorkspaceInfo } from '../hooks/use-slack-info';
import { useSlackUserLinks, useSlackWorkspaces } from '../hooks/use-slack-storage';
import { useSlackSync } from '../hooks/use-slack-sync';
import type {
  SlackNotification,
  SlackUserLink,
  SlackWorkspace,
  SlackWorkspaceInfo,
} from '../types';

interface SlackContextValue {
  workspaces: SlackWorkspace[];
  latestWorkspace: SlackWorkspace | null;
  userLinks: SlackUserLink[];
  currentUserLink: SlackUserLink | undefined;
  slackInfo: SlackWorkspaceInfo | null;
  mounted: boolean;
  isConnecting: boolean;
  isLoadingSlackInfo: boolean;
  notification: SlackNotification | null;
  user: { id: string; email?: string; name?: string } | null;
  isLoading: boolean;

  addOrUpdateWorkspace: (workspace: SlackWorkspace) => void;
  removeWorkspace: (teamId: string) => void;
  clearAllWorkspaces: () => void;
  refreshWorkspaces: () => void;

  addOrUpdateUserLink: (link: SlackUserLink) => void;
  removeUserLink: (appUserId: string) => void;
  clearAllUserLinks: () => void;
  refreshUserLinks: () => void;

  connectSlack: () => void;
  disconnectSlack: () => void;

  fetchSlackInfo: (connectionIdOverride?: string) => void;
  resetSlackInfo: () => void;

  clearNotification: () => void;
  setNotification: (notification: SlackNotification) => void;

  handleInstallClick: () => void;
}

const SlackContext = createContext<SlackContextValue | null>(null);

interface SlackProviderProps {
  children: ReactNode;
  tenantId: string;
}

export function SlackProvider({ children, tenantId }: SlackProviderProps) {
  const { user, session, isLoading } = useAuthSession();

  const {
    workspaces,
    latestWorkspace,
    mounted,
    addOrUpdateWorkspace,
    removeWorkspace,
    clearAllWorkspaces,
    refresh: refreshWorkspaces,
  } = useSlackWorkspaces();

  const {
    userLinks,
    currentUserLink,
    addOrUpdateUserLink,
    removeUserLink,
    clearAllUserLinks,
    refresh: refreshUserLinks,
  } = useSlackUserLinks(user?.id);

  const {
    slackInfo,
    isLoading: isLoadingSlackInfo,
    fetchSlackInfo,
    reset: resetSlackInfo,
  } = useSlackWorkspaceInfo(currentUserLink?.nangoConnectionId);

  const {
    isConnecting,
    notification: connectNotification,
    connectSlack: connectSlackFn,
    clearNotification,
  } = useSlackConnect();

  useSlackSync(user?.id, currentUserLink, addOrUpdateUserLink, removeUserLink, {
    sessionToken: session?.token,
    sessionExpiresAt:
      session?.expiresAt instanceof Date ? session.expiresAt.toISOString() : session?.expiresAt,
  });

  const connectSlack = useCallback(() => {
    if (!user) return;

    connectSlackFn({
      userId: user.id,
      userEmail: user.email || undefined,
      userName: user.name || undefined,
      tenantId,
      slackTeamId: latestWorkspace?.teamId,
      inkeepSessionToken: session?.token,
      inkeepSessionExpiresAt:
        session?.expiresAt instanceof Date ? session.expiresAt.toISOString() : session?.expiresAt,
      onSuccess: (link) => {
        addOrUpdateUserLink(link);
        if (link.nangoConnectionId) {
          setTimeout(() => {
            fetchSlackInfo(link.nangoConnectionId);
          }, 300);
        }
      },
    });
  }, [
    user,
    session,
    tenantId,
    latestWorkspace?.teamId,
    connectSlackFn,
    addOrUpdateUserLink,
    fetchSlackInfo,
  ]);

  const disconnectSlack = useCallback(async () => {
    if (!user) return;

    const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    try {
      const response = await fetch(`${apiUrl}/manage/slack/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          connectionId: currentUserLink?.nangoConnectionId,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('=== SLACK DISCONNECTED ===');
        console.log({ userId: user.id, connectionId: result.connectionId });
        console.log('==========================');
      } else {
        console.error('Failed to disconnect from Nango:', result.error);
      }
    } catch (error) {
      console.error('Error disconnecting from Slack:', error);
    }

    removeUserLink(user.id);
    resetSlackInfo();
  }, [user, currentUserLink?.nangoConnectionId, removeUserLink, resetSlackInfo]);

  const handleInstallClick = useCallback(() => {
    const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    window.location.href = `${apiUrl}/manage/slack/install`;
  }, []);

  const setNotification = useCallback((_notification: SlackNotification) => {
    console.log('Notification:', _notification);
  }, []);

  const value = useMemo<SlackContextValue>(
    () => ({
      workspaces,
      latestWorkspace,
      userLinks,
      currentUserLink,
      slackInfo,
      mounted,
      isConnecting,
      isLoadingSlackInfo,
      notification: connectNotification,
      user: user
        ? { id: user.id, email: user.email || undefined, name: user.name || undefined }
        : null,
      isLoading,

      addOrUpdateWorkspace,
      removeWorkspace,
      clearAllWorkspaces,
      refreshWorkspaces,

      addOrUpdateUserLink,
      removeUserLink,
      clearAllUserLinks,
      refreshUserLinks,

      connectSlack,
      disconnectSlack,

      fetchSlackInfo,
      resetSlackInfo,

      clearNotification,
      setNotification,

      handleInstallClick,
    }),
    [
      workspaces,
      latestWorkspace,
      userLinks,
      currentUserLink,
      slackInfo,
      mounted,
      isConnecting,
      isLoadingSlackInfo,
      connectNotification,
      user,
      isLoading,
      addOrUpdateWorkspace,
      removeWorkspace,
      clearAllWorkspaces,
      refreshWorkspaces,
      addOrUpdateUserLink,
      removeUserLink,
      clearAllUserLinks,
      refreshUserLinks,
      connectSlack,
      disconnectSlack,
      fetchSlackInfo,
      resetSlackInfo,
      clearNotification,
      setNotification,
      handleInstallClick,
    ]
  );

  return <SlackContext value={value}>{children}</SlackContext>;
}

export function useSlack() {
  const context = useContext(SlackContext);
  if (!context) {
    throw new Error('useSlack must be used within a SlackProvider');
  }
  return context;
}
