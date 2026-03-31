import type {
  FullAgentSubAgentSelectWithRelationIds,
  FullExecutionContext,
  ModelSettings,
  Models,
} from '@inkeep/agents-core';

function inheritGatewayFields(
  child: ModelSettings,
  ...parents: (ModelSettings | undefined)[]
): ModelSettings {
  let fallbackModels = child.fallbackModels;
  let allowedProviders = child.allowedProviders;

  for (const parent of parents) {
    if (fallbackModels && allowedProviders) break;
    if (!fallbackModels && parent?.fallbackModels) {
      fallbackModels = parent.fallbackModels;
    }
    if (!allowedProviders && parent?.allowedProviders) {
      allowedProviders = parent.allowedProviders;
    }
  }

  if (fallbackModels === child.fallbackModels && allowedProviders === child.allowedProviders) {
    return child;
  }

  return { ...child, fallbackModels, allowedProviders };
}

async function resolveModelConfig(
  executionContext: FullExecutionContext,
  subAgent: FullAgentSubAgentSelectWithRelationIds
): Promise<Models> {
  const { agentId, project } = executionContext;
  const agent = project.agents[agentId];

  // If base model is defined on the sub-agent
  if (subAgent.models?.base?.model) {
    const base = inheritGatewayFields(
      subAgent.models.base,
      agent?.models?.base,
      project?.models?.base
    );
    return {
      base,
      structuredOutput: subAgent.models.structuredOutput || base,
      summarizer: subAgent.models.summarizer || base,
    };
  }

  // Check agent model config
  if (agent?.models?.base?.model) {
    const base = inheritGatewayFields(agent.models.base, project?.models?.base);
    return {
      base,
      structuredOutput: subAgent.models?.structuredOutput || agent.models.structuredOutput || base,
      summarizer: subAgent.models?.summarizer || agent.models.summarizer || base,
    };
  }

  if (project?.models?.base?.model) {
    return {
      base: project.models.base,
      structuredOutput:
        subAgent.models?.structuredOutput || project.models.structuredOutput || project.models.base,
      summarizer: subAgent.models?.summarizer || project.models.summarizer || project.models.base,
    };
  }

  // If project level config or base model not defined, throw error
  throw new Error(
    'Base model configuration is required. Please configure models at the project level.'
  );
}

export { resolveModelConfig };
