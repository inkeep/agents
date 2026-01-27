'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlackWorkspaceInfo } from '../types';

export function useSlackWorkspaceInfo(nangoConnectionId?: string) {
  const [slackInfo, setSlackInfo] = useState<SlackWorkspaceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedConnectionId = useRef<string | null>(null);
  const isFetching = useRef(false);

  const fetchSlackInfo = useCallback(
    async (connectionIdOverride?: string) => {
      const connectionId = connectionIdOverride || nangoConnectionId;
      if (!connectionId) return;

      if (isFetching.current) return;

      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';
        const response = await fetch(
          `${apiUrl}/manage/slack/workspace-info?connectionId=${connectionId}`
        );

        if (response.ok) {
          const data = await response.json();
          setSlackInfo(data);
          lastFetchedConnectionId.current = connectionId;
          console.log('=== SLACK WORKSPACE INFO FETCHED ===');
          console.log(JSON.stringify(data, null, 2));
          console.log('====================================');
        } else {
          setError('Failed to fetch workspace info');
        }
      } catch (err) {
        console.error('Failed to fetch Slack info:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch workspace info');
      } finally {
        setIsLoading(false);
        isFetching.current = false;
      }
    },
    [nangoConnectionId]
  );

  useEffect(() => {
    if (
      nangoConnectionId &&
      nangoConnectionId !== lastFetchedConnectionId.current &&
      !isFetching.current
    ) {
      fetchSlackInfo();
    }
  }, [nangoConnectionId, fetchSlackInfo]);

  const reset = useCallback(() => {
    setSlackInfo(null);
    setError(null);
    lastFetchedConnectionId.current = null;
  }, []);

  return {
    slackInfo,
    isLoading,
    error,
    fetchSlackInfo,
    reset,
  };
}
