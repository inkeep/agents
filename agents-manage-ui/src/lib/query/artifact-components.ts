'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type ArtifactComponent, fetchArtifactComponents } from '@/lib/api/artifact-components';

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
      const response = await fetchArtifactComponents(tenantId, projectId);
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
