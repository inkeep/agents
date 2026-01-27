'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlackUserLink } from '../types';

interface ConnectionStatus {
  connected: boolean;
  connection: {
    connectionId: string;
    appUserId: string;
    appUserEmail: string;
    slackDisplayName: string;
    linkedAt: string;
  } | null;
}

interface SyncOptions {
  sessionToken?: string;
  sessionExpiresAt?: string;
}

export function useSlackSync(
  userId: string | undefined,
  currentLink: SlackUserLink | undefined,
  updateLink: (link: SlackUserLink) => void,
  removeLink: (userId: string) => void,
  options?: SyncOptions
) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const hasSynced = useRef(false);
  const isSyncingRef = useRef(false);
  const hasRefreshedSession = useRef(false);

  const refreshSessionToken = useCallback(
    async (connectionId: string) => {
      if (!userId || !options?.sessionToken || hasRefreshedSession.current) return;

      const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

      try {
        const response = await fetch(`${apiUrl}/manage/slack/refresh-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sessionToken: options.sessionToken,
            sessionExpiresAt: options.sessionExpiresAt,
          }),
        });

        if (response.ok) {
          console.log('=== SESSION TOKEN REFRESHED ===');
          console.log({ userId, connectionId });
          console.log('===============================');
          hasRefreshedSession.current = true;
        }
      } catch (error) {
        console.error('Failed to refresh session token:', error);
      }
    },
    [userId, options?.sessionToken, options?.sessionExpiresAt]
  );

  const syncWithNango = useCallback(async () => {
    if (!userId || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    try {
      const response = await fetch(
        `${apiUrl}/manage/slack/status?userId=${encodeURIComponent(userId)}`
      );

      if (!response.ok) {
        console.error('Failed to fetch connection status');
        return;
      }

      const status: ConnectionStatus = await response.json();

      console.log('=== SYNC WITH NANGO ===');
      console.log({ userId, connected: status.connected, hasLocalLink: !!currentLink });
      console.log('=======================');

      if (status.connected && status.connection) {
        if (!currentLink || currentLink.nangoConnectionId !== status.connection.connectionId) {
          updateLink({
            slackUserId: '',
            slackTeamId: '',
            appUserId: status.connection.appUserId,
            appUserEmail: status.connection.appUserEmail,
            appUserName: '',
            nangoConnectionId: status.connection.connectionId,
            isLinked: true,
            linkedAt: status.connection.linkedAt,
          });
        }

        if (options?.sessionToken && !hasRefreshedSession.current) {
          await refreshSessionToken(status.connection.connectionId);
        }
      } else if (!status.connected && currentLink) {
        removeLink(userId);
      }

      setLastSyncAt(new Date());
      hasSynced.current = true;
    } catch (error) {
      console.error('Error syncing with Nango:', error);
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [userId, currentLink, updateLink, removeLink, options?.sessionToken, refreshSessionToken]);

  useEffect(() => {
    if (userId && !hasSynced.current) {
      syncWithNango();
    }
  }, [userId, syncWithNango]);

  return {
    isSyncing,
    lastSyncAt,
    syncWithNango,
  };
}
