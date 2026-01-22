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

export function useEvaluationSuiteConfigQuery({
  suiteConfigId = '',
  disabled,
}: {
  suiteConfigId?: string;
  disabled?: boolean;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(suiteConfigId) && !disabled;

  return useQuery<EvaluationSuiteConfig | null>({
    queryKey: evaluationSuiteConfigQueryKeys.detail(tenantId, projectId, suiteConfigId),
    async queryFn() {
      const response = await fetchEvaluationSuiteConfig(tenantId, projectId, suiteConfigId);
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: null,
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load suite config',
    },
  });
}

export function useEvaluationSuiteConfigEvaluatorsQuery({
  suiteConfigId = '',
  disabled,
}: {
  suiteConfigId?: string;
  disabled?: boolean;
} = {}) {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId?: string; projectId?: string }>();

  if (!tenantId || !projectId) {
    throw new Error('tenantId and projectId are required');
  }

  const enabled = Boolean(suiteConfigId) && !disabled;

  return useQuery<{ evaluatorId: string }[]>({
    queryKey: evaluationSuiteConfigQueryKeys.evaluators(tenantId, projectId, suiteConfigId),
    async queryFn() {
      const response = await fetchEvaluationSuiteConfigEvaluators(
        tenantId,
        projectId,
        suiteConfigId
      );
      return response.data;
    },
    enabled,
    staleTime: 30_000,
    initialData: [],
    // force `queryFn` still runs on mount
    initialDataUpdatedAt: 0,
    meta: {
      defaultError: 'Failed to load suite config evaluators',
    },
  });
}
