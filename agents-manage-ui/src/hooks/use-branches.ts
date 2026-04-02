'use client';

import { useEffect, useState } from 'react';
import { type Branch, fetchBranches } from '@/lib/api/branches';

export function useBranches(tenantId: string, projectId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    try {
      const data = await fetchBranches(tenantId, projectId);
      setBranches(data);
    } catch (err) {
      console.error('useBranches: failed to fetch branches', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  return { branches, isLoading };
}
