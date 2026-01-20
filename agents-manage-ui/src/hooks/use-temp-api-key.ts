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
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTempApiKey({
  tenantId,
  projectId,
  agentId,
  enabled = true,
}: UseTempApiKeyParams): UseTempApiKeyResult {
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchToken = async () => {
    // Workaround for a React Compiler limitation.
    // Todo: (BuildHIR::lowerStatement) Support ThrowStatement inside of try/catch
    async function doRequest() {
      const response = await fetch(
        `${PUBLIC_INKEEP_AGENTS_MANAGE_API_URL}/tenants/${tenantId}/playground/token`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectId, agentId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch temporary API key');
      }

      return await response.json();
    }

    try {
      const data = await doRequest();
      setApiKey(data.apiKey);
      setExpiresAt(data.expiresAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
    setIsLoading(false);
  };

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
      console.log('Auto-refreshing temporary API key before expiry...');
      fetchToken();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [
    expiresAt,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    fetchToken,
  ]);

  return { apiKey, isLoading, error, refresh: fetchToken };
}
