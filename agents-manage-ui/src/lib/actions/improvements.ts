'use server';

import type {
  ConflictItem,
  ConflictResolution,
  ContinueImprovementResponse,
  CreateCoPilotRunResponse,
  EvalSummaryResponse,
  MergeImprovementOptions,
  RevertRowInput,
  TriggerImprovementResponse,
} from '../api/improvements';
import {
  continueImprovement,
  createCoPilotRun,
  fetchImprovementEvalSummary,
  mergeImprovement,
  rejectImprovement,
  revertImprovementRows,
  triggerImprovement,
} from '../api/improvements';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchImprovementEvalSummaryAction(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ActionResult<EvalSummaryResponse>> {
  try {
    const result = await fetchImprovementEvalSummary(tenantId, projectId, branchName);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch eval summary',
      code: 'unknown_error',
    };
  }
}

export async function createCoPilotRunAction(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<ActionResult<CreateCoPilotRunResponse>> {
  try {
    const result = await createCoPilotRun(tenantId, projectId, conversationId);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create copilot run',
      code: 'unknown_error',
    };
  }
}

export async function continueImprovementAction(
  tenantId: string,
  projectId: string,
  branchName: string,
  message: string
): Promise<ActionResult<ContinueImprovementResponse>> {
  try {
    const result = await continueImprovement(tenantId, projectId, branchName, message);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to continue improvement',
      code: 'unknown_error',
    };
  }
}

export async function triggerImprovementAction(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  additionalContext?: string
): Promise<ActionResult<TriggerImprovementResponse>> {
  try {
    const result = await triggerImprovement(tenantId, projectId, feedbackIds, additionalContext);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger improvement',
      code: 'unknown_error',
    };
  }
}

export type MergeActionResult =
  | {
      success: true;
      data: {
        success: true;
        message: string;
        mergeCommitHash?: string;
        sourceBranch: string;
        targetBranch: string;
      };
    }
  | { success: false; error: string; code?: string; conflicts?: ConflictItem[] };

export async function mergeImprovementAction(
  tenantId: string,
  projectId: string,
  branchName: string,
  options?: { resolutions?: ConflictResolution[]; targetBranch?: string }
): Promise<MergeActionResult> {
  try {
    const mergeOptions: MergeImprovementOptions | undefined = options
      ? { resolutions: options.resolutions, targetBranch: options.targetBranch }
      : undefined;
    const result = await mergeImprovement(tenantId, projectId, branchName, mergeOptions);
    if (!result.success) {
      return {
        success: false,
        error: result.message,
        code: 'conflict',
        conflicts: result.conflicts,
      };
    }
    return {
      success: true,
      data: {
        success: true,
        message: result.message,
        mergeCommitHash: result.mergeCommitHash,
        sourceBranch: result.sourceBranch,
        targetBranch: result.targetBranch,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to merge improvement',
      code: 'unknown_error',
    };
  }
}

export async function revertImprovementRowsAction(
  tenantId: string,
  projectId: string,
  branchName: string,
  rows: RevertRowInput[],
  options?: { targetBranch?: string }
): Promise<ActionResult<{ success: boolean; message: string }>> {
  try {
    const result = await revertImprovementRows(tenantId, projectId, branchName, rows, options);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revert rows',
      code: 'unknown_error',
    };
  }
}

export async function rejectImprovementAction(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ActionResult<{ success: boolean; message: string }>> {
  try {
    const result = await rejectImprovement(tenantId, projectId, branchName);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject improvement',
      code: 'unknown_error',
    };
  }
}
