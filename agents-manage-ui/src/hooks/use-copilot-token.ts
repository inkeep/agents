import { useEffect, useRef, useState } from 'react';
import { getCopilotTokenAction } from '@/lib/actions/copilot-token';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

interface UseCopilotTokenResult {
  apiKey: string | null;
  cookieHeader: string | null;
  isLoading: boolean;
  error: Error | null;
  retryCount: number;
  refresh: () => Promise<void>;
}

async function fetchWithRetry(
  maxRetries: number,
  onRetry?: (attempt: number, delay: number) => void
): Promise<{ apiKey: string; expiresAt: string; cookieHeader?: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await getCopilotTokenAction();

      if (result.success) {
        return result.data;
      }

      // Non-retryable errors (configuration issues)
      if (result.code === 'configuration_error') {
        throw new Error(result.error);
      }

      lastError = new Error(result.error);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
    }

    // Don't retry after the last attempt
    if (attempt < maxRetries) {
      const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      onRetry?.(attempt + 1, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to fetch copilot token after retries');
}

export function useCopilotToken(): UseCopilotTokenResult {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [cookieHeader, setCookieHeader] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);

  const fetchToken = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setRetryCount(0);

      const data = await fetchWithRetry(MAX_RETRIES, (attempt, delay) => {
        if (isMountedRef.current) {
          setRetryCount(attempt);
          console.log(`Copilot token fetch retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        }
      });

      if (isMountedRef.current) {
        setApiKey(data.apiKey);
        setCookieHeader(data.cookieHeader ?? null);
        setExpiresAt(data.expiresAt);
        setError(null);
        setRetryCount(0);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(new Error(errorMessage));
        console.error('Copilot token fetch failed after all retries:', errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
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

  return { apiKey, cookieHeader, isLoading, error, retryCount, refresh: fetchToken };
}
