import { useEffect, useRef, useState } from 'react';
import { getImprovementTokenAction } from '@/lib/actions/improvement-token';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

interface UseImprovementTokenResult {
  apiKey: string | null;
  appId: string | null;
  cookieHeader: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

async function fetchWithRetry(
  maxRetries: number
): Promise<{ apiKey: string; expiresAt: string; appId?: string; cookieHeader?: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await getImprovementTokenAction();

      if (result.success) {
        return result.data;
      }

      if (result.code === 'configuration_error') {
        throw new Error(result.error);
      }

      lastError = new Error(result.error);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
    }

    if (attempt < maxRetries) {
      const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to fetch improvement token after retries');
}

export function useImprovementToken(): UseImprovementTokenResult {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [cookieHeader, setCookieHeader] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  async function fetchToken() {
    try {
      setIsLoading(true);
      setError(null);

      const data = await fetchWithRetry(MAX_RETRIES);

      if (isMountedRef.current) {
        setApiKey(data.apiKey);
        setAppId(data.appId ?? null);
        setCookieHeader(data.cookieHeader ?? null);
        setExpiresAt(data.expiresAt);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    }
    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchToken();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: stable function
    fetchToken,
  ]);

  useEffect(() => {
    if (!expiresAt) return;

    const expiryTime = new Date(expiresAt).getTime();
    const refreshTime = Math.max(0, expiryTime - Date.now() - 5 * 60 * 1000);

    const timer = setTimeout(() => {
      fetchToken();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [
    expiresAt,
    // biome-ignore lint/correctness/useExhaustiveDependencies: stable function
    fetchToken,
  ]);

  return { apiKey, appId, cookieHeader, isLoading, error, refresh: fetchToken };
}
