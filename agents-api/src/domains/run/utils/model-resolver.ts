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
  ...parents: (ModelSettings | null | undefined)[]
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

type ModelTier = 'base' | 'structuredOutput' | 'summarizer';
type ModelTiers = Partial<Record<ModelTier, ModelSettings | null | undefined>> | null | undefined;

// Each model tier inherits independently down the sub-agent -> agent -> project
// chain, then falls back to the resolved base. A tier must never stop at the
// level where `base` happens to be defined, otherwise a project-level
// summarizer/structuredOutput is dropped whenever a lower level overrides only
// `base`. Gateway fields (fallbackModels/allowedProviders) are topped up from
// the levels below the one that supplied the tier's model.
function resolveTier(
  chain: (ModelSettings | null | undefined)[],
  base: ModelSettings
): ModelSettings {
  const index = chain.findIndex((m) => m?.model);
  if (index === -1) {
    return base;
  }
  return inheritGatewayFields(chain[index] as ModelSettings, ...chain.slice(index + 1), base);
}

async function resolveModelConfig(
  executionContext: FullExecutionContext,
  subAgent: FullAgentSubAgentSelectWithRelationIds
): Promise<Models> {
  const { agentId, project } = executionContext;
  const agent = project.agents[agentId];

  const levels: ModelTiers[] = [subAgent.models, agent?.models, project?.models];
  const chain = (tier: ModelTier) => levels.map((m) => m?.[tier]);

  const baseChain = chain('base');
  const baseIndex = baseChain.findIndex((m) => m?.model);
  if (baseIndex === -1) {
    throw new Error(
      'Base model configuration is required. Please configure models at the project level.'
    );
  }
  const base = inheritGatewayFields(
    baseChain[baseIndex] as ModelSettings,
    ...baseChain.slice(baseIndex + 1)
  );

  return {
    base,
    structuredOutput: resolveTier(chain('structuredOutput'), base),
    summarizer: resolveTier(chain('summarizer'), base),
  };
}

export { resolveModelConfig };
