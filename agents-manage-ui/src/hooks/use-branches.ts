'use client';

import { useCallback, useEffect, useState } from 'react';
import { type Branch, fetchBranches } from '@/lib/api/branches';

export function useBranches(tenantId: string, projectId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchBranches(tenantId, projectId);
      setBranches(data);
    } catch (err) {
      console.error('useBranches: failed to fetch branches', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return { branches, isLoading };
}
