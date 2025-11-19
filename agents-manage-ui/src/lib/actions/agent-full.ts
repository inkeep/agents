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
  fetchTeamAgents as apiFetchTeamAgents,
  getFullAgent as apiGetFullAgent,
  updateFullAgent as apiUpdateFullAgent,
} from '../api/agent-full-client';
import {
  type Agent,
  type FullAgentDefinition,
  FullAgentDefinitionSchema,
} from '../types/agent-full';
import type { TeamAgent } from '../types/team-agents';

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
  projectId: string,
  ref?: string
): Promise<ActionResult<Agent[]>> {
  try {
    const response = await apiFetchAgents(tenantId, projectId, {
      queryParams: { ref },
    });
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
 * Fetch barebones metadata for all agents in a project to be used with team agent relations
 */
export async function fetchTeamAgentsAction(
  tenantId: string,
  projectId: string,
  ref?: string
): Promise<ActionResult<TeamAgent[]>> {
  try {
    const response = await apiFetchTeamAgents(tenantId, projectId, {
      queryParams: { ref },
    });
    return {
      success: true,
      data: response,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch team agents',
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
  agentData: FullAgentDefinition,
  ref?: string
): Promise<ActionResult<FullAgentDefinition>> {
  try {
    const response = await apiCreateFullAgent(tenantId, projectId, agentData, {
      queryParams: { ref },
    });

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
  agentId: string,
  ref?: string
): Promise<ActionResult<FullAgentDefinition>> {
  try {
    const response = await apiGetFullAgent(tenantId, projectId, agentId, {
      queryParams: { ref },
    });

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
  agentData: FullAgentDefinition,
  ref?: string
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

    const response = await apiUpdateFullAgent(tenantId, projectId, agentId, agentData, {
      queryParams: { ref },
    });

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
  agentId: string,
  ref?: string
): Promise<ActionResult<void>> {
  try {
    await apiDeleteFullAgent(tenantId, projectId, agentId, {
      queryParams: { ref },
    });

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
