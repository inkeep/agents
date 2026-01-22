'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';

export function useExternalAgentsQuery({ disabled }: { disabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<ExternalAgent[]>({
    queryKey: ['external-agents', tenantId, projectId],
    queryFn: () => fetchExternalAgents(tenantId, projectId),
    enabled: !disabled,
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load external agents',
    },
  });
}
