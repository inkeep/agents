/**
 * Server actions for external agent operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import { deleteExternalAgent } from '../api/external-agents';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Delete an external agent
 */
export async function deleteExternalAgentAction(
  tenantId: string,
  projectId: string,
  externalAgentId: string
): Promise<ActionResult<void>> {
  try {
    await deleteExternalAgent(tenantId, projectId, externalAgentId);
    revalidatePath(`/${tenantId}/projects/${projectId}/external-agents`);
    revalidatePath(`/${tenantId}/projects/${projectId}/external-agents/${externalAgentId}`);
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
