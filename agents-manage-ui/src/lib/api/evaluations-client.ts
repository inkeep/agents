import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

export interface Evaluator {
  tenantId: string;
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schema: Record<string, unknown>;
  modelConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  tenantId: string;
  id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetItem {
  id: string;
  datasetId: string;
  input: unknown;
  expectedOutput: unknown | null;
  simulationConfig: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationEvaluationConfig {
  tenantId: string;
  id: string;
  name: string;
  description: string;
  conversationFilter: {
    agentIds?: string[];
    projectIds?: string[];
    dateRange?: { startDate: string; endDate: string };
    conversationIds?: string[];
  } | null;
  modelConfig: Record<string, unknown> | null;
  sampleRate: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EvalTestSuiteConfig {
  tenantId: string;
  id: string;
  name: string;
  description: string;
  modelConfig: Record<string, unknown> | null;
  runFrequency: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvalResult {
  id: string;
  suiteRunId: string | null;
  datasetItemId: string | null;
  conversationId: string;
  status: 'pending' | 'done' | 'failed';
  evaluatorId: string;
  reasoning: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchEvaluators(tenantId: string): Promise<ListResponse<Evaluator>> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<ListResponse<Evaluator>>(
    `tenants/${tenantId}/evaluations/evaluators`
  );
}

export async function fetchDatasets(tenantId: string): Promise<ListResponse<Dataset>> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<ListResponse<Dataset>>(
    `tenants/${tenantId}/evaluations/datasets`
  );
}

export async function fetchDataset(tenantId: string, datasetId: string): Promise<{ data: Dataset }> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<{ data: Dataset }>(
    `tenants/${tenantId}/evaluations/datasets/${datasetId}`
  );
}

export async function fetchDatasetItems(datasetId: string): Promise<ListResponse<DatasetItem>> {
  return makeManagementApiRequest<ListResponse<DatasetItem>>(
    `tenants/*/evaluations/datasets/${datasetId}/items`
  );
}

export async function fetchConversationEvaluationConfigs(
  tenantId: string
): Promise<ListResponse<ConversationEvaluationConfig>> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<ListResponse<ConversationEvaluationConfig>>(
    `tenants/${tenantId}/evaluations/configs`
  );
}

export async function fetchEvalTestSuiteConfigs(
  tenantId: string
): Promise<ListResponse<EvalTestSuiteConfig>> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<ListResponse<EvalTestSuiteConfig>>(
    `tenants/${tenantId}/evaluations/test-suite-configs`
  );
}

export async function createDataset(
  tenantId: string,
  data: { name: string; description?: string; metadata?: Record<string, unknown> }
): Promise<{ data: Dataset }> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<{ data: Dataset }>(
    `tenants/${tenantId}/evaluations/datasets`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteDataset(tenantId: string, datasetId: string): Promise<void> {
  validateTenantId(tenantId);
  await makeManagementApiRequest(`tenants/${tenantId}/evaluations/datasets/${datasetId}`, {
    method: 'DELETE',
  });
}

export async function createEvaluator(
  tenantId: string,
  data: {
    name: string;
    description?: string;
    prompt: string;
    schema: Record<string, unknown>;
    modelConfig?: Record<string, unknown>;
  }
): Promise<{ data: Evaluator }> {
  validateTenantId(tenantId);
  return makeManagementApiRequest<{ data: Evaluator }>(
    `tenants/${tenantId}/evaluations/evaluators`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteEvaluator(tenantId: string, evaluatorId: string): Promise<void> {
  validateTenantId(tenantId);
  await makeManagementApiRequest(`tenants/${tenantId}/evaluations/evaluators/${evaluatorId}`, {
    method: 'DELETE',
  });
}

