import { ApiError } from '../types/errors';
import { makeManagementApiRequest } from './api-config';

export interface ImprovementRun {
  branchName: string;
  agentId: string;
  timestamp: string;
  agentStatus?: string;
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

export interface PrepareImprovementResponse {
  branchName: string;
  conversationId: string;
  chatPayload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
    conversationId: string;
    headers: Record<string, string>;
  };
  targetHeaders: Record<string, string>;
}

export async function prepareImprovement(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  agentId?: string,
  additionalContext?: string
): Promise<PrepareImprovementResponse> {
  const response = await makeManagementApiRequest<PrepareImprovementResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/trigger`,
    {
      method: 'POST',
      body: JSON.stringify({ feedbackIds, agentId, additionalContext }),
    }
  );
  return response;
}

export interface ImprovementDiffSummary {
  tableName: string;
  diffType: string;
  dataChange: boolean;
  schemaChange: boolean;
}

export interface FkColumnLink {
  childTable: string;
  parentTable: string;
  columns: { child: string; parent: string }[];
}

export interface ImprovementDiffResponse {
  branchName: string;
  summary: ImprovementDiffSummary[];
  tables: Record<string, Record<string, unknown>[]>;
  fkLinks?: FkColumnLink[];
  pkMap?: Record<string, string[]>;
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

export interface ConflictItem {
  table: string;
  primaryKey: Record<string, string>;
  ourDiffType: string;
  theirDiffType: string;
  base: Record<string, unknown> | null;
  ours: Record<string, unknown> | null;
  theirs: Record<string, unknown> | null;
}

export interface ConflictResolution {
  table: string;
  primaryKey: Record<string, string>;
  rowDefaultPick: 'ours' | 'theirs';
  columns?: Record<string, 'ours' | 'theirs'>;
}

export interface MergeConflictResponse {
  conflicts: ConflictItem[];
}

export type MergeResult =
  | { success: true; message: string }
  | { success: false; conflicts: ConflictItem[]; message: string };

export async function mergeImprovement(
  tenantId: string,
  projectId: string,
  branchName: string,
  resolutions?: ConflictResolution[]
): Promise<MergeResult> {
  const encoded = encodeURIComponent(branchName);
  const url = `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/merge`;
  const body = resolutions ? JSON.stringify({ resolutions }) : JSON.stringify({});

  try {
    const response = await makeManagementApiRequest<{ success: boolean; message: string }>(url, {
      method: 'POST',
      body,
    });
    return { success: true, message: response.message };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const errorData = error.data as MergeConflictResponse | undefined;
      const conflicts = errorData?.conflicts ?? [];
      return {
        success: false,
        conflicts,
        message: error.message,
      };
    }
    throw error;
  }
}

export interface RevertRowInput {
  table: string;
  primaryKey: Record<string, string>;
  diffType: string;
}

export async function revertImprovementRows(
  tenantId: string,
  projectId: string,
  branchName: string,
  rows: RevertRowInput[]
): Promise<{ success: boolean; message: string }> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<{ success: boolean; message: string }>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/revert`,
    {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }
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
  agentStatus?: string;
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

export interface EvalSummaryItemStatus {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
}

export interface EvalSummaryResult {
  id: string;
  evaluatorId: string;
  evaluatorName: string;
  conversationId: string;
  input: string | null;
  output: unknown | null;
  passed: 'passed' | 'failed' | 'no_criteria' | 'pending';
  createdAt: string;
}

export interface EvalSummaryDatasetRun {
  id: string;
  datasetId: string;
  datasetName: string;
  runConfigName: string | null;
  createdAt: string;
  phase: 'baseline' | 'post_change' | 'unknown';
  ref: { name: string; hash: string; type: string } | null;
  items: EvalSummaryItemStatus;
  evaluationJobConfigId: string | null;
  evaluationResults: EvalSummaryResult[];
}

export interface EvalSummaryResponse {
  datasetRuns: EvalSummaryDatasetRun[];
}

export async function fetchImprovementEvalSummary(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<EvalSummaryResponse> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<EvalSummaryResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/eval-summary`
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
    { method: 'POST', body: JSON.stringify({}) }
  );
  return response;
}
