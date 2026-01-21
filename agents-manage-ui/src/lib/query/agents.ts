'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { getAllAgentsAction } from '@/lib/actions/agent-full';
import type { Agent } from '@/lib/types/agent-full';

const agentQueryKeys = {
  list: (tenantId: string, projectId: string) => ['agents', tenantId, projectId] as const,
};

export function useAgentsQuery(options?: { enabled?: boolean }) {
  const { tenantId, projectId } = useParams<{
    tenantId?: string;
    projectId?: string;
  }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId) && (options?.enabled ?? true);

  return useQuery<Agent[]>({
    queryKey: agentQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await getAllAgentsAction(tenantId, projectId);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load agents',
    },
  });
}
