'use server';

import { revalidatePath } from 'next/cache';
import {
  fetchProjectScheduledTriggerInvocations,
  fetchProjectScheduledTriggers,
  fetchProjectTriggers,
  type ScheduledTriggerInvocationWithContext,
  type ScheduledTriggerWithAgent,
  type TriggerWithAgent,
} from '../api/project-triggers';

export async function getProjectTriggersAction(
  tenantId: string,
  projectId: string
): Promise<TriggerWithAgent[]> {
  try {
    return await fetchProjectTriggers(tenantId, projectId);
  } catch (error) {
    console.error('Failed to fetch project triggers:', error);
    return [];
  }
}

export async function getProjectScheduledTriggersAction(
  tenantId: string,
  projectId: string
): Promise<ScheduledTriggerWithAgent[]> {
  try {
    return await fetchProjectScheduledTriggers(tenantId, projectId);
  } catch (error) {
    console.error('Failed to fetch project scheduled triggers:', error);
    return [];
  }
}

export async function revalidateProjectTriggers(tenantId: string, projectId: string) {
  revalidatePath(`/${tenantId}/projects/${projectId}/triggers`);
}

export async function getProjectScheduledTriggerInvocationsAction(
  tenantId: string,
  projectId: string,
  options?: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    limit?: number;
  }
): Promise<ScheduledTriggerInvocationWithContext[]> {
  try {
    return await fetchProjectScheduledTriggerInvocations(tenantId, projectId, options);
  } catch (error) {
    console.error('Failed to fetch project scheduled trigger invocations:', error);
    return [];
  }
}
