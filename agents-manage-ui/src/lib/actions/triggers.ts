'use server';

import type { Part } from '@inkeep/agents-core';
import { revalidatePath } from 'next/cache';
import {
  createTrigger,
  deleteTrigger,
  fetchTriggers,
  rerunTrigger,
  type Trigger,
  updateTrigger,
} from '../api/triggers';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function getTriggersAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<Trigger[]> {
  try {
    const response = await fetchTriggers(tenantId, projectId, agentId);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch triggers:', error);
    return [];
  }
}

export async function updateTriggerEnabledAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  enabled: boolean
): Promise<ActionResult<Trigger>> {
  try {
    const result = await updateTrigger(tenantId, projectId, agentId, triggerId, { enabled });
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`);
    return {
      success: true,
      data: result,
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
      error: error instanceof Error ? error.message : 'Failed to update trigger',
      code: 'unknown_error',
    };
  }
}

export async function createTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerData: Partial<Trigger>
): Promise<ActionResult<Trigger>> {
  try {
    const result = await createTrigger(tenantId, projectId, agentId, triggerData);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`);
    return {
      success: true,
      data: result,
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
      error: error instanceof Error ? error.message : 'Failed to create trigger',
      code: 'unknown_error',
    };
  }
}

export async function updateTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  triggerData: Partial<Trigger>
): Promise<ActionResult<Trigger>> {
  try {
    const result = await updateTrigger(tenantId, projectId, agentId, triggerId, triggerData);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`);
    return {
      success: true,
      data: result,
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
      error: error instanceof Error ? error.message : 'Failed to update trigger',
      code: 'unknown_error',
    };
  }
}

export async function rerunTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  params: {
    userMessage: string;
    messageParts?: Part[];
  }
): Promise<ActionResult<{ invocationId: string; conversationId: string }>> {
  try {
    const result = await rerunTrigger(tenantId, projectId, agentId, triggerId, params);
    return {
      success: true,
      data: { invocationId: result.invocationId, conversationId: result.conversationId },
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
      error: error instanceof Error ? error.message : 'Failed to rerun trigger',
      code: 'unknown_error',
    };
  }
}

export async function deleteTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string
): Promise<ActionResult<void>> {
  try {
    await deleteTrigger(tenantId, projectId, agentId, triggerId);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`);
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
      error: error instanceof Error ? error.message : 'Failed to delete trigger',
      code: 'unknown_error',
    };
  }
}
