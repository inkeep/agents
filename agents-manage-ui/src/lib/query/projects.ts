'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjectsAction } from '@/lib/actions/projects';
import type { Project } from '@/lib/types/project';

const projectQueryKeys = {
  list: (tenantId: string) => ['projects', tenantId] as const,
};

export function useProjectsQuery(tenantId: string) {
  return useQuery<Project[]>({
    queryKey: projectQueryKeys.list(tenantId),
    async queryFn() {
      if (!tenantId) {
        throw new Error('tenantId is required');
      }
      const response = await fetchProjectsAction(tenantId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Unable to fetch projects');
      }
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useProjectsInvalidation(tenantId?: string) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!tenantId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: projectQueryKeys.list(tenantId) });
  }, [queryClient, tenantId]);
}
