'use server';

import { revalidatePath } from 'next/cache';
import type { ProjectFormData } from '@/components/projects/form/validation';
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  updateProject,
} from '../api/projects';
import { ApiError } from '../types/errors';
import type { Project } from '../types/project';
import type { ActionResult } from './types';

/**
 * Fetch all projects
 */
export async function fetchProjectsAction(tenantId: string): Promise<ActionResult<Project[]>> {
  try {
    const result = await fetchProjects(tenantId);
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
 * Fetch a single project
 */
export async function fetchProjectAction(
  tenantId: string,
  projectId: string,
  ref?: string
): Promise<ActionResult<Project>> {
  try {
    const result = await fetchProject(tenantId, projectId, {
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
 * Create a new project
 */
export async function createProjectAction(
  tenantId: string,
  project: ProjectFormData
): Promise<ActionResult<Project>> {
  try {
    const result = await createProject(tenantId, project);
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
 * Update a project
 */
export async function updateProjectAction(
  tenantId: string,
  projectId: string,
  project: ProjectFormData,
  ref?: string
): Promise<ActionResult<Project>> {
  try {
    const result = await updateProject(tenantId, projectId, project, {
      queryParams: { ref },
    });
    revalidatePath(`/${tenantId}/projects`);
    revalidatePath(`/${tenantId}/projects/${projectId}`);
    revalidatePath(`/${tenantId}/projects/${projectId}/settings`);

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
      error: error instanceof Error ? error.message : 'Failed to update project',
      code: 'unknown_error',
    };
  }
}

/**
 * Delete a project
 */
export async function deleteProjectAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<void>> {
  try {
    await deleteProject(tenantId, projectId);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects`);

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
      error: error instanceof Error ? error.message : 'Failed to delete project',
      code: 'unknown_error',
    };
  }
}
