/**
 * Server actions for data components operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import type { DataComponent } from '../api/data-components';
import {
  createDataComponent,
  deleteDataComponent,
  fetchDataComponents,
  updateDataComponent,
} from '../api/data-components';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all data components
 */
export async function fetchDataComponentsAction(
  tenantId: string,
  projectId: string,
  ref?: string
): Promise<ActionResult<DataComponent[]>> {
  try {
    const result = await fetchDataComponents(tenantId, projectId, {
      queryParams: { ref },
    });
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
 * Create a new data component
 */
export async function createDataComponentAction(
  tenantId: string,
  projectId: string,
  data: DataComponent,
  ref?: string
): Promise<ActionResult<DataComponent>> {
  try {
    const result = await createDataComponent(tenantId, projectId, data, {
      queryParams: { ref },
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/components`);
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
 * Update an existing data component
 */
export async function updateDataComponentAction(
  tenantId: string,
  projectId: string,
  data: DataComponent,
  ref?: string
): Promise<ActionResult<DataComponent>> {
  try {
    const result = await updateDataComponent(tenantId, projectId, data, {
      queryParams: { ref },
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/components`);
    revalidatePath(`/${tenantId}/projects/${projectId}/components/${data.id}`);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      const errorMessage = error.error.message ?? error.message;
      return {
        success: false,
        error: errorMessage,
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
 * Delete a data component
 */
export async function deleteDataComponentAction(
  tenantId: string,
  projectId: string,
  dataComponentId: string,
  ref?: string
): Promise<ActionResult<void>> {
  try {
    await deleteDataComponent(tenantId, projectId, dataComponentId, {
      queryParams: { ref },
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/components`);
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
