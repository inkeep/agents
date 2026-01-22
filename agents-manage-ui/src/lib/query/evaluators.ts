'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { type Evaluator, fetchEvaluators } from '@/lib/api/evaluators';

const evaluatorQueryKeys = {
  list: (tenantId: string, projectId: string) => ['evaluators', tenantId, projectId] as const,
};

export function useEvaluatorsQuery(options: { disabled?: boolean } = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId) && !options.disabled;

  return useQuery<Evaluator[]>({
    queryKey: evaluatorQueryKeys.list(tenantId, projectId),
    async queryFn() {
      const response = await fetchEvaluators(tenantId, projectId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load evaluators',
    },
  });
}
