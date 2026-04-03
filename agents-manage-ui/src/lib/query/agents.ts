'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchAgents } from '@/lib/api/agent-full-client';
import type { Agent } from '@/lib/types/agent-full';

const agentQueryKeys = {
  list: (tenantId: string, projectId: string) => ['agents', tenantId, projectId] as const,
};

export function useAgentsListQuery({
  tenantId = '',
  projectId = '',
  enabled = true,
}: {
  tenantId?: string;
  projectId?: string;
  enabled?: boolean;
}) {
  return useQuery<Agent[]>({
    queryKey: agentQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchAgents(tenantId, projectId);
      return response.data;
    },
    enabled: Boolean(enabled && tenantId && projectId),
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load agents',
    },
  });
}

export function useAgentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useAgentsListQuery({ tenantId, projectId, enabled });
}
