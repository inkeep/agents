/**
 * Server actions for tool operations with path revalidation
 */

'use server';

import { detectAuthenticationRequired } from '@inkeep/agents-core/client-exports';
import { revalidatePath } from 'next/cache';
import { deleteMCPTool, fetchMCPTools } from '../api/tools';
import { ApiError } from '../types/errors';
import type { MCPTool } from '../types/tools';
import type { ActionResult } from './types';

/**
 * Fetch all tools for a project
 */
export async function fetchToolsAction(
  tenantId: string,
  projectId: string,
  ref?: string
): Promise<ActionResult<MCPTool[]>> {
  try {
    const tools = await fetchMCPTools(tenantId, projectId, 1, 50, undefined, {
      queryParams: { ref },
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
  shouldRevalidate = true,
  ref?: string
): Promise<ActionResult<void>> {
  try {
    await deleteMCPTool(tenantId, projectId, toolId, {
      queryParams: { ref },
    });
    if (shouldRevalidate) {
      revalidatePath(`/${tenantId}/projects/${projectId}/mcp-servers`, 'page');
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
