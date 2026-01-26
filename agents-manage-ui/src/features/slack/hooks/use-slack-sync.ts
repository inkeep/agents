'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function useSlackSync(
  userId: string | undefined,
  currentLink: SlackUserLink | undefined,
  updateLink: (link: SlackUserLink) => void,
  removeLink: (userId: string) => void
) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const syncWithNango = useCallback(async () => {
    if (!userId) return;

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
      } else if (!status.connected && currentLink) {
        removeLink(userId);
      }

      setLastSyncAt(new Date());
    } catch (error) {
      console.error('Error syncing with Nango:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [userId, currentLink, updateLink, removeLink]);

  useEffect(() => {
    if (userId) {
      syncWithNango();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, syncWithNango]);

  return {
    isSyncing,
    lastSyncAt,
    syncWithNango,
  };
}
