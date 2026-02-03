'use server';

import { fetchAgents as apiFetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjects as apiFetchProjects } from '@/lib/api/projects';

export interface SlackAgentOption {
  id: string;
  name: string | null;
  projectId: string;
  projectName: string | null;
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getAllAgentsForSlack(
  tenantId: string
): Promise<ActionResult<SlackAgentOption[]>> {
  try {
    const projectsResponse = await apiFetchProjects(tenantId);
    const projects = projectsResponse.data;

    const allAgents: SlackAgentOption[] = [];

    for (const project of projects) {
      const projectId = project.id || project.projectId;
      if (!projectId) continue;

      try {
        const agentsResponse = await apiFetchAgents(tenantId, projectId);
        for (const agent of agentsResponse.data) {
          allAgents.push({
            id: agent.id,
            name: agent.name,
            projectId,
            projectName: project.name,
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch agents for project ${projectId}:`, error);
      }
    }

    return { success: true, data: allAgents };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch agents';
    return { success: false, error: message };
  }
}
