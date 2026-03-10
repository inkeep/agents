'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchArtifactComponentsAction } from '@/lib/actions/artifact-components';
import type { ArtifactComponent } from '@/lib/api/artifact-components';

const artifactComponentQueryKeys = {
  list: (tenantId: string, projectId: string) =>
    ['artifact-components', tenantId, projectId] as const,
};

export function useArtifactComponentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<ArtifactComponent[]>({
    queryKey: artifactComponentQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchArtifactComponentsAction(tenantId, projectId);
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
      defaultError: 'Failed to load artifact components',
    },
  });
}
