'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import type { DataComponent } from '@/lib/api/data-components';

const dataComponentQueryKeys = {
  list: (tenantId: string, projectId: string) => ['data-components', tenantId, projectId] as const,
};

export function useDataComponentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<DataComponent[]>({
    queryKey: dataComponentQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchDataComponentsAction(tenantId, projectId);
      if (!response.success || !response.data) {
        throw new Error(response.error);
      }
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load data components',
    },
  });
}
