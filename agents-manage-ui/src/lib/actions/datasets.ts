/**
 * Server actions for datasets operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import type { Dataset, DatasetInsert, DatasetUpdate } from '../api/datasets';
import {
  createDataset,
  deleteDataset,
  fetchDataset,
  fetchDatasets,
  updateDataset,
} from '../api/datasets';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all datasets
 */
export async function fetchDatasetsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Dataset[]>> {
  try {
    const result = await fetchDatasets(tenantId, projectId);
    return {
      success: true,
      data: result.data,
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
 * Fetch a single dataset
 */
export async function fetchDatasetAction(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ActionResult<Dataset>> {
  try {
    const result = await fetchDataset(tenantId, projectId, datasetId);
    return {
      success: true,
      data: result,
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
 * Create a new dataset
 */
export async function createDatasetAction(
  tenantId: string,
  projectId: string,
  data: DatasetInsert
): Promise<ActionResult<Dataset>> {
  try {
    const result = await createDataset(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets`);
    return {
      success: true,
      data: result,
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
 * Update an existing dataset
 */
export async function updateDatasetAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  data: DatasetUpdate
): Promise<ActionResult<Dataset>> {
  try {
    const result = await updateDataset(tenantId, projectId, datasetId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets`);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return {
      success: true,
      data: result,
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
 * Delete a dataset
 */
export async function deleteDatasetAction(
  tenantId: string,
  projectId: string,
  datasetId: string
): Promise<ActionResult<void>> {
  try {
    await deleteDataset(tenantId, projectId, datasetId);
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
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}
