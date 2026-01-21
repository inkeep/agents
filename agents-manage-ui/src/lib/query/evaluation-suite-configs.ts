'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchEvaluationSuiteConfig,
  fetchEvaluationSuiteConfigEvaluators,
  type EvaluationSuiteConfig,
} from '@/lib/api/evaluation-suite-configs';
import { useParams } from 'next/navigation';

const evaluationSuiteConfigQueryKeys = {
  detail: (tenantId: string, projectId: string, configId: string) =>
    ['evaluation-suite-config', tenantId, projectId, configId] as const,
  evaluators: (tenantId: string, projectId: string, configId: string) =>
    ['evaluation-suite-config-evaluators', tenantId, projectId, configId] as const,
};

export function useEvaluationSuiteConfigQuery(configId: string, options?: { enabled?: boolean }) {
  'use memo';

  const { tenantId, projectId } = useParams<{
    tenantId?: string;
    projectId?: string;
  }>();

  if (!tenantId || !projectId || !configId) {
    throw new Error('tenantId, projectId, and configId are required');
  }

  const enabled = Boolean(tenantId && projectId && configId) && (options?.enabled ?? true);

  return useQuery<EvaluationSuiteConfig | null>({
    queryKey: evaluationSuiteConfigQueryKeys.detail(tenantId, projectId, configId),
    async queryFn() {
      const response = await fetchEvaluationSuiteConfig(tenantId, projectId, configId);
      return response.data ?? null;
    },
    enabled,
    staleTime: 30_000,
    initialData: null,
    initialDataUpdatedAt: 0,
  });
}

export function useEvaluationSuiteConfigEvaluatorsQuery(
  configId: string,
  options?: { enabled?: boolean }
) {
  'use memo';

  const { tenantId, projectId } = useParams<{
    tenantId?: string;
    projectId?: string;
  }>();

  if (!tenantId || !projectId || !configId) {
    throw new Error('tenantId, projectId, and configId are required');
  }

  const enabled = Boolean(tenantId && projectId && configId) && (options?.enabled ?? true);

  return useQuery<{ evaluatorId: string }[]>({
    queryKey: evaluationSuiteConfigQueryKeys.evaluators(tenantId, projectId, configId),
    async queryFn() {
      if (!tenantId || !projectId || !configId) {
        throw new Error('tenantId, projectId, and configId are required');
      }
      const response = await fetchEvaluationSuiteConfigEvaluators(tenantId, projectId, configId);
      return response.data ?? [];
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    initialDataUpdatedAt: 0,
  });
}
