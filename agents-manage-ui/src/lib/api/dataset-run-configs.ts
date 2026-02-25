'use server';

import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface DatasetRunConfig {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRunConfigInsert {
  name: string;
  description?: string;
  datasetId: string;
  agentIds?: string[];
  evaluatorIds?: string[];
}

export interface DatasetRunConfigUpdate {
  name?: string;
  description?: string;
  agentIds?: string[];
  evaluatorIds?: string[];
}

export async function createDatasetRunConfig(
  tenantId: string,
  projectId: string,
  data: DatasetRunConfigInsert
): Promise<SingleResponse<DatasetRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export interface TriggerDatasetRunResponse {
  datasetRunId: string;
  status: 'pending';
  totalItems: number;
}

export async function triggerDatasetRun(
  tenantId: string,
  projectId: string,
  runConfigId: string,
  data?: { evaluatorIds?: string[] }
): Promise<TriggerDatasetRunResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<TriggerDatasetRunResponse>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}/run`,
    {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }
  );
}

export async function updateDatasetRunConfig(
  tenantId: string,
  projectId: string,
  runConfigId: string,
  data: DatasetRunConfigUpdate
): Promise<SingleResponse<DatasetRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}
