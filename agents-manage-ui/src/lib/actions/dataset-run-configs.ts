'use server';

import { revalidatePath } from 'next/cache';
import type {
  DatasetRunConfig,
  DatasetRunConfigInsert,
  DatasetRunConfigUpdate,
} from '../api/dataset-run-configs';
import {
  createDatasetRunConfig as apiCreateDatasetRunConfig,
  triggerDatasetRun as apiTriggerDatasetRun,
  updateDatasetRunConfig as apiUpdateDatasetRunConfig,
} from '../api/dataset-run-configs';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function createDatasetRunConfigAction(
  tenantId: string,
  projectId: string,
  data: DatasetRunConfigInsert
): Promise<ActionResult<DatasetRunConfig>> {
  try {
    const response = await apiCreateDatasetRunConfig(tenantId, projectId, data);
    await apiTriggerDatasetRun(tenantId, projectId, response.data.id, {
      evaluatorIds: data.evaluatorIds,
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${data.datasetId}`);
    return { success: true, data: response.data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create dataset run config',
      code: 'unknown_error',
    };
  }
}

export async function updateDatasetRunConfigAction(
  tenantId: string,
  projectId: string,
  runConfigId: string,
  data: DatasetRunConfigUpdate
): Promise<ActionResult<DatasetRunConfig>> {
  try {
    const response = await apiUpdateDatasetRunConfig(tenantId, projectId, runConfigId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets`);
    return {
      success: true,
      data: response.data,
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
      error: error instanceof Error ? error.message : 'Failed to update dataset run config',
      code: 'unknown_error',
    };
  }
}
