'use server';

import { makeManagementApiRequest } from './api-config';

export interface AgentRelation {
  id: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  datasetId?: string;
  evaluatorId?: string;
  createdAt: string;
  updatedAt: string;
}

function evalsPath(tenantId: string, projectId: string) {
  return `tenants/${tenantId}/projects/${projectId}/evals`;
}

export async function fetchDatasetAgents(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<AgentRelation[]> {


  const res = await makeManagementApiRequest<{ data: AgentRelation[] }>(
    `${evalsPath(tenantId, projectId)}/datasets/${datasetId}/agents`
  );
  return res.data;
}

export async function addDatasetAgent(
  tenantId: string,
  projectId: string,
  datasetId: string,
  agentId: string
): Promise<AgentRelation> {


  const res = await makeManagementApiRequest<{ data: AgentRelation }>(
    `${evalsPath(tenantId, projectId)}/datasets/${datasetId}/agents/${agentId}`,
    { method: 'POST' }
  );
  return res.data;
}

export async function removeDatasetAgent(
  tenantId: string,
  projectId: string,
  datasetId: string,
  agentId: string
): Promise<void> {


  await makeManagementApiRequest(
    `${evalsPath(tenantId, projectId)}/datasets/${datasetId}/agents/${agentId}`,
    { method: 'DELETE' }
  );
}

export async function fetchEvaluatorAgents(
  tenantId: string,
  projectId: string,
  evaluatorId: string
): Promise<AgentRelation[]> {


  const res = await makeManagementApiRequest<{ data: AgentRelation[] }>(
    `${evalsPath(tenantId, projectId)}/evaluators/${evaluatorId}/agents`
  );
  return res.data;
}

export async function addEvaluatorAgent(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  agentId: string
): Promise<AgentRelation> {


  const res = await makeManagementApiRequest<{ data: AgentRelation }>(
    `${evalsPath(tenantId, projectId)}/evaluators/${evaluatorId}/agents/${agentId}`,
    { method: 'POST' }
  );
  return res.data;
}

export async function removeEvaluatorAgent(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  agentId: string
): Promise<void> {


  await makeManagementApiRequest(
    `${evalsPath(tenantId, projectId)}/evaluators/${evaluatorId}/agents/${agentId}`,
    { method: 'DELETE' }
  );
}
