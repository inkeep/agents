'use server';

import { revalidatePath } from 'next/cache';
import {
  rerunDatasetRun as apiRerunDatasetRun,
  type RerunDatasetRunOptions,
  type RerunDatasetRunResponse,
} from '../api/dataset-runs';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Rerun a past dataset run. Creates a new run row using the current dataset items
 * and (by default) the evaluators + branch from the source run.
 */
export async function rerunDatasetRunAction(
  tenantId: string,
  projectId: string,
  runId: string,
  datasetId: string,
  options: RerunDatasetRunOptions = {}
): Promise<ActionResult<RerunDatasetRunResponse>> {
  try {
    const response = await apiRerunDatasetRun(tenantId, projectId, runId, options);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true, data: response };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rerun dataset run',
      code: 'unknown_error',
    };
  }
}
