'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type Evaluator, fetchEvaluators } from '@/lib/api/evaluators';

const evaluatorQueryKeys = {
  list: (tenantId: string, projectId: string, agentId?: string) =>
    ['evaluators', tenantId, projectId, agentId ?? 'all'] as const,
};

export function useEvaluatorsQuery({
  enabled = true,
  agentId,
}: {
  enabled?: boolean;
  agentId?: string;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  return useQuery<Evaluator[]>({
    queryKey: evaluatorQueryKeys.list(tenantId, projectId, agentId),
    async queryFn() {
      const response = await fetchEvaluators(tenantId, projectId, { agentId });
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load evaluators',
    },
  });
}
