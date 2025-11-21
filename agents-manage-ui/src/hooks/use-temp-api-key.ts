import { useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export interface UseTempApiKeyParams {
  tenantId: string;
  projectId: string;
  agentId: string;
  enabled?: boolean;
}

export interface UseTempApiKeyResult {
  apiKey: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useTempApiKey({
  tenantId,
  projectId,
  agentId,
  enabled = true,
}: UseTempApiKeyParams): UseTempApiKeyResult {
  const { PUBLIC_INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !agentId) {
      setIsLoading(false);
      return;
    }

    async function fetchTempKey() {
      try {
        const response = await fetch(
          `${PUBLIC_INKEEP_AGENTS_MANAGE_API_URL}/api/playground/token`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tenantId,
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchTempKey();
  }, [enabled, agentId, tenantId, projectId, PUBLIC_INKEEP_AGENTS_MANAGE_API_URL]);

  return { apiKey, isLoading, error };
}


