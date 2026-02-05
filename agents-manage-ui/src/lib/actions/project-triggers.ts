'use server';

import { revalidatePath } from 'next/cache';
import {
  fetchProjectScheduledTriggers,
  fetchProjectTriggers,
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
