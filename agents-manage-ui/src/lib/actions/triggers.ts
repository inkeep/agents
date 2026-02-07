'use server';

import { revalidatePath } from 'next/cache';
import { createTrigger, deleteTrigger, type Trigger, updateTrigger } from '../api/triggers';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function updateTriggerEnabledAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  enabled: boolean
): Promise<ActionResult<Trigger>> {
  try {
    const result = await updateTrigger(tenantId, projectId, agentId, triggerId, { enabled });
    revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
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
    revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
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
    revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
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

export async function deleteTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string
): Promise<ActionResult<void>> {
  try {
    await deleteTrigger(tenantId, projectId, agentId, triggerId);
    revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
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
