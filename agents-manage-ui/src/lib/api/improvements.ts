import { makeManagementApiRequest } from './api-config';

export interface ImprovementRun {
  branchName: string;
  agentId: string;
  timestamp: string;
}

export interface ImprovementListResponse {
  data: ImprovementRun[];
}

export async function fetchImprovements(
  tenantId: string,
  projectId: string
): Promise<ImprovementListResponse> {
  const response = await makeManagementApiRequest<ImprovementListResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements`
  );
  return response;
}

export async function triggerImprovement(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  agentId?: string
): Promise<{ branchName: string; conversationId: string }> {
  const response = await makeManagementApiRequest<{
    branchName: string;
    conversationId: string;
  }>(`tenants/${tenantId}/projects/${projectId}/improvements/trigger`, {
    method: 'POST',
    body: JSON.stringify({ feedbackIds, agentId }),
  });
  return response;
}

export interface ImprovementDiffSummary {
  tableName: string;
  diffType: string;
  dataChange: boolean;
  schemaChange: boolean;
}

export interface ImprovementDiffResponse {
  branchName: string;
  summary: ImprovementDiffSummary[];
  tables: Record<string, Record<string, unknown>[]>;
}

export async function fetchImprovementDiff(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ImprovementDiffResponse> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<ImprovementDiffResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/diff`
  );
  return response;
}

export async function mergeImprovement(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<{ success: boolean; message: string }> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<{ success: boolean; message: string }>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/merge`,
    { method: 'POST' }
  );
  return response;
}

export interface ImprovementConversationMessage {
  role: string;
  content: unknown;
  createdAt?: string;
}

export interface ImprovementConversationResponse {
  conversationId: string | null;
  messages: ImprovementConversationMessage[];
}

export async function fetchImprovementConversation(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ImprovementConversationResponse> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<ImprovementConversationResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/conversation`
  );
  return response;
}

export async function rejectImprovement(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<{ success: boolean; message: string }> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<{ success: boolean; message: string }>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/reject`,
    { method: 'POST' }
  );
  return response;
}
