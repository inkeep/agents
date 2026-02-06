/**
 * API Client for Project-level Triggers Operations
 *
 * This module provides functions to fetch triggers and scheduled triggers
 * across all agents in a project.
 */

'use server';

import { fetchAgents } from './agent-full-client';
import {
  fetchScheduledTriggerInvocations,
  fetchScheduledTriggers,
  type ScheduledTriggerInvocation,
  type ScheduledTriggerWithRunInfo,
} from './scheduled-triggers';
import { fetchTriggers, type Trigger } from './triggers';

export type TriggerWithAgent = Trigger & {
  agentId: string;
  agentName: string;
};

export type ScheduledTriggerWithAgent = ScheduledTriggerWithRunInfo & {
  agentId: string;
  agentName: string;
};

export type ScheduledTriggerInvocationWithContext = ScheduledTriggerInvocation & {
  agentId: string;
  agentName: string;
  triggerName: string;
};

/**
 * Fetch all triggers across all agents in a project
 */
export async function fetchProjectTriggers(
  tenantId: string,
  projectId: string
): Promise<TriggerWithAgent[]> {
  const { data: agents } = await fetchAgents(tenantId, projectId);

  const allTriggers = await Promise.all(
    agents.map(async (agent) => {
      try {
        const { data: triggers } = await fetchTriggers(tenantId, projectId, agent.id);
        return triggers.map((trigger) => ({
          ...trigger,
          agentId: agent.id,
          agentName: agent.name,
        }));
      } catch {
        return [];
      }
    })
  );

  return allTriggers.flat();
}

/**
 * Fetch all scheduled triggers across all agents in a project
 */
export async function fetchProjectScheduledTriggers(
  tenantId: string,
  projectId: string
): Promise<ScheduledTriggerWithAgent[]> {
  const { data: agents } = await fetchAgents(tenantId, projectId);

  const allTriggers = await Promise.all(
    agents.map(async (agent) => {
      try {
        const { data: triggers } = await fetchScheduledTriggers(tenantId, projectId, agent.id);

        // Run info is now included in the trigger response from the API
        return triggers.map((trigger) => ({
          ...trigger,
          agentId: agent.id,
          agentName: agent.name,
        }));
      } catch {
        return [];
      }
    })
  );

  return allTriggers.flat();
}

/**
 * Fetch all scheduled trigger invocations across all triggers in a project
 */
export async function fetchProjectScheduledTriggerInvocations(
  tenantId: string,
  projectId: string,
  options?: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    limit?: number;
  }
): Promise<ScheduledTriggerInvocationWithContext[]> {
  // First get all scheduled triggers with agent context
  const scheduledTriggers = await fetchProjectScheduledTriggers(tenantId, projectId);

  // Fetch invocations for each trigger
  const allInvocations = await Promise.all(
    scheduledTriggers.map(async (trigger) => {
      try {
        const response = await fetchScheduledTriggerInvocations(
          tenantId,
          projectId,
          trigger.agentId,
          trigger.id,
          { status: options?.status, limit: options?.limit || 20 }
        );
        return response.data.map((invocation) => ({
          ...invocation,
          agentId: trigger.agentId,
          agentName: trigger.agentName,
          triggerName: trigger.name,
        }));
      } catch {
        return [];
      }
    })
  );

  // Flatten and sort by createdAt descending
  return allInvocations.flat().sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });
}
