import type {
  FullAgentSubAgentSelectWithRelationIds,
  FullExecutionContext,
  ModelSettings,
  Models,
} from '@inkeep/agents-core';

export function firstWithModel(
  ...ms: (ModelSettings | null | undefined)[]
): ModelSettings | undefined {
  return ms.find((m): m is ModelSettings => Boolean(m?.model));
}

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
      structuredOutput: firstWithModel(subAgent.models.structuredOutput, base) ?? base,
      summarizer: firstWithModel(subAgent.models.summarizer, base) ?? base,
    };
  }

  // Check agent model config
  if (agent?.models?.base?.model) {
    const base = inheritGatewayFields(agent.models.base, project?.models?.base);
    return {
      base,
      structuredOutput:
        firstWithModel(subAgent.models?.structuredOutput, agent.models.structuredOutput, base) ??
        base,
      summarizer:
        firstWithModel(subAgent.models?.summarizer, agent.models.summarizer, base) ?? base,
    };
  }

  if (project?.models?.base?.model) {
    return {
      base: project.models.base,
      structuredOutput: firstWithModel(
        subAgent.models?.structuredOutput,
        project.models.structuredOutput,
        project.models.base
      ),
      summarizer: firstWithModel(
        subAgent.models?.summarizer,
        project.models.summarizer,
        project.models.base
      ),
    };
  }

  throw new Error(
    'Base model configuration is required. Please configure models at the project level.'
  );
}

export { resolveModelConfig };
