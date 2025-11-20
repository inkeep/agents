'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeEvalApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface DatasetRun {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  datasetRunConfigId: string;
  evaluationJobConfigId?: string | null;
  runConfigName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRunConversation {
  id: string;
  conversationId: string;
  datasetRunId: string;
  output?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRunItemWithConversations {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  input?: {
    messages: Array<{ role: string; content: unknown }>;
    headers?: Record<string, string>;
  } | null;
  expectedOutput?: Array<{ role: string; content: unknown }> | null;
  simulationAgent?: {
    stopWhen?: unknown;
    prompt: string;
    model: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
  conversations: DatasetRunConversation[];
}

export interface DatasetRunWithConversations extends DatasetRun {
  runConfigName?: string | null;
  conversations: DatasetRunConversation[];
  items: DatasetRunItemWithConversations[];
}

export async function fetchDatasetRuns(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ListResponse<DatasetRun>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<ListResponse<DatasetRun>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/datasets/${datasetId}/runs`
  );
}

export async function fetchDatasetRun(
  tenantId: string,
  projectId: string,
  runId: string
): Promise<SingleResponse<DatasetRunWithConversations>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeEvalApiRequest<SingleResponse<DatasetRunWithConversations>>(
    `tenants/${tenantId}/projects/${projectId}/evaluations/dataset-runs/${runId}`
  );
}
