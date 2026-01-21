'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  type EvaluationSuiteConfig,
  fetchEvaluationSuiteConfig,
  fetchEvaluationSuiteConfigEvaluators,
} from '@/lib/api/evaluation-suite-configs';

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

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId && configId) && (options?.enabled ?? true);

  return useQuery<EvaluationSuiteConfig | null>({
    queryKey: evaluationSuiteConfigQueryKeys.detail(tenantId, projectId, configId),
    async queryFn() {
      const response = await fetchEvaluationSuiteConfig(tenantId, projectId, configId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: null,
    // force `queryFn` still runs on mount
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

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(tenantId && projectId && configId) && (options?.enabled ?? true);

  return useQuery<{ evaluatorId: string }[]>({
    queryKey: evaluationSuiteConfigQueryKeys.evaluators(tenantId, projectId, configId),
    async queryFn() {
      const response = await fetchEvaluationSuiteConfigEvaluators(tenantId, projectId, configId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    initialDataUpdatedAt: 0,
  });
}
