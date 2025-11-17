/**
 * Server actions for external agent operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import { deleteExternalAgent, fetchExternalAgents } from '../api/external-agents';
import { ApiError } from '../types/errors';
import type { ExternalAgent } from '../types/external-agents';
import type { ActionResult } from './types';

/**
 * Fetch all external agents for a project
 */
export async function fetchExternalAgentsAction(
  tenantId: string,
  projectId: string,
  ref?: string
): Promise<ActionResult<ExternalAgent[]>> {
  try {
    const externalAgents = await fetchExternalAgents(tenantId, projectId, {
      queryParams: { ref },
    });
    return {
      success: true,
      data: externalAgents,
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
 * Delete an external agent
 */
export async function deleteExternalAgentAction(
  tenantId: string,
  projectId: string,
  externalAgentId: string,
  ref?: string
): Promise<ActionResult<void>> {
  try {
    await deleteExternalAgent(tenantId, projectId, externalAgentId, {
      queryParams: { ref },
    });
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
