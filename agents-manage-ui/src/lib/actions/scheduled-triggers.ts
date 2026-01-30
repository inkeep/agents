'use server';

import { revalidatePath } from 'next/cache';
import {
  createScheduledTrigger,
  deleteScheduledTrigger,
  fetchScheduledTriggers,
  fetchScheduledTriggerInvocations,
  type CreateScheduledTriggerInput,
  type ScheduledTrigger,
  type ScheduledTriggerInvocation,
  type UpdateScheduledTriggerInput,
  updateScheduledTrigger,
} from '../api/scheduled-triggers';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function getScheduledTriggersAction(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ScheduledTrigger[]> {
  try {
    const response = await fetchScheduledTriggers(tenantId, projectId, agentId);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch scheduled triggers:', error);
    return [];
  }
}

export async function getScheduledTriggerInvocationsAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  options?: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    limit?: number;
    page?: number;
  }
): Promise<ScheduledTriggerInvocation[]> {
  try {
    const response = await fetchScheduledTriggerInvocations(
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      options
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch scheduled trigger invocations:', error);
    return [];
  }
}

export async function updateScheduledTriggerEnabledAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  enabled: boolean
): Promise<ActionResult<ScheduledTrigger>> {
  try {
    const result = await updateScheduledTrigger(tenantId, projectId, agentId, scheduledTriggerId, {
      enabled,
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`);
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
      error: error instanceof Error ? error.message : 'Failed to update scheduled trigger',
      code: 'unknown_error',
    };
  }
}

export async function createScheduledTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerData: CreateScheduledTriggerInput
): Promise<ActionResult<ScheduledTrigger>> {
  try {
    const result = await createScheduledTrigger(tenantId, projectId, agentId, triggerData);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`);
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
      error: error instanceof Error ? error.message : 'Failed to create scheduled trigger',
      code: 'unknown_error',
    };
  }
}

export async function updateScheduledTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  triggerData: UpdateScheduledTriggerInput
): Promise<ActionResult<ScheduledTrigger>> {
  try {
    const result = await updateScheduledTrigger(
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      triggerData
    );
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`);
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
      error: error instanceof Error ? error.message : 'Failed to update scheduled trigger',
      code: 'unknown_error',
    };
  }
}

export async function deleteScheduledTriggerAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string
): Promise<ActionResult<void>> {
  try {
    await deleteScheduledTrigger(tenantId, projectId, agentId, scheduledTriggerId);
    revalidatePath(`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`);
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
      error: error instanceof Error ? error.message : 'Failed to delete scheduled trigger',
      code: 'unknown_error',
    };
  }
}
