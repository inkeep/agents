'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type Dataset, fetchDatasets } from '@/lib/api/datasets';

const datasetQueryKeys = {
  list: (tenantId: string, projectId: string) => ['datasets', tenantId, projectId] as const,
};

export function useDatasetsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<Dataset[]>({
    queryKey: datasetQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchDatasets(tenantId, projectId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load datasets',
    },
  });
}
