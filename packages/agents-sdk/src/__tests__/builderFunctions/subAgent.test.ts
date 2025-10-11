import { describe, expect, it } from 'vitest';
import { subAgent } from '../../builderFunctions';
import type { SubAgentConfig } from '../../types';

describe('agent builder function', () => {
  it('should create an agent with required config', () => {
    const config: SubAgentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test description',
      prompt: 'You are a helpful test agent',
    };

    const testAgent = subAgent(config);

    expect(testAgent.getName()).toBe('Test Agent');
    expect(testAgent.getId()).toBe('test-agent');
  });

  it('should require an ID', () => {
    const config = {
      name: 'No ID Agent',
      description: 'Agent without ID',
      prompt: 'Test prompt',
      // id is missing
    } as SubAgentConfig;

    expect(() => subAgent(config)).toThrow(
      'Sub-Agent ID is required. Sub-Agents must have stable IDs for consistency across deployments.'
    );
  });

  it('should create an agent with all optional fields', () => {
    const config: SubAgentConfig = {
      id: 'full-config-agent',
      name: 'Full Config Agent',
      description: 'Agent with all config options',
      prompt: 'Comprehensive test agent',
    };

    const testAgent = subAgent(config);
    testAgent.setContext('test-tenant', 'test-project');

    expect(testAgent.getName()).toBe('Full Config Agent');
    expect(testAgent.getId()).toBe('full-config-agent');
  });

  it('should create an agent with data components function', () => {
    const mockDataComponent = {
      id: 'test-component',
      name: 'Test Component',
      description: 'A test data component',
    };

    const config: SubAgentConfig = {
      id: 'component-agent',
      name: 'Component Agent',
      description: 'Agent with data components',
      prompt: 'Agent that uses data components',
      dataComponents: () => [mockDataComponent],
    };

    const testAgent = subAgent(config);

    expect(testAgent.getName()).toBe('Component Agent');
    expect(typeof testAgent.config.dataComponents).toBe('function');
  });

  it('should create an agent with transfer relationships', () => {
    // Create a transfer target agent first
    const transferAgent = subAgent({
      id: 'transfer-target',
      name: 'Transfer Target',
      description: 'Target for transfers',
      prompt: 'Handles transferred tasks',
    });

    const config: SubAgentConfig = {
      id: 'source-agent',
      name: 'Source Agent',
      description: 'Agent that can transfer',
      prompt: 'Source agent prompt',
      canTransferTo: () => [transferAgent],
    };

    const testAgent = subAgent(config);

    expect(testAgent.getName()).toBe('Source Agent');
    expect(typeof testAgent.config.canTransferTo).toBe('function');
  });
});
