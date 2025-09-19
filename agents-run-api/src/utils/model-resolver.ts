import { type AgentSelect, getAgentGraphById, getProject, type Models } from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

async function resolveModelConfig(graphId: string, agent: AgentSelect): Promise<Models> {
  // If base model is defined on the agent
  if (agent.models?.base?.model) {
    return {
      base: agent.models.base,
      structuredOutput: agent.models.structuredOutput || agent.models.base,
      summarizer: agent.models.summarizer || agent.models.base,
    };
  }

  // If base model is not defined on the agent (or models is undefined/null)
  // Check graph model config first
  const graph = await getAgentGraphById(dbClient)({
    scopes: { tenantId: agent.tenantId, projectId: agent.projectId, graphId },
  });

  if (graph?.models?.base?.model) {
    return {
      base: graph.models.base,
      structuredOutput:
        agent.models?.structuredOutput || graph.models.structuredOutput || graph.models.base,
      summarizer: agent.models?.summarizer || graph.models.summarizer || graph.models.base,
    };
  }

  // If graph model config not defined, check project level config
  const project = await getProject(dbClient)({
    scopes: { tenantId: agent.tenantId, projectId: agent.projectId },
  });

  if (project?.models?.base?.model) {
    return {
      base: project.models.base,
      structuredOutput:
        agent.models?.structuredOutput || project.models.structuredOutput || project.models.base,
      summarizer: agent.models?.summarizer || project.models.summarizer || project.models.base,
    };
  }

  // If project level config or base model not defined, throw error
  throw new Error(
    'Base model configuration is required. Please configure models at the project level.'
  );
}

export { resolveModelConfig };
