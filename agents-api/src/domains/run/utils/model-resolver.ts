import type {
  FullAgentSubAgentSelectWithRelationIds,
  FullExecutionContext,
  Models,
} from '@inkeep/agents-core';

async function resolveModelConfig(
  executionContext: FullExecutionContext,
  subAgent: FullAgentSubAgentSelectWithRelationIds
): Promise<Models> {
  const { agentId, project } = executionContext;
  // If base model is defined on the agent
  if (subAgent.models?.base?.model) {
    return {
      base: subAgent.models.base,
      summarizer: subAgent.models.summarizer || subAgent.models.base,
    };
  }

  // If base model is not defined on the agent (or models is undefined/null)
  // Check agent model config first
  const agent = project.agents[agentId];

  if (agent?.models?.base?.model) {
    return {
      base: agent.models.base,
      summarizer: subAgent.models?.summarizer || agent.models.summarizer || agent.models.base,
    };
  }

  if (project?.models?.base?.model) {
    return {
      base: project.models.base,
      summarizer: subAgent.models?.summarizer || project.models.summarizer || project.models.base,
    };
  }

  // If project level config or base model not defined, throw error
  throw new Error(
    'Base model configuration is required. Please configure models at the project level.'
  );
}

export { resolveModelConfig };
