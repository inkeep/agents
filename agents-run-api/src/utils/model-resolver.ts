import {
  executeInBranch,
  getAgentById,
  getProject,
  type Models,
  type ResolvedRef,
  type SubAgentSelect,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';

async function resolveModelConfig(
  ref: ResolvedRef,
  agentId: string,
  subAgent: SubAgentSelect
): Promise<Models> {
  // If base model is defined on the agent
  if (subAgent.models?.base?.model) {
    return {
      base: subAgent.models.base,
      structuredOutput: subAgent.models.structuredOutput || subAgent.models.base,
      summarizer: subAgent.models.summarizer || subAgent.models.base,
    };
  }

  // If base model is not defined on the agent (or models is undefined/null)
  // Check agent model config first
  const agent = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getAgentById(db)({
      scopes: { tenantId: subAgent.tenantId, projectId: subAgent.projectId, agentId },
    });
  });

  if (agent?.models?.base?.model) {
    return {
      base: agent.models.base,
      structuredOutput:
        subAgent.models?.structuredOutput || agent.models.structuredOutput || agent.models.base,
      summarizer: subAgent.models?.summarizer || agent.models.summarizer || agent.models.base,
    };
  }

  // If agent model config not defined, check project level config
  const project = await executeInBranch({ dbClient, ref }, async (db) => {
    return await getProject(db)({
      scopes: { tenantId: subAgent.tenantId, projectId: subAgent.projectId },
    });
  });

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
