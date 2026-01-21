'use client';

import { useQuery } from '@tanstack/react-query';
import { type Evaluator, fetchEvaluators } from '@/lib/api/evaluators';

const evaluatorQueryKeys = {
  list: (tenantId: string, projectId: string) => ['evaluators', tenantId, projectId] as const,
};

export function useEvaluatorsQuery(
  tenantId: string,
  projectId: string,
  options?: { enabled?: boolean }
) {
  const enabled = Boolean(tenantId && projectId) && (options?.enabled ?? true);

  return useQuery<Evaluator[]>({
    queryKey: evaluatorQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchEvaluators(tenantId, projectId);
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
