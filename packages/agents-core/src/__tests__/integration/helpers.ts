import type { AgentGraphInsert, SubAgentInsert, SubAgentRelationInsert } from '../../types/index';
import { OPENAI_MODELS } from '../../constants/models';

export const createTestAgentData = (
  tenantId: string,
  projectId: string,
  suffix: string,
  graphId?: string
): SubAgentInsert => {
  return {
    id: `default-agent-${suffix}`,
    tenantId,
    projectId,
    graphId: graphId || `test-graph-${suffix}`,
    name: `Default Agent ${suffix}`,
    description: 'The default agent for the graph',
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
    graphId: `test-graph-${suffix}`,
    sourceSubAgentId: `default-agent-${suffix}`,
    targetSubAgentId: `default-agent-${suffix}`,
    relationType: 'transfer' as const,
  };
};

export const createTestGraphData = (
  tenantId: string,
  projectId: string,
  suffix: string
): AgentGraphInsert => {
  return {
    id: `test-graph-${suffix}`,
    tenantId,
    projectId,
    name: `Test Agent Graph ${suffix}`,
    description: 'A comprehensive test graph',
    defaultSubAgentId: `default-agent-${suffix}`,
    models: {
      base: {
        model: OPENAI_MODELS.GPT_4_1,
      },
    },
  };
};
