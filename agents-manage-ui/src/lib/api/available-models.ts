import type { AvailableModelsResponse, ModelType } from '@inkeep/agents-core';
import { makeManagementApiRequest } from './api-config';

export async function fetchAvailableModels(
  tenantId: string,
  type: ModelType = 'chat',
  refresh = false
): Promise<AvailableModelsResponse> {
  const params = new URLSearchParams({ type });
  if (refresh) params.set('refresh', 'true');

  return makeManagementApiRequest<AvailableModelsResponse>(
    `tenants/${tenantId}/available-models?${params.toString()}`
  );
}
