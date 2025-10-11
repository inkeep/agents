'use server';

/**
 * Server Actions for Agent Full Operations
 *
 * These server actions wrap the AgentFull REST API endpoints and provide
 * type-safe functions that can be called from React components.
 */

import { revalidatePath } from 'next/cache';
import {
  ApiError,
  createFullAgent as apiCreateFullAgent,
  deleteFullAgent as apiDeleteFullAgent,
  fetchAgents as apiFetchAgents,
  getFullAgent as apiGetFullAgent,
  updateFullAgent as apiUpdateFullAgent,
} from '../api/agent-full-client';
import {
  type FullAgentDefinition,
  FullAgentDefinitionSchema,
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

export async function getAllAgentsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Agent[]>> {
  try {
    const response = await apiFetchAgents(tenantId, projectId);
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
export async function createFullAgentAction(
  tenantId: string,
  projectId: string,
  agentData: FullAgentDefinition
): Promise<ActionResult<FullAgentDefinition>> {
  try {
    const response = await apiCreateFullAgent(tenantId, projectId, agentData);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agents`);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${response.data.id}`);

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
export async function getFullAgentAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ActionResult<FullAgentDefinition>> {
  try {
    const response = await apiGetFullAgent(tenantId, projectId, agentId);

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
export async function updateFullAgentAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  agentData: FullAgentDefinition
): Promise<ActionResult<FullAgentDefinition>> {
  try {
    // Ensure the agent ID matches
    if (agentId !== agentData.id) {
      return {
        success: false,
        error: `Agent ID mismatch: expected ${agentId}, got ${agentData.id}`,
        code: 'bad_request',
      };
    }

    const response = await apiUpdateFullAgent(tenantId, projectId, agentId, agentData);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agents`);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}`);

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
export async function deleteFullAgentAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ActionResult<void>> {
  try {
    await apiDeleteFullAgent(tenantId, projectId, agentId);

    // Revalidate relevant pages
    revalidatePath(`/${tenantId}/projects/${projectId}/agents`);

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
export async function validateAgentData(data: unknown): Promise<ActionResult<FullAgentDefinition>> {
  try {
    const validatedData = FullAgentDefinitionSchema.parse(data);
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
