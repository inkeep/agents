'use client';

import type { AvailableModel, ModelType } from '@inkeep/agents-core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { getAvailableModelsAction } from '@/lib/actions/available-models';

const availableModelsQueryKeys = {
  list: (tenantId: string, type: ModelType) => ['available-models', tenantId, type] as const,
};

export interface ModelOption {
  value: string;
  label: string;
}

function toModelOptions(models: AvailableModel[]): ModelOption[] {
  return models.map((m) => ({ value: m.value, label: m.label }));
}

export interface AvailableModelOptions {
  anthropic: ModelOption[];
  openai: ModelOption[];
  google: ModelOption[];
}

export function useAvailableModelsQuery({
  type = 'chat',
  enabled = true,
}: { type?: ModelType; enabled?: boolean } = {}) {
  'use memo';
  const { tenantId } = useParams<{ tenantId?: string }>();

  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  return useQuery<AvailableModelOptions | null>({
    queryKey: availableModelsQueryKeys.list(tenantId, type),
    async queryFn() {
      const response = await getAvailableModelsAction(tenantId, type);
      if (!response.success || !response.data) {
        return null;
      }
      return {
        anthropic: toModelOptions(response.data.anthropic),
        openai: toModelOptions(response.data.openai),
        google: toModelOptions(response.data.google),
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes client-side
    meta: {
      defaultError: 'Failed to load available models',
    },
  });
}
