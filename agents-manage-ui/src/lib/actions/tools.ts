/**
 * Server actions for tool operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import { deleteMCPTool } from '../api/tools';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

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
