import { useCallback, useEffect, useState } from 'react';
import { getCopilotTokenAction } from '@/lib/actions/copilot-token';

export interface UseCopilotTokenResult {
  apiKey: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCopilotToken(): UseCopilotTokenResult {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchToken = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getCopilotTokenAction();

      if (result.success) {
        setApiKey(result.data.apiKey);
        setExpiresAt(result.data.expiresAt);
        setError(null);
      } else {
        setError(new Error(result.error));
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Auto-refresh before expiry
  useEffect(() => {
    if (!expiresAt) return;

    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;

    // Refresh 5 minutes before expiry (or immediately if already expired)
    const refreshTime = Math.max(0, timeUntilExpiry - 5 * 60 * 1000);

    const timer = setTimeout(() => {
      console.log('Auto-refreshing copilot token before expiry...');
      fetchToken();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [expiresAt, fetchToken]);

  return { apiKey, isLoading, error, refresh: fetchToken };
}

