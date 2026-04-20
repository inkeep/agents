import { ApiError } from '../types/errors';
import { makeManagementApiRequest } from './api-config';

export interface ImprovementRun {
  branchName: string;
  conversationIds: string[];
  triggeredBy: string;
  status: string;
  feedbackIds: string[] | null;
  createdAt: string;
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

export interface TriggerImprovementResponse {
  branchName: string;
  conversationId: string;
}

export async function triggerImprovement(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  additionalContext?: string
): Promise<TriggerImprovementResponse> {
  const response = await makeManagementApiRequest<TriggerImprovementResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/trigger`,
    {
      method: 'POST',
      body: JSON.stringify({ feedbackIds, additionalContext }),
    }
  );
  return response;
}

export interface CreateCoPilotRunResponse {
  id: string;
  conversationIds: string[];
}

export async function createCoPilotRun(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<CreateCoPilotRunResponse> {
  const response = await makeManagementApiRequest<CreateCoPilotRunResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/copilot-runs`,
    {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    }
  );
  return response;
}

export interface ContinueImprovementResponse {
  conversationId: string;
}

export async function continueImprovement(
  tenantId: string,
  projectId: string,
  branchName: string,
  message: string,
): Promise<ContinueImprovementResponse> {
  const encoded = encodeURIComponent(branchName);
  const response = await makeManagementApiRequest<ContinueImprovementResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/continue`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
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
  targetBranch: string;
  sourceHash?: string;
  targetHash?: string;
  hasConflicts: boolean;
  conflicts: ConflictItem[];
  summary: ImprovementDiffSummary[];
  tables: Record<string, Record<string, unknown>[]>;
  fkLinks?: FkColumnLink[];
  pkMap?: Record<string, string[]>;
}

export async function fetchImprovementDiff(
  tenantId: string,
  projectId: string,
  branchName: string,
  options?: { targetBranch?: string }
): Promise<ImprovementDiffResponse> {
  const encoded = encodeURIComponent(branchName);
  const query = options?.targetBranch
    ? `?targetBranch=${encodeURIComponent(options.targetBranch)}`
    : '';
  const response = await makeManagementApiRequest<ImprovementDiffResponse>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/diff${query}`
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

export interface MergeImprovementResponse {
  success: boolean;
  message: string;
  mergeCommitHash?: string;
  sourceBranch: string;
  targetBranch: string;
}

export type MergeResult =
  | {
      success: true;
      message: string;
      mergeCommitHash?: string;
      sourceBranch: string;
      targetBranch: string;
    }
  | { success: false; conflicts: ConflictItem[]; message: string };

export interface MergeImprovementOptions {
  resolutions?: ConflictResolution[];
  targetBranch?: string;
}

export async function mergeImprovement(
  tenantId: string,
  projectId: string,
  branchName: string,
  options?: MergeImprovementOptions
): Promise<MergeResult> {
  const encoded = encodeURIComponent(branchName);
  const url = `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/merge`;
  const payload: Record<string, unknown> = {};
  if (options?.resolutions) payload.resolutions = options.resolutions;
  if (options?.targetBranch) payload.targetBranch = options.targetBranch;

  try {
    const response = await makeManagementApiRequest<MergeImprovementResponse>(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      success: true,
      message: response.message,
      mergeCommitHash: response.mergeCommitHash,
      sourceBranch: response.sourceBranch,
      targetBranch: response.targetBranch,
    };
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
  rows: RevertRowInput[],
  options?: { targetBranch?: string }
): Promise<{ success: boolean; message: string }> {
  const encoded = encodeURIComponent(branchName);
  const body: Record<string, unknown> = { rows };
  if (options?.targetBranch) body.targetBranch = options.targetBranch;
  const response = await makeManagementApiRequest<{ success: boolean; message: string }>(
    `tenants/${tenantId}/projects/${projectId}/improvements/${encoded}/revert`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  return response;
}

export interface ImprovementConversationMessage {
  role: string;
  content: unknown;
  createdAt?: string;
}

export interface ImprovementFeedbackItem {
  id: string;
  type: string | null;
  details: unknown | null;
  createdAt: string | null;
}

export interface ImprovementConversationResponse {
  conversationIds: string[];
  status?: string;
  messages: ImprovementConversationMessage[];
  feedbackItems?: ImprovementFeedbackItem[];
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
