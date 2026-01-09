'use server';

import { revalidatePath } from 'next/cache';
import type {
  DatasetRunConfig,
  DatasetRunConfigInsert,
  DatasetRunConfigUpdate,
} from '../api/dataset-run-configs';
import {
  createDatasetRunConfig as apiCreateDatasetRunConfig,
  deleteDatasetRunConfig as apiDeleteDatasetRunConfig,
  fetchDatasetRunConfig as apiFetchDatasetRunConfig,
  fetchDatasetRunConfigs as apiFetchDatasetRunConfigs,
  updateDatasetRunConfig as apiUpdateDatasetRunConfig,
} from '../api/dataset-run-configs';
import { ApiError } from '../types/errors';

export type ActionResult<T = void> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export async function fetchDatasetRunConfigsAction(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ActionResult<DatasetRunConfig[]>> {
  try {
    const response = await apiFetchDatasetRunConfigs(tenantId, projectId, datasetId);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dataset run configs',
      code: 'unknown_error',
    };
  }
}

export async function fetchDatasetRunConfigAction(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<ActionResult<DatasetRunConfig>> {
  try {
    const response = await apiFetchDatasetRunConfig(tenantId, projectId, runConfigId);
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
      error: error instanceof Error ? error.message : 'Failed to fetch dataset run config',
      code: 'unknown_error',
    };
  }
}

export async function createDatasetRunConfigAction(
  tenantId: string,
  projectId: string,
  data: DatasetRunConfigInsert
): Promise<ActionResult<DatasetRunConfig>> {
  try {
    const response = await apiCreateDatasetRunConfig(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${data.datasetId}`);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error('Error in createDatasetRunConfigAction:', error);
    if (error instanceof ApiError) {
      console.error('ApiError details:', {
        message: error.message,
        code: error.error.code,
        status: error.status,
        error: error.error,
      });
      return {
        success: false,
        error: error.message || 'Failed to create dataset run config',
        code: error.error.code,
      };
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Failed to create dataset run config';

    return {
      success: false,
      error: errorMessage,
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

export async function deleteDatasetRunConfigAction(
  tenantId: string,
  projectId: string,
  runConfigId: string
): Promise<ActionResult<void>> {
  try {
    await apiDeleteDatasetRunConfig(tenantId, projectId, runConfigId);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets`);
    return {
      success: true,
      data: undefined,
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
      error: error instanceof Error ? error.message : 'Failed to delete dataset run config',
      code: 'unknown_error',
    };
  }
}
