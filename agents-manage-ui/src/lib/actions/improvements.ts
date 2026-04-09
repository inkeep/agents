'use server';

import { mergeImprovement, rejectImprovement, triggerImprovement } from '../api/improvements';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function triggerImprovementAction(
  tenantId: string,
  projectId: string,
  feedbackIds: string[],
  agentId?: string
): Promise<ActionResult<{ branchName: string; conversationId: string }>> {
  try {
    const result = await triggerImprovement(tenantId, projectId, feedbackIds, agentId);
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

export async function mergeImprovementAction(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ActionResult<{ success: boolean; message: string }>> {
  try {
    const result = await mergeImprovement(tenantId, projectId, branchName);
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
