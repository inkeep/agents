'use server';

import { revalidatePath } from 'next/cache';
import {
  type CreateScheduledTriggerInput,
  cancelScheduledTriggerInvocation,
  createScheduledTrigger,
  deleteScheduledTrigger,
  fetchScheduledTriggerInvocations,
  rerunScheduledTriggerInvocation,
  runScheduledTriggerNow,
  type ScheduledTrigger,
  type ScheduledTriggerInvocation,
  type UpdateScheduledTriggerInput,
  updateScheduledTrigger,
} from '../api/scheduled-triggers';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

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
      error: error instanceof Error ? error.message : 'Failed to delete scheduled trigger',
      code: 'unknown_error',
    };
  }
}

export async function cancelScheduledTriggerInvocationAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  invocationId: string
): Promise<ActionResult<void>> {
  try {
    const result = await cancelScheduledTriggerInvocation(
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId
    );
    revalidatePath(
      `/${tenantId}/projects/${projectId}/triggers/scheduled/${agentId}/${scheduledTriggerId}/invocations`
    );
    return {
      success: result.success,
      error: result.success ? undefined : result.message,
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
      error: error instanceof Error ? error.message : 'Failed to cancel invocation',
      code: 'unknown_error',
    };
  }
}

export async function rerunScheduledTriggerInvocationAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  invocationId: string
): Promise<ActionResult<{ newInvocationId: string }>> {
  try {
    const result = await rerunScheduledTriggerInvocation(
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId
    );
    revalidatePath(
      `/${tenantId}/projects/${projectId}/triggers/scheduled/${agentId}/${scheduledTriggerId}/invocations`
    );
    return {
      success: result.success,
      data: { newInvocationId: result.newInvocationId },
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
      error: error instanceof Error ? error.message : 'Failed to rerun invocation',
      code: 'unknown_error',
    };
  }
}

export async function runScheduledTriggerNowAction(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string
): Promise<ActionResult<{ invocationId: string }>> {
  try {
    const result = await runScheduledTriggerNow(tenantId, projectId, agentId, scheduledTriggerId);
    revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
    revalidatePath(
      `/${tenantId}/projects/${projectId}/triggers/scheduled/${agentId}/${scheduledTriggerId}/invocations`
    );
    return {
      success: result.success,
      data: { invocationId: result.invocationId },
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
      error: error instanceof Error ? error.message : 'Failed to run trigger',
      code: 'unknown_error',
    };
  }
}
