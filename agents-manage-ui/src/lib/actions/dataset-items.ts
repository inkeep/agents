/**
 * Server Actions for Dataset Items
 *
 * These actions handle mutations and revalidation for dataset items.
 */

'use server';

import { revalidatePath } from 'next/cache';
import {
  createDatasetItem as createDatasetItemApi,
  type DatasetItemInsert,
  type DatasetItemUpdate,
  deleteDatasetItem as deleteDatasetItemApi,
  updateDatasetItem as updateDatasetItemApi,
} from '../api/dataset-items';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a new dataset item
 */
export async function createDatasetItemAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  item: DatasetItemInsert
): Promise<ActionResult> {
  try {
    await createDatasetItemApi(tenantId, projectId, datasetId, item);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create dataset item';
    return { success: false, error: errorMessage };
  }
}

/**
 * Update an existing dataset item
 */
export async function updateDatasetItemAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string,
  item: DatasetItemUpdate
): Promise<ActionResult> {
  try {
    await updateDatasetItemApi(tenantId, projectId, datasetId, itemId, item);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update dataset item';
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a dataset item
 */
export async function deleteDatasetItemAction(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string
): Promise<ActionResult> {
  try {
    await deleteDatasetItemApi(tenantId, projectId, datasetId, itemId);
    revalidatePath(`/${tenantId}/projects/${projectId}/datasets/${datasetId}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete dataset item';
    return { success: false, error: errorMessage };
  }
}
