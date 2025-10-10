import { describe, expect, it } from 'vitest';
import { SubAgent } from '../../agent';
import type { SubAgentConfig } from '../../types';
import { createTestTenantId } from '../utils/testTenant';

describe('Agent with DataComponents Integration', () => {
  const _tenantId = createTestTenantId('agent-datacomponents');

  it('should handle agents with data components configuration', () => {
    const agentConfig: SubAgentConfig = {
      id: 'test-agent-with-datacomponents',
      name: 'TestAgentWithDataComponents',
      description: 'An agent that has data components',
      prompt: 'You are a helpful agent with UI components.',
      dataComponents: () => [
        {
          id: 'orders-list-1',
          name: 'OrdersList',
          description: 'Display a list of user orders',
          props: {
            type: 'object',
            properties: {
              orders: {
                type: 'array',
                items: { type: 'string' },
                description: 'Order items to display',
              },
            },
            required: ['orders'],
          },
        },
        {
          id: 'sales-button-1',
          name: 'SalesButton',
          description: 'Button to contact sales team',
          props: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Button label text',
              },
            },
            required: ['label'],
          },
        },
      ],
    };

    const agent = new SubAgent(agentConfig);

    expect(agent.getName()).toBe('TestAgentWithDataComponents');
    expect(agent.config.description).toBe('An agent that has data components');
    expect(agent.getInstructions()).toBe('You are a helpful agent with UI components.');
    expect(agent.getId()).toBe('test-agent-with-datacomponents');
    const dataComponents = agent.getDataComponents();
    expect(dataComponents).toHaveLength(2);
    expect(dataComponents[0]?.name).toBe('OrdersList');
    expect(dataComponents[1]?.name).toBe('SalesButton');
  });

  it('should handle agents without data components', () => {
    const agentConfig = {
      id: 'simple-agent',
      name: 'SimpleAgent',
      description: 'A simple agent without data components',
      prompt: 'You are a simple helpful agent.',
    };

    const agent = new SubAgent(agentConfig);

    expect(agent.getName()).toBe('SimpleAgent');
    expect(agent.config.dataComponents).toBeUndefined();
  });

  it('should handle agents with empty data components array', () => {
    const agentConfig: SubAgentConfig = {
      id: 'empty-datacomponents-agent',
      name: 'EmptyDataComponentsAgent',
      description: 'Agent with empty data components',
      prompt: 'You are a helpful agent.',
      dataComponents: () => [],
    };

    const agent = new SubAgent(agentConfig);

    expect(agent.getName()).toBe('EmptyDataComponentsAgent');
    expect(agent.config.dataComponents?.()).toEqual([]);
  });
});
