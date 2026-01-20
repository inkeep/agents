'use server';

import { revalidatePath } from 'next/cache';
import {
  createEvaluationJobConfig,
  deleteEvaluationJobConfig,
  type EvaluationJobConfig,
  type EvaluationJobConfigInsert,
} from '../api/evaluation-job-configs';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Create a new evaluation job config
 */
export async function createEvaluationJobConfigAction(
  tenantId: string,
  projectId: string,
  configData: EvaluationJobConfigInsert
): Promise<ActionResult<EvaluationJobConfig>> {
  try {
    const config = await createEvaluationJobConfig(tenantId, projectId, configData);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return {
      success: true,
      data: config,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

/**
 * Delete an evaluation job config
 */
export async function deleteEvaluationJobConfigAction(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ActionResult<void>> {
  try {
    await deleteEvaluationJobConfig(tenantId, projectId, configId);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}
