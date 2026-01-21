'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';

const externalAgentQueryKeys = {
  list: (tenantId: string, projectId: string) => ['external-agents', tenantId, projectId] as const,
};

export function useExternalAgentsQuery(tenantId: string, projectId: string) {
  return useQuery<ExternalAgent[]>({
    queryKey: externalAgentQueryKeys.list(tenantId, projectId),
    queryFn: () => fetchExternalAgents(tenantId, projectId),
    enabled: Boolean(tenantId && projectId),
    staleTime: 30_000,
    placeholderData: [],
    meta: {
      defaultError: 'Failed to load external agents',
    },
  });
}
