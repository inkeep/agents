import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agent, subAgent } from '../../index';

describe('Agent Model Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create agent with model settingsuration', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent with Model Settings',
      models: {
        base: {
          model: 'anthropic/claude-3-5-haiku-20241022',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
              maxTokens: 2048,
            },
          },
        },
        structuredOutput: {
          model: 'gpt-4o-mini',
        },
        summarizer: {
          model: 'anthropic/claude-3.5-haiku-20240307',
        },
      },
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getModels()).toEqual({
      base: {
        model: 'anthropic/claude-3-5-haiku-20241022',
        providerOptions: {
          anthropic: {
            temperature: 0.8,
            maxTokens: 2048,
          },
        },
      },
      structuredOutput: {
        model: 'gpt-4o-mini',
      },
      summarizer: {
        model: 'anthropic/claude-3.5-haiku-20240307',
      },
    });
  });

  it('should propagate agent model settings to agents without their own config', () => {
    const agentWithoutConfig = subAgent({
      id: 'agent-without-config',
      name: 'Agent Without Config',
      prompt: 'You are a test agent',
      description: 'Test Agent',
    });

    const agentWithConfig = subAgent({
      id: 'agent-with-config',
      name: 'Agent With Config',
      prompt: 'You are a test agent',
      models: {
        base: {
          model: 'openai/gpt-4o',
          providerOptions: {
            openai: {
              temperature: 0.3,
            },
          },
        },
      },
      description: 'Test Agent',
    });

    // Create agent with model settings
    const _testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent',
      models: {
        base: {
          model: 'anthropic/claude-3-5-haiku-20241022',
          providerOptions: {
            anthropic: {
              temperature: 0.8,
            },
          },
        },
      },
      defaultSubAgent: agentWithoutConfig,
      subAgents: () => [agentWithoutConfig, agentWithConfig],
    });

    // Model Settings should be inherited during agent construction
    expect(agentWithoutConfig.config.models).toEqual({
      base: {
        model: 'anthropic/claude-3-5-haiku-20241022',
        providerOptions: {
          anthropic: {
            temperature: 0.8,
          },
        },
      },
    });

    // Agent with config should keep its own configuration
    expect(agentWithConfig.config.models).toEqual({
      base: {
        model: 'openai/gpt-4o',
        providerOptions: {
          openai: {
            temperature: 0.3,
          },
        },
      },
    });
  });

  it('should handle agent without model settingsuration', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent Without Model Settings',
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getModels()).toBeUndefined();
  });

  it('should include model settings in agent statistics and validation', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent',
      models: {
        base: {
          model: 'anthropic/claude-sonnet-4-20250514',
        },
      },
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    const stats = testAgent.getStats();
    expect(stats.agentId).toBe('test-agent');
    expect(stats.agentCount).toBe(1);

    const validation = testAgent.validate();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should create agent with provider options in models', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent',
      models: {
        base: {
          model: 'gpt-4o',
          providerOptions: {
            anthropic: {
              temperature: 0.7,
              maxTokens: 4096,
            },
            openai: {
              temperature: 0.5,
              maxTokens: 2048,
            },
          },
        },
      },
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getModels()).toEqual({
      base: {
        model: 'gpt-4o',
        providerOptions: {
          anthropic: {
            temperature: 0.7,
            maxTokens: 4096,
          },
          openai: {
            temperature: 0.5,
            maxTokens: 2048,
          },
        },
      },
    });
  });

  it('should create agent with model settings without provider options', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent',
      models: {
        base: {
          model: 'anthropic/claude-3-5-sonnet-20241022',
        },
        structuredOutput: {
          model: 'gpt-4o-mini',
        },
      },
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getModels()).toEqual({
      base: {
        model: 'anthropic/claude-3-5-sonnet-20241022',
      },
      structuredOutput: {
        model: 'gpt-4o-mini',
      },
    });
  });

  it('should create agent with agent prompt', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent with Prompt',
      graphPrompt:
        'This is a specialized AI assistant for customer support. Always be helpful and professional.',
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getAgentPrompt()).toBe(
      'This is a specialized AI assistant for customer support. Always be helpful and professional.'
    );
  });

  it('should return undefined for agent without prompt', () => {
    const testAgent = agent({
      id: 'test-agent',
      name: 'Test Agent',
      defaultSubAgent: subAgent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'You are a test agent',
        description: 'Test Agent',
      }),
    });

    expect(testAgent.getAgentPrompt()).toBeUndefined();
  });
});
