import { OPENAI_MODELS } from '../../constants/models';
import type { AgentInsert, SubAgentInsert, SubAgentRelationInsert } from '../../types/index';

export const createTestSubAgentData = (
  tenantId: string,
  projectId: string,
  suffix: string,
  agentId?: string
): SubAgentInsert => {
  return {
    id: `default-agent-${suffix}`,
    tenantId,
    projectId,
    agentId: agentId || `test-agent-${suffix}`,
    name: `Default Agent ${suffix}`,
    description: 'The default agent for the agent',
    prompt: 'Route requests appropriately',
  };
};

export const createTestRelationData = (
  tenantId: string,
  projectId: string,
  suffix: string
): SubAgentRelationInsert => {
  return {
    id: `test-relation-${suffix}`,
    tenantId,
    projectId,
    agentId: `test-agent-${suffix}`,
    sourceSubAgentId: `default-agent-${suffix}`,
    targetSubAgentId: `default-agent-${suffix}`,
    relationType: 'transfer' as const,
  };
};

export const createTestAgentData = (
  tenantId: string,
  projectId: string,
  suffix: string
): AgentInsert => {
  return {
    id: `test-agent-${suffix}`,
    tenantId,
    projectId,
    name: `Test Agent Agent ${suffix}`,
    description: 'A comprehensive test agent',
    defaultSubAgentId: `default-agent-${suffix}`,
    models: {
      base: {
        model: OPENAI_MODELS.GPT_4_1,
      },
    },
  };
};
