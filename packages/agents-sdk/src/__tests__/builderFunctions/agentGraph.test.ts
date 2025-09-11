import { describe, expect, it } from 'vitest';
import { Agent } from '../../agent';
import { agentGraph } from '../../builderFunctions';
import type { GraphConfig } from '../../types';

describe('agentGraph builder function', () => {
  it('should create an AgentGraph with basic config', () => {
    const agent = new Agent({
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test description',
      prompt: 'Test prompt',
    });

    const config: GraphConfig = {
      name: 'Test Graph',
      agents: [agent],
    };

    const graph = agentGraph(config);

    expect(graph.name).toBe('Test Graph');
    expect(graph.agents).toContain(agent);
  });

  it('should create an AgentGraph with multiple agents', () => {
    const agent1 = new Agent({
      id: 'agent-1',
      name: 'Agent 1',
      description: 'First agent',
      prompt: 'First agent prompt',
    });

    const agent2 = new Agent({
      id: 'agent-2',
      name: 'Agent 2',
      description: 'Second agent',
      prompt: 'Second agent prompt',
    });

    const config: GraphConfig = {
      name: 'Multi Agent Graph',
      agents: [agent1, agent2],
    };

    const graph = agentGraph(config);

    expect(graph.name).toBe('Multi Agent Graph');
    expect(graph.agents).toContain(agent1);
    expect(graph.agents).toContain(agent2);
    expect(graph.agents).toHaveLength(2);
  });

  it('should create an AgentGraph with additional config options', () => {
    const agent = new Agent({
      id: 'config-agent',
      name: 'Config Agent',
      description: 'Agent with config',
      prompt: 'Config agent prompt',
    });

    const config: GraphConfig = {
      name: 'Configured Graph',
      description: 'A graph with description',
      agents: [agent],
      tenantId: 'test-tenant',
    };

    const graph = agentGraph(config);

    expect(graph.name).toBe('Configured Graph');
    expect(graph.description).toBe('A graph with description');
    expect(graph.tenantId).toBe('test-tenant');
  });
});
