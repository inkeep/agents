'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';

export function useExternalAgentsQuery(tenantId: string, projectId: string) {
  'use memo';
  return useQuery<ExternalAgent[]>({
    queryKey: ['external-agents', tenantId, projectId],
    queryFn: () => fetchExternalAgents(tenantId, projectId),
    enabled: Boolean(tenantId && projectId),
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load external agents',
    },
  });
}
