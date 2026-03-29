'use server';

import { fetchAgents as apiFetchAgents } from '@/lib/api/agent-full-client';
import { fetchProjects as apiFetchProjects } from '@/lib/api/projects';

export interface SlackAgentOption {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getAllAgentsForSlack(
  tenantId: string
): Promise<ActionResult<SlackAgentOption[]>> {
  try {
    const projectsResponse = await apiFetchProjects(tenantId);
    const projects = projectsResponse.data;

    const projectsWithIds = projects
      .map((project) => ({ project, projectId: project.id || project.projectId }))
      .filter((p): p is { project: (typeof projects)[0]; projectId: string } =>
        Boolean(p.projectId)
      );

    const agentResults = await Promise.all(
      projectsWithIds.map(async ({ project, projectId }) => {
        try {
          const agentsResponse = await apiFetchAgents(tenantId, projectId);
          return agentsResponse.data.map((agent) => ({
            id: agent.id,
            name: agent.name,
            projectId,
            projectName: project.name,
          }));
        } catch (error) {
          console.warn(`Failed to fetch agents for project ${projectId}:`, error);
          return [];
        }
      })
    );

    return { success: true, data: agentResults.flat() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch agents';
    return { success: false, error: message };
  }
}
