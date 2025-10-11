'use server';

/**
 * Server Actions for Agent Full Operations
 *
 * These server actions wrap the GraphFull REST API endpoints and provide
 * type-safe functions that can be called from React components.
 */

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createFullGraph as apiCreateFullGraph,
  deleteFullGraph as apiDeleteFullGraph,
  fetchGraphs as apiFetchGraphs,
  getFullGraph as apiGetFullGraph,
  updateFullGraph as apiUpdateFullGraph,
} from '../api/agent-full-client';
import {
  type FullGraphDefinition,
  FullGraphDefinitionSchema,
  type Agent,
} from '../types/agent-full';

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

export async function getAllGraphsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Agent[]>> {
  try {
    const response = await apiFetchGraphs(tenantId, projectId);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch agent',
      code: 'unknown_error',
    };
  }
}

/**
 * Create a new full agent
 */
export async function createFullGraphAction(
  tenantId: string,
  projectId: string,
  graphData: FullGraphDefinition
): Promise<ActionResult<FullGraphDefinition>> {
  try {
    const response = await apiCreateFullGraph(tenantId, projectId, graphData);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agent`);
    revalidatePath(`/${tenantId}/projects/${projectId}/agent/${response.data.id}`);

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
      error: error instanceof Error ? error.message : 'Failed to create agent',
      code: 'validation_error',
    };
  }
}

/**
 * Get a full agent by ID
 */
export async function getFullGraphAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ActionResult<FullGraphDefinition>> {
  try {
    const response = await apiGetFullGraph(tenantId, projectId, agentId);

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
      error: error instanceof Error ? error.message : 'Failed to get agent',
      code: 'unknown_error',
    };
  }
}

/**
 * Update or create a full agent (upsert)
 */
export async function updateFullGraphAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  graphData: FullGraphDefinition
): Promise<ActionResult<FullGraphDefinition>> {
  try {
    // Ensure the agent ID matches
    if (agentId !== graphData.id) {
      return {
        success: false,
        error: `Agent ID mismatch: expected ${agentId}, got ${graphData.id}`,
        code: 'bad_request',
      };
    }

    const response = await apiUpdateFullGraph(tenantId, projectId, agentId, graphData);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agent`);
    revalidatePath(`/${tenantId}/projects/${projectId}/agent/${agentId}`);

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
      error: error instanceof Error ? error.message : 'Failed to update agent',
      code: 'validation_error',
    };
  }
}

/**
 * Delete a full agent
 */
export async function deleteFullGraphAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ActionResult<void>> {
  try {
    await apiDeleteFullGraph(tenantId, projectId, agentId);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agent`);

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
      error: error instanceof Error ? error.message : 'Failed to delete agent',
      code: 'unknown_error',
    };
  }
}

/**
 * Validate agent data without making an API call
 * Useful for form validation on the client side
 */
export async function validateGraphData(data: unknown): Promise<ActionResult<FullGraphDefinition>> {
  try {
    const validatedData = FullGraphDefinitionSchema.parse(data);
    return {
      success: true,
      data: validatedData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
      code: 'validation_error',
    };
  }
}
