'use server';

import {
  fetchProjectScheduledTriggerInvocations,
  fetchProjectScheduledTriggers,
  type ScheduledTriggerInvocationWithContext,
  type ScheduledTriggerWithAgent,
} from '../api/project-triggers';

export async function getProjectScheduledTriggersAction(
  tenantId: string,
  projectId: string
): Promise<ScheduledTriggerWithAgent[]> {
  try {
    const { triggers } = await fetchProjectScheduledTriggers(tenantId, projectId);
    return triggers;
  } catch (error) {
    console.error('Failed to fetch project scheduled triggers:', error);
    return [];
  }
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
