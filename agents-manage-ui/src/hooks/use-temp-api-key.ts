import { useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

interface UseTempApiKeyParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  enabled?: boolean;
}

interface UseTempApiKeyResult {
  apiKey: string | null;
  appId: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<string | null>;
}

export function useTempApiKey({
  tenantId,
  projectId,
  agentId,
  enabled = true,
}: UseTempApiKeyParams): UseTempApiKeyResult {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function fetchToken(): Promise<string | null> {
    try {
      const response = await fetch(
        `${PUBLIC_INKEEP_AGENTS_API_URL}/manage/tenants/${tenantId}/playground/token`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            agentId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch temporary API key');
      }

      const data = await response.json();
      setApiKey(data.apiKey);
      setAppId(data.appId ?? null);
      setExpiresAt(data.expiresAt);
      setError(null);
      return data.apiKey;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  // Initial fetch
  useEffect(() => {
    if (enabled && agentId) {
      fetchToken();
    } else {
      // If not enabled or no agentId, set loading to false immediately
      setIsLoading(false);
    }
  }, [
    enabled,
    agentId,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchToken,
  ]);

  // Auto-refresh before expiry
  useEffect(() => {
    if (!expiresAt) return;

    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;

    // Refresh 5 minutes before expiry (or immediately if already expired)
    const refreshTime = Math.max(0, timeUntilExpiry - 5 * 60 * 1000);

    const timer = setTimeout(() => {
      fetchToken();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [
    expiresAt,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchToken,
  ]);

  return { apiKey, appId, isLoading, error, refresh: fetchToken };
}
