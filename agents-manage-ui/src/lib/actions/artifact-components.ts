/**
 * Server actions for artifact components operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import type { ArtifactComponent } from '../api/artifact-components';
import {
  createArtifactComponent,
  deleteArtifactComponent,
  fetchArtifactComponents,
  updateArtifactComponent,
} from '../api/artifact-components';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all artifacts
 */
export async function fetchArtifactComponentsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<ArtifactComponent[]>> {
  try {
    const result = await fetchArtifactComponents(tenantId, projectId);
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
 * Create a new artifact
 */
export async function createArtifactComponentAction(
  tenantId: string,
  projectId: string,
  data: ArtifactComponent
): Promise<ActionResult<ArtifactComponent>> {
  try {
    const result = await createArtifactComponent(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/artifacts`);
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
 * Update an existing artifact
 */
export async function updateArtifactComponentAction(
  tenantId: string,
  projectId: string,
  data: ArtifactComponent
): Promise<ActionResult<ArtifactComponent>> {
  try {
    const result = await updateArtifactComponent(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/artifacts`);
    revalidatePath(`/${tenantId}/projects/${projectId}/artifacts/${data.id}`);
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
 * Delete an artifact
 */
export async function deleteArtifactComponentAction(
  tenantId: string,
  projectId: string,
  artifactComponentId: string
): Promise<ActionResult<void>> {
  try {
    await deleteArtifactComponent(tenantId, projectId, artifactComponentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/artifacts`);
    revalidatePath(`/${tenantId}/projects/${projectId}/artifacts/${artifactComponentId}`);
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
