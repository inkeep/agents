'use server';

import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

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

interface DatasetRunConversation {
  id: string;
  conversationId: string;
  datasetRunId: string;
  agentId?: string | null;
  output?: string | null;
  createdAt: string;
  updatedAt: string;
}

type DatasetMessageRole = 'user' | 'assistant' | 'system';

interface DatasetRunItemWithConversations {
  id: string;
  tenantId: string;
  projectId: string;
  datasetId: string;
  input?: {
    messages: Array<{ role: DatasetMessageRole; content: unknown }>;
  } | null;
  expectedOutput?: Array<{ role: DatasetMessageRole; content: unknown }> | null;
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
  return makeManagementApiRequest<ListResponse<DatasetRun>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/by-dataset/${datasetId}`
  );
}

async function $fetchDatasetRun(
  tenantId: string,
  projectId: string,
  runId: string
): Promise<SingleResponse<DatasetRunWithConversations>> {
  return makeManagementApiRequest<SingleResponse<DatasetRunWithConversations>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/${runId}`
  );
}

export const fetchDatasetRun = cache($fetchDatasetRun);

export interface DatasetRunInvocation {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetRunId: string;
  datasetItemId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string | null;
  completedAt?: string | null;
  attemptNumber: number;
  createdAt: string;
  conversationId?: string | null;
}

export async function fetchDatasetRunItems(
  tenantId: string,
  projectId: string,
  runId: string
): Promise<ListResponse<DatasetRunInvocation>> {
  return makeManagementApiRequest<ListResponse<DatasetRunInvocation>>(
    `tenants/${tenantId}/projects/${projectId}/evals/dataset-runs/${runId}/items`
  );
}
