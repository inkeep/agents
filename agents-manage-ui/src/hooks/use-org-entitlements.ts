import { useCallback, useEffect, useState } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

export interface OrgEntitlement {
  resourceType: string;
  maxValue: number;
}

interface UseOrgEntitlementsResult {
  entitlements: OrgEntitlement[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useOrgEntitlements(tenantId: string): UseOrgEntitlementsResult {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [entitlements, setEntitlements] = useState<OrgEntitlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntitlements = useCallback(async () => {
    try {
      const response = await fetch(
        `${PUBLIC_INKEEP_AGENTS_API_URL}/manage/tenants/${tenantId}/entitlements`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch entitlements');
      }

      const data = await response.json();
      setEntitlements(data.entitlements ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, PUBLIC_INKEEP_AGENTS_API_URL]);

  useEffect(() => {
    if (tenantId) {
      fetchEntitlements();
    } else {
      setIsLoading(false);
    }
  }, [tenantId, fetchEntitlements]);

  return { entitlements, isLoading, error, refresh: fetchEntitlements };
}
