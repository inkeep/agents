/**
 * API Client for Project-level Triggers Operations
 *
 * This module provides functions to fetch triggers and scheduled triggers
 * across all agents in a project.
 */

'use server';

import { fetchAgents } from './agent-full-client';
import { fetchScheduledTriggers, type ScheduledTriggerWithRunInfo } from './scheduled-triggers';
import { fetchTriggers, type Trigger } from './triggers';

export type TriggerWithAgent = Trigger & {
  agentId: string;
  agentName: string;
};

export type ScheduledTriggerWithAgent = ScheduledTriggerWithRunInfo & {
  agentId: string;
  agentName: string;
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
