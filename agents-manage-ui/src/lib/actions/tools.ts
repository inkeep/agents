/**
 * Server actions for tool operations with path revalidation
 */

'use server';

import { detectAuthenticationRequired } from '@inkeep/agents-core/client-exports';
import { revalidatePath } from 'next/cache';
import { createMCPTool, deleteMCPTool, fetchMCPTools, updateMCPTool } from '../api/tools';
import { ApiError } from '../types/errors';
import type { MCPTool } from '../types/tools';
import type { ActionResult } from './types';

type CreateMCPToolData = Parameters<typeof createMCPTool>[2];
type UpdateMCPToolData = Parameters<typeof updateMCPTool>[3];

/**
 * Fetch all tools for a project
 * @param skipDiscovery - If true, returns skeleton data without MCP discovery (instant response)
 */
export async function fetchToolsAction(
  tenantId: string,
  projectId: string,
  options?: { skipDiscovery?: boolean }
): Promise<ActionResult<MCPTool[]>> {
  try {
    const tools = await fetchMCPTools(tenantId, projectId, {
      skipDiscovery: options?.skipDiscovery,
    });
    return {
      success: true,
      data: tools,
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
 * Delete a tool (mcp server)
 */
export async function deleteToolAction(
  tenantId: string,
  projectId: string,
  toolId: string,
  shouldRevalidate = true
): Promise<ActionResult<void>> {
  try {
    await deleteMCPTool(tenantId, projectId, toolId);
    if (shouldRevalidate) {
      revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers`);
    }
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

/**
 * Create a new MCP tool
 */
export async function createToolAction(
  tenantId: string,
  projectId: string,
  data: CreateMCPToolData
): Promise<ActionResult<MCPTool>> {
  try {
    const tool = await createMCPTool(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers`);
    return {
      success: true,
      data: tool,
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
 * Update an existing MCP tool
 */
export async function updateToolAction(
  tenantId: string,
  projectId: string,
  toolId: string,
  data: UpdateMCPToolData
): Promise<ActionResult<MCPTool>> {
  try {
    const tool = await updateMCPTool(tenantId, projectId, toolId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers`);
    revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
    return {
      success: true,
      data: tool,
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
 * Detect if an MCP server requires OAuth authentication
 */
export async function detectOAuthServerAction(serverUrl: string): Promise<ActionResult<boolean>> {
  try {
    const requiresAuth = await detectAuthenticationRequired({
      serverUrl,
    });

    return {
      success: true,
      data: requiresAuth,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect OAuth support',
      code: 'oauth_detection_failed',
    };
  }
}
