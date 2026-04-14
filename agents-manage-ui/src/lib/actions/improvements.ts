'use server';

import type {
  ConflictItem,
  ConflictResolution,
  EvalSummaryResponse,
  MergeResult,
  PrepareImprovementResponse,
  RevertRowInput,
} from '../api/improvements';
import {
  fetchImprovementEvalSummary,
  mergeImprovement,
  prepareImprovement,
  rejectImprovement,
  revertImprovementRows,
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

export async function prepareImprovementAction(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  agentId?: string,
  additionalContext?: string
): Promise<ActionResult<PrepareImprovementResponse>> {
  try {
    const result = await prepareImprovement(
      tenantId,
      projectId,
      feedbackIds,
      agentId,
      additionalContext
    );
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to prepare improvement',
      code: 'unknown_error',
    };
  }
}

export type MergeActionResult =
  | { success: true; data: { success: true; message: string } }
  | { success: false; error: string; code?: string; conflicts?: ConflictItem[] };

export async function mergeImprovementAction(
  tenantId: string,
  projectId: string,
  branchName: string,
  resolutions?: ConflictResolution[]
): Promise<MergeActionResult> {
  try {
    const result = await mergeImprovement(tenantId, projectId, branchName, resolutions);
    if (!result.success) {
      return {
        success: false,
        error: result.message,
        code: 'conflict',
        conflicts: result.conflicts,
      };
    }
    return { success: true, data: result };
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
  rows: RevertRowInput[]
): Promise<ActionResult<{ success: boolean; message: string }>> {
  try {
    const result = await revertImprovementRows(tenantId, projectId, branchName, rows);
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
