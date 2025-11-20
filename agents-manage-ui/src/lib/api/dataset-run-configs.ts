'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
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

export async function fetchDatasetRunConfigs(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ListResponse<DatasetRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/run-configs`
  );
}

export async function fetchDatasetRunConfig(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<SingleResponse<DatasetRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/dataset-run-configs/${runConfigId}`
  );
}

export async function createDatasetRunConfig(
  tenantId: string,
  projectId: string,
  data: DatasetRunConfigInsert
): Promise<SingleResponse<DatasetRunConfig>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/dataset-run-configs`,
    {
      method: 'POST',
      body: JSON.stringify(data),
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

  return makeEvalApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/dataset-run-configs/${runConfigId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteDatasetRunConfig(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeEvalApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evaluations/dataset-run-configs/${runConfigId}`,
    {
      method: 'DELETE',
    }
  );
}
