'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

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
  data?: { evaluatorIds?: string[]; dispatchDelayMs?: number }
): Promise<TriggerDatasetRunResponse> {
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
  return makeManagementApiRequest<SingleResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

export interface DatasetRunConfigSchedule {
  id: string;
  cronExpression: string;
  cronTimezone: string;
  enabled: boolean;
  evaluatorIds?: string[];
  dispatchDelayMs?: number;
  runAsUserId?: string | null;
  runAsUserIds?: string[];
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
}

export interface SetScheduleRequest {
  cronExpression: string;
  cronTimezone?: string;
  enabled?: boolean;
  evaluatorIds?: string[];
  runAsUserId?: string;
  runAsUserIds?: string[];
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
  dispatchDelayMs?: number;
}

export async function getDatasetRunConfigSchedule(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<DatasetRunConfigSchedule | null> {
  return makeManagementApiRequest<DatasetRunConfigSchedule | null>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}/schedule`
  );
}

export async function setDatasetRunConfigSchedule(
  tenantId: string,
  projectId: string,
  runConfigId: string,
  data: SetScheduleRequest
): Promise<DatasetRunConfigSchedule> {
  return makeManagementApiRequest<DatasetRunConfigSchedule>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}/schedule`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function getDatasetRunConfig(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<DatasetRunConfig & { agentIds?: string[]; evaluatorIds?: string[] }> {
  const response = await makeManagementApiRequest<
    SingleResponse<DatasetRunConfig & { agentIds?: string[]; evaluatorIds?: string[] }>
  >(`tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}`);
  return response.data;
}

export async function listDatasetRunConfigsByDataset(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<DatasetRunConfig[]> {
  const response = await makeManagementApiRequest<ListResponse<DatasetRunConfig>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/by-dataset/${datasetId}`
  );
  return response.data;
}

export async function deleteDatasetRunConfigSchedule(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<void> {
  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-run-configs/${runConfigId}/schedule`,
    { method: 'DELETE' }
  );
}
