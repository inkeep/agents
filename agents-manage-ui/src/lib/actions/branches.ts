'use server';

import { revalidatePath } from 'next/cache';
import {
  type Branch,
  deleteBranch,
  fetchBranches,
  type MergeResult,
  mergeBranch,
} from '../api/branches';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function listBranchesAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Branch[]>> {
  try {
    const result = await fetchBranches(tenantId, projectId);
    return { success: true, data: result.data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function deleteBranchAction(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<ActionResult<void>> {
  try {
    await deleteBranch(tenantId, projectId, branchName);
    revalidatePath(`/${tenantId}/projects/${projectId}/branches`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function mergeBranchAction(
  tenantId: string,
  projectId: string,
  branchName: string,
  message?: string
): Promise<ActionResult<MergeResult>> {
  try {
    const result = await mergeBranch(tenantId, projectId, branchName, message);
    revalidatePath(`/${tenantId}/projects/${projectId}/branches`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}
