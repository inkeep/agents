import type { AgentGraphInsert, AgentInsert, AgentRelationInsert } from '../../types/index.js';

export const createTestAgentData = (
  tenantId: string,
  projectId: string,
  suffix: string
): AgentInsert => {
  return {
    id: `default-agent-${suffix}`,
    tenantId,
    projectId,
    name: `Default Agent ${suffix}`,
    description: 'The default agent for the graph',
    prompt: 'Route requests appropriately',
  };
};

export const createTestRelationData = (
  tenantId: string,
  projectId: string,
  suffix: string
): AgentRelationInsert => {
  return {
    id: `test-relation-${suffix}`,
    tenantId,
    projectId,
    graphId: `test-graph-${suffix}`,
    sourceAgentId: `default-agent-${suffix}`,
    targetAgentId: `default-agent-${suffix}`,
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
    defaultAgentId: `default-agent-${suffix}`,
    models: {
      base: {
        model: 'gpt-4',
      },
    },
  };
};
