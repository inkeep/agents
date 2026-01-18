import { describe, expect, it } from 'vitest';
import { agent } from '../../builderFunctions';
import { SubAgent } from '../../subAgent';
import type { AgentConfig } from '../../types';

describe('agent builder function', () => {
  it('should create an Agent with basic config', () => {
    const subAgent = new SubAgent({
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test description',
      prompt: 'Test prompt',
    });

    const config: AgentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      subAgents: () => [subAgent],
      defaultSubAgent: subAgent,
    };

    const agentObject = agent(config);

    expect(agentObject.getName()).toBe('Test Agent');
    expect(agentObject.getSubAgents()).toContain(subAgent);
  });

  it('should create an Agent with multiple agents', () => {
    const agent1 = new SubAgent({
      id: 'agent-1',
      name: 'Agent 1',
      description: 'First agent',
      prompt: 'First agent prompt',
    });

    const agent2 = new SubAgent({
      id: 'agent-2',
      name: 'Agent 2',
      description: 'Second agent',
      prompt: 'Second agent prompt',
    });

    const config: AgentConfig = {
      id: 'multi-agent-agent',
      name: 'Multi Agent Agent',
      subAgents: () => [agent1, agent2],
      defaultSubAgent: agent1,
    };

    const agentObject = agent(config);

    expect(agentObject.getName()).toBe('Multi Agent Agent');
    expect(agentObject.getSubAgents()).toContain(agent1);
    expect(agentObject.getSubAgents()).toContain(agent2);
    expect(agentObject.getSubAgents()).toHaveLength(2);
  });

  it('should create an Agent with additional config options', () => {
    const subAgent = new SubAgent({
      id: 'config-agent',
      name: 'Config Agent',
      description: 'Agent with config',
      prompt: 'Config agent prompt',
    });

    const config: AgentConfig = {
      id: 'configured-agent',
      name: 'Configured Agent',
      description: 'A agent with description',
      defaultSubAgent: subAgent,
      subAgents: () => [subAgent],
    };

    const agentObject = agent(config);
    // Can set context after creation
    agentObject.setConfig('test-tenant', 'test-project', 'http://localhost:3002');

    expect(agentObject.getName()).toBe('Configured Agent');
    expect(agentObject.getDescription()).toBe('A agent with description');
    expect(agentObject.getTenantId()).toBe('test-tenant');
  });
});
