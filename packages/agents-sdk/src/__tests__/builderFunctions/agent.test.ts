import { describe, expect, it } from 'vitest';
import { agent } from '../../builderFunctions';
import type { AgentConfig } from '../../types';

describe('agent builder function', () => {
  it('should create an agent with required config', () => {
    const config: AgentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test description',
      prompt: 'You are a helpful test agent',
    };

    const testAgent = agent(config);

    expect(testAgent.getName()).toBe('Test Agent');
    expect(testAgent.getId()).toBe('test-agent');
  });

  it('should require an ID', () => {
    const config = {
      name: 'No ID Agent',
      description: 'Agent without ID',
      prompt: 'Test prompt',
      // id is missing
    } as AgentConfig;

    expect(() => agent(config)).toThrow(
      'Agent ID is required. Agents must have stable IDs for consistency across deployments.'
    );
  });

  it('should create an agent with all optional fields', () => {
    const config: AgentConfig = {
      id: 'full-config-agent',
      name: 'Full Config Agent',
      description: 'Agent with all config options',
      prompt: 'Comprehensive test agent',
    };

    const testAgent = agent(config);
    testAgent.setContext('test-tenant', 'test-project', 'test-graph');

    expect(testAgent.getName()).toBe('Full Config Agent');
    expect(testAgent.getId()).toBe('full-config-agent');
  });

  it('should create an agent with data components function', () => {
    const mockDataComponent = {
      id: 'test-component',
      name: 'Test Component',
      description: 'A test data component',
    };

    const config: AgentConfig = {
      id: 'component-agent',
      name: 'Component Agent',
      description: 'Agent with data components',
      prompt: 'Agent that uses data components',
      dataComponents: () => [mockDataComponent],
    };

    const testAgent = agent(config);

    expect(testAgent.getName()).toBe('Component Agent');
    expect(typeof testAgent.config.dataComponents).toBe('function');
  });

  it('should create an agent with transfer relationships', () => {
    // Create a transfer target agent first
    const transferAgent = agent({
      id: 'transfer-target',
      name: 'Transfer Target',
      description: 'Target for transfers',
      prompt: 'Handles transferred tasks',
    });

    const config: AgentConfig = {
      id: 'source-agent',
      name: 'Source Agent',
      description: 'Agent that can transfer',
      prompt: 'Source agent prompt',
      canTransferTo: () => [transferAgent],
    };

    const testAgent = agent(config);

    expect(testAgent.getName()).toBe('Source Agent');
    expect(typeof testAgent.config.canTransferTo).toBe('function');
  });
});
