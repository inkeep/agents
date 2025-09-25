/**
 * Server actions for tool operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import { deleteMCPTool, fetchMCPTools } from '../api/tools';
import type { MCPTool } from '../types/tools';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all tools for a project
 */
export async function fetchToolsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<MCPTool[]>> {
  try {
    const tools = await fetchMCPTools(tenantId, projectId);
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
  toolId: string
): Promise<ActionResult<void>> {
  try {
    await deleteMCPTool(tenantId, projectId, toolId);
    revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers`);
    revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
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
