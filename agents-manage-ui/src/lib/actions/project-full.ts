'use server';

/**
 * Server Actions for Project Full Operations
 *
 * These server actions wrap the Project Full REST API endpoints and provide
 * type-safe functions that can be called from React components.
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import { ApiError, getFullProject as apiGetFullProject } from '../api/project-full';

/**
 * Result type for server actions - follows a consistent pattern
 */
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

/**
 * Get a full project definition with all nested resources
 * (agents, tools, dataComponents, artifactComponents, credentials, externalAgents)
 */
export async function getFullProjectAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<FullProjectDefinition>> {
  try {
    const response = await apiGetFullProject(tenantId, projectId);

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
      error: error instanceof Error ? error.message : 'Failed to get project',
      code: 'unknown_error',
    };
  }
}
