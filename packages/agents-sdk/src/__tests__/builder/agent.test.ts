import { CredentialStoreType } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../../agent';
import { ExternalAgent } from '../../external-agent';
import { SubAgent } from '../../subAgent';
import { Tool } from '../../tool';
import type { AgentConfig, GenerateOptions, MessageInput } from '../../types';

// Mock dependencies
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// Mock the agentFullClient
vi.mock('../../agentFullClient.js', () => ({
  updateFullAgentViaAPI: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
  createFullAgentViaAPI: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
  getFullAgentViaAPI: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
}));

vi.mock('../../data/agentFull.js', () => ({
  createFullAgentServerSide: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
  updateFullAgentServerSide: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
  getFullAgentServerSide: vi.fn().mockResolvedValue({
    id: 'test-agent',
    name: 'Test Agent',
    agents: {
      'default-agent': {
        id: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are a helpful default agent',
        tools: [],
      },
    },
    tools: {},
    dataComponents: {},
    defaultSubAgentId: 'default-agent',
  }),
}));

vi.mock('../../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock @inkeep/agents-core for project model and stopWhen inheritance
vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual('@inkeep/agents-core');
  return {
    ...actual,
    getProject: vi.fn().mockReturnValue(() =>
      Promise.resolve({
        tenantId: 'test-tenant',
        models: {
          base: { model: 'gpt-4o' },
          structuredOutput: { model: 'gpt-4o-mini' },
          summarizer: { model: 'gpt-3.5-turbo' },
        },
        stopWhen: {
          transferCountIs: 15,
          stepCountIs: 25,
        },
      })
    ),
  };
});

// Mock the agent's generate method
const mockGenerate = vi.fn().mockResolvedValue({
  text: 'Test response',
  formattedContent: {
    parts: [{ kind: 'text', text: 'Test response' }],
  },
});

describe('Agent', () => {
  let defaultSubAgent: SubAgent;
  let supportAgent: SubAgent;
  let externalAgent: ExternalAgent;
  let testTool: Tool;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful API responses
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'Mocked response' }),
      text: () => Promise.resolve('{"result": "Mocked response"}'),
      status: 200,
      statusText: 'OK',
    } as Response);

    // Create test tool
    testTool = new Tool({
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool for agent testing',
      serverUrl: 'http://localhost:3000',
    });

    // Create test agents
    defaultSubAgent = new SubAgent({
      id: 'default-agent',
      name: 'Default Agent',
      description: 'Default agent for agent testing',
      prompt: 'You are a helpful default agent',
      canUse: () => [testTool],
    });

    supportAgent = new SubAgent({
      id: 'support-agent',
      name: 'Support Agent',
      description: 'Support agent for agent testing',
      prompt: 'You provide customer support',
    });

    externalAgent = new ExternalAgent({
      id: 'external-1',
      name: 'External Agent',
      description: 'External service agent',
      baseUrl: 'https://external.example.com',
    });

    // Mock the generate method for all agents
    (defaultSubAgent as any).generate = mockGenerate;
    (supportAgent as any).generate = mockGenerate;

    // Add relationships
    defaultSubAgent.addTransfer(supportAgent);
    defaultSubAgent.addDelegate(externalAgent);
  });

  describe('Constructor', () => {
    it('should initialize with basic config', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        defaultSubAgent,
      };

      const agent = new Agent(config);
      // Set config to provide tenantId
      agent.setConfig('test-tenant', 'test-project', 'http://localhost:3002');

      expect(agent.getId()).toBe('test-agent');
      expect(agent.getName()).toBe('Test Agent');
      expect(agent.getDescription()).toBe('A test agent');
      expect(agent.getTenantId()).toBe('test-tenant');
    });

    it('should initialize with agents array', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
        subAgents: () => [supportAgent, externalAgent],
      };

      const agent = new Agent(config);
      const subAgents = agent.getSubAgents();

      expect(subAgents).toHaveLength(3); // defaultSubAgent + 2 additional
      expect(subAgents.some((a) => a.getName() === 'Default Agent')).toBe(true);
      expect(subAgents.some((a) => a.getName() === 'Support Agent')).toBe(true);
      expect(subAgents.some((a) => a.getName() === 'External Agent')).toBe(true);
    });

    it('should initialize with agents object', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
        subAgents: () => [supportAgent, externalAgent],
      };

      const agent = new Agent(config);
      const subAgents = agent.getSubAgents();

      expect(subAgents).toHaveLength(3);
    });

    it('should handle missing optional parameters', () => {
      const config: AgentConfig = {
        id: 'minimal-agent',
        defaultSubAgent,
      };

      const agent = new Agent(config);

      expect(agent.getId()).toBe('minimal-agent');
      expect(agent.getName()).toBe('minimal-agent');
      expect(agent.getTenantId()).toBe('default');
      expect(agent.getDescription()).toBeUndefined();
    });
  });

  describe('Agent Management', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
      });
    });

    it('should add subagents', () => {
      agent.addSubAgent(supportAgent);
      const subAgents = agent.getSubAgents();

      expect(subAgents).toHaveLength(2);
      expect(subAgents.some((a) => a.getName() === 'Support Agent')).toBe(true);
    });

    it('should get agent by id', () => {
      agent.addSubAgent(supportAgent);
      const agentObject = agent.getSubAgent('support-agent');

      expect(agentObject).toBeDefined();
      expect(agentObject?.getName()).toBe('Support Agent');
    });

    it('should return undefined for non-existent agent', () => {
      const agentObject = agent.getSubAgent('non-existent-agent');
      expect(agentObject).toBeUndefined();
    });

    it('should get default agent', () => {
      const subAgent = agent.getDefaultSubAgent();
      expect(subAgent).toBe(defaultSubAgent);
    });

    it('should set default agent', () => {
      agent.setDefaultSubAgent(supportAgent);
      const subAgent = agent.getDefaultSubAgent();
      expect(subAgent).toBe(supportAgent);
    });
  });

  describe('Agent Operations', () => {
    let agentObject: Agent;

    beforeEach(() => {
      agentObject = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
        subAgents: () => [supportAgent],
      });
      // Set config to provide tenantId and projectId
      agentObject.setConfig('test-tenant', 'test-project', 'http://localhost:3002');
    });

    it('should initialize agent and create database entities', async () => {
      await agentObject.init();

      const { updateFullAgentViaAPI } = await import('../../agentFullClient.js');
      expect(updateFullAgentViaAPI).toHaveBeenCalledWith(
        'test-tenant', // tenantId
        'test-project', // projectId
        'http://localhost:3002', // apiUrl
        'test-agent', // agentId
        expect.objectContaining({
          id: 'test-agent',
          name: 'Test Agent',
          subAgents: expect.objectContaining({
            'default-agent': expect.objectContaining({
              id: 'default-agent',
              name: 'Default Agent',
            }),
            'support-agent': expect.objectContaining({
              id: 'support-agent',
              name: 'Support Agent',
            }),
          }),
        })
      );
    });

    it('should handle initialization errors gracefully', async () => {
      const { updateFullAgentViaAPI } = await import('../../agentFullClient.js');
      vi.mocked(updateFullAgentViaAPI).mockRejectedValueOnce(new Error('DB error'));

      const errorAgent = new Agent({
        id: 'error-agent',
        name: 'Error Agent',
        defaultSubAgent,
        subAgents: () => [defaultSubAgent],
      });

      await expect(errorAgent.init()).rejects.toThrow('DB error');
    });

    it('should not reinitialize if already initialized', async () => {
      await agentObject.init();
      await agentObject.init(); // Second call

      const { updateFullAgentViaAPI } = await import('../../agentFullClient.js');
      expect(updateFullAgentViaAPI).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Generation', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
      });
      await agent.init();
    });

    it('should generate message using default agent', async () => {
      const messageInput: MessageInput = 'Hello, how can you help?';

      const result = await agent.generate(messageInput);

      // Expect fetch to be called for the agent execution API
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
      expect(result).toBe('Mocked response');
    });

    it('should generate message with specific agent', async () => {
      agent.addSubAgent(supportAgent);

      const messageInput: MessageInput = 'I need support';

      const result = await agent.generate(messageInput);

      // Expect fetch to be called for the agent execution API
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toBe('Mocked response');
    });

    it('should throw error if specified agent not found', async () => {
      // Mock fetch to return an error response for this test
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const messageInput: MessageInput = 'Hello';

      await expect(agent.generate(messageInput)).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should throw error if no default agent and no agent specified', async () => {
      const agentWithoutDefault = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
      });
      await agentWithoutDefault.init();

      const messageInput: MessageInput = 'Hello';

      await expect(agentWithoutDefault.generate(messageInput)).rejects.toThrow(
        'No default agent configured for this agent'
      );
    });

    it('should pass generate options correctly', async () => {
      const messageInput: MessageInput = 'Hello';

      const options: GenerateOptions = {
        customBodyParams: { custom: 'data' },
      };

      const result = await agent.generate(messageInput, options);

      // Expect fetch to be called for the agent execution API
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toBe('Mocked response');
    });
  });

  describe('Streaming', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent,
      });
      await agent.init();
    });

    it('should handle streaming generation', async () => {
      const messageInput: MessageInput = 'Stream this message';

      const result = await agent.generateStream(messageInput);

      // Should return a StreamResponse with textStream
      expect(result).toHaveProperty('textStream');
      expect(result.textStream).toBeDefined();

      // Test streaming - consume the async generator
      const chunks = [];
      if (result.textStream) {
        for await (const chunk of result.textStream) {
          chunks.push(chunk);
        }
      }
      expect(chunks.length).toBeGreaterThan(0);

      // Verify at least one fetch call was made
      expect(fetch).toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      // Mock fetch to return an error response for this test
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const messageInput: MessageInput = 'Stream this';

      const result = await agent.generateStream(messageInput);

      // The StreamResponse is created successfully, but the error occurs when consuming the stream
      expect(result).toHaveProperty('textStream');

      // Error should be thrown when trying to consume the async generator
      const iterator = result.textStream?.[Symbol.asyncIterator]();
      await expect(iterator?.next()).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Full Agent Definition', () => {
    it('should convert to full agent definition correctly', async () => {
      const agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test description',
        defaultSubAgent,
        subAgents: () => [supportAgent, externalAgent],
      });

      await agent.init();

      const { updateFullAgentViaAPI } = await import('../../agentFullClient.js');
      const createCall = vi.mocked(updateFullAgentViaAPI).mock.calls[0][4]; // 5th argument contains the agent data (tenantId, projectId, apiUrl, agentId, agentData)

      expect(createCall).toMatchObject({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test description',
        subAgents: {
          'default-agent': {
            id: 'default-agent',
            name: 'Default Agent',
            type: 'internal',
            canTransferTo: ['support-agent'],
            canDelegateTo: ['external-1'],
          },
          'support-agent': {
            id: 'support-agent',
            name: 'Support Agent',
            type: 'internal',
          },
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle agent generation errors', async () => {
      // Mock fetch to return an error response for agent execution
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Generation failed',
      } as Response); // Agent execution call

      const agent = new Agent({
        id: 'test-agent',
        defaultSubAgent,
      });
      await agent.init();

      const messageInput: MessageInput = 'This will fail';

      await expect(agent.generate(messageInput)).rejects.toThrow('HTTP 500: Generation failed');
    });
  });

  describe('Project-Level Model Inheritance', () => {
    let agent: Agent;
    let agent1: SubAgent;
    let agent2: SubAgent;

    beforeEach(async () => {
      vi.clearAllMocks();

      // Reset the @inkeep/core mock to default behavior
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockReturnValue(() =>
        Promise.resolve({
          tenantId: 'test-tenant',
          id: 'test-project',
          name: 'Test Project',
          description: 'Test project for agent testing',
          models: {
            base: { model: 'gpt-4o' },
            structuredOutput: { model: 'gpt-4o-mini' },
            summarizer: { model: 'gpt-3.5-turbo' },
          },
          stopWhen: {
            transferCountIs: 15,
            stepCountIs: 25,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      agent1 = new SubAgent({
        id: 'agent1',
        name: 'Agent 1',
        description: 'Test agent 1 for init',
        prompt: 'Test agent 1',
      });

      agent2 = new SubAgent({
        id: 'agent2',
        name: 'Agent 2',
        description: 'Test agent 2 for init',
        prompt: 'Test agent 2',
      });

      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent: agent1,
        subAgents: () => [agent2],
      });

      // Mock successful API responses for agent operations
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'Mocked response' }),
        text: () => Promise.resolve('{"result": "Mocked response"}'),
        status: 200,
        statusText: 'OK',
      } as Response);
    });

    it('should inherit project-level model defaults when agent has no models', async () => {
      // Agent has no models configured - should inherit from project
      expect(agent.getModels()).toBeUndefined();

      await agent.init();

      // Should have inherited project models
      const inheritedModels = agent.getModels();
      expect(inheritedModels).toEqual({
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
        summarizer: { model: 'gpt-3.5-turbo' },
      });

      // Verify database client was called for project lookup
      const { getProject } = await import('@inkeep/agents-core');
      expect(getProject).toHaveBeenCalled();
    });

    it('should not override existing agent models but inherit missing ones', async () => {
      const agentModels = {
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'claude-3.5-haiku' },
      };

      agent.setModels(agentModels);
      expect(agent.getModels()).toEqual(agentModels);

      await agent.init();

      // Should keep existing agent models and inherit missing summarizer from project
      const expectedModels = {
        base: { model: 'claude-3-sonnet' }, // kept from agent
        structuredOutput: { model: 'claude-3.5-haiku' }, // kept from agent
        summarizer: { model: 'gpt-3.5-turbo' }, // inherited from project
      };
      expect(agent.getModels()).toEqual(expectedModels);

      // Project database lookup is called for both model and stopWhen inheritance
      const { getProject } = await import('@inkeep/agents-core');
      expect(getProject).toHaveBeenCalled();
    });

    it('should propagate agent models to agents without models', async () => {
      const agentModels = {
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
      };

      agent.setModels(agentModels);

      // Agents start with no models
      expect(agent1.getModels()).toBeUndefined();
      expect(agent2.getModels()).toBeUndefined();

      await agent.init();

      // Agents should inherit agent models
      expect(agent1.getModels()).toEqual(agentModels);
      expect(agent2.getModels()).toEqual(agentModels);
    });

    it('should not override agent models when they are already configured', async () => {
      const agentModels = {
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
        summarizer: { model: 'gpt-3.5-turbo' },
      };

      const agent1Models = {
        base: { model: 'claude-3-opus' },
        summarizer: { model: 'claude-3.5-haiku' },
      };

      agent.setModels(agentModels);
      agent1.setModels(agent1Models);

      await agent.init();

      // Agent1 should keep its existing models and inherit missing structuredOutput from agent
      const expectedAgent1Models = {
        base: { model: 'claude-3-opus' }, // kept from agent
        summarizer: { model: 'claude-3.5-haiku' }, // kept from agent
        structuredOutput: { model: 'gpt-4o-mini' }, // inherited from agent
      };
      expect(agent1.getModels()).toEqual(expectedAgent1Models);

      // Agent2 should inherit all models from agent
      expect(agent2.getModels()).toEqual(agentModels);
    });

    it('should support partial model inheritance from agent to agents', async () => {
      const agentModels = {
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
        summarizer: { model: 'gpt-3.5-turbo' },
      };

      // Agent1 has partial models (missing base)
      const agent1PartialModels = {
        structuredOutput: { model: 'claude-3.5-haiku' },
        summarizer: { model: 'claude-3-sonnet' },
        // no base - should inherit from agent
      };

      agent.setModels(agentModels);
      agent1.setModels(agent1PartialModels);

      await agent.init();

      // Agent1 should inherit missing base from agent, keep existing models
      const expectedAgent1Models = {
        base: { model: 'gpt-4o' }, // inherited from agent
        structuredOutput: { model: 'claude-3.5-haiku' }, // kept from agent
        summarizer: { model: 'claude-3-sonnet' }, // kept from agent
      };
      expect(agent1.getModels()).toEqual(expectedAgent1Models);

      // Agent2 should inherit all models from agent (no agent models)
      expect(agent2.getModels()).toEqual(agentModels);
    });

    it('should handle project database errors gracefully', async () => {
      // Mock project database to throw error
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockReturnValueOnce(() => Promise.reject(new Error('Database error')));

      // Agent has no models - will try to inherit from project
      expect(agent.getModels()).toBeUndefined();

      await agent.init();

      // Should remain undefined after failed project fetch
      expect(agent.getModels()).toBeUndefined();

      // Agents should also remain undefined
      expect(agent1.getModels()).toBeUndefined();
      expect(agent2.getModels()).toBeUndefined();
    });

    it('should handle project with no models configured', async () => {
      // Mock project database to return project without models
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockReturnValueOnce(() =>
        Promise.resolve({
          tenantId: 'test-tenant',
          id: 'test-project',
          name: 'Test Project',
          description: 'Test project',
          models: null,
          stopWhen: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      expect(agent.getModels()).toBeUndefined();

      await agent.init();

      // Should remain undefined when project has no models
      expect(agent.getModels()).toBeUndefined();
      expect(agent1.getModels()).toBeUndefined();
      expect(agent2.getModels()).toBeUndefined();
    });

    it('should support partial model inheritance when agent has some but not all model types', async () => {
      // Set partial agent models (missing summarizer)
      const partialAgentModels = {
        base: { model: 'claude-3-sonnet' },
        structuredOutput: { model: 'claude-3.5-haiku' },
        // no summarizer - should inherit from project
      };

      agent.setModels(partialAgentModels);

      await agent.init();

      // Should inherit missing summarizer from project, keep existing models
      const finalModels = agent.getModels();
      expect(finalModels).toEqual({
        base: { model: 'claude-3-sonnet' }, // kept from agent
        structuredOutput: { model: 'claude-3.5-haiku' }, // kept from agent
        summarizer: { model: 'gpt-3.5-turbo' }, // inherited from project
      });
    });

    it('should work with full inheritance chain: project -> agent -> agent', async () => {
      // Set up inheritance chain
      const projectModels = {
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
        summarizer: { model: 'gpt-3.5-turbo' },
      };

      // The default mock already returns project models, so no additional setup needed

      // Agent starts with no models - will inherit from project
      expect(agent.getModels()).toBeUndefined();

      await agent.init();

      // Verify full inheritance chain
      expect(agent.getModels()).toEqual(projectModels);
      expect(agent1.getModels()).toEqual(projectModels);
      expect(agent2.getModels()).toEqual(projectModels);
    });

    it('should support complex partial inheritance across entire chain', async () => {
      // Project has all three model types
      const _projectModels = {
        base: { model: 'gpt-4o' },
        structuredOutput: { model: 'gpt-4o-mini' },
        summarizer: { model: 'gpt-3.5-turbo' },
      };

      // Agent has partial models (missing summarizer)
      const agentPartialModels = {
        base: { model: 'claude-3-opus' }, // overrides project
        structuredOutput: { model: 'claude-3-sonnet' }, // overrides project
        // no summarizer - should inherit from project
      };

      // Agent1 has partial models (missing base)
      const agent1PartialModels = {
        structuredOutput: { model: 'claude-3.5-haiku' }, // overrides agent
        // no base or summarizer - should inherit from agent/project
      };

      // The default mock already returns project models
      agent.setModels(agentPartialModels);
      agent1.setModels(agent1PartialModels);

      await agent.init();

      // Verify complex inheritance:
      // Agent should inherit missing summarizer from project
      const expectedAgentModels = {
        base: { model: 'claude-3-opus' }, // explicit in agent
        structuredOutput: { model: 'claude-3-sonnet' }, // explicit in agent
        summarizer: { model: 'gpt-3.5-turbo' }, // inherited from project
      };
      expect(agent.getModels()).toEqual(expectedAgentModels);

      // Agent1 should inherit missing models from agent
      const expectedAgent1Models = {
        base: { model: 'claude-3-opus' }, // inherited from agent
        structuredOutput: { model: 'claude-3.5-haiku' }, // explicit in agent
        summarizer: { model: 'gpt-3.5-turbo' }, // inherited from agent (which got it from project)
      };
      expect(agent1.getModels()).toEqual(expectedAgent1Models);

      // Agent2 should inherit all models from agent
      expect(agent2.getModels()).toEqual(expectedAgentModels);
    });

    it('should apply inheritance to agents added via addAgent() after agent construction', async () => {
      // Create agent with models
      const agentModels = {
        base: { model: 'claude-3-opus' },
        structuredOutput: { model: 'claude-3-sonnet' },
      };

      const agent = new Agent({
        id: 'test-agent-add-agent',
        name: 'Test Agent Add Agent',
        defaultSubAgent: agent1,
        models: agentModels,
      });

      // Create a new agent after agent construction
      const newAgent = new SubAgent({
        id: 'new-agent',
        name: 'New Agent',
        description: 'Dynamically added agent',
        prompt: 'New agent added later',
      });

      // Agent should have no models initially
      expect(newAgent.getModels()).toBeUndefined();

      // Add agent to agent using addAgent()
      agent.addSubAgent(newAgent);

      // Agent should immediately inherit agent models
      expect(newAgent.getModels()).toEqual(agentModels);
    });
  });

  describe('Project-Level StopWhen Inheritance', () => {
    let agent: Agent;
    let agent1: SubAgent;
    let agent2: SubAgent;

    beforeEach(async () => {
      vi.clearAllMocks();

      // Reset the @inkeep/core mock to default behavior with stopWhen
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockReturnValue(() =>
        Promise.resolve({
          tenantId: 'test-tenant',
          id: 'test-project',
          name: 'Test Project',
          description: 'Test project for agent testing',
          models: {
            base: { model: 'gpt-4o' },
            structuredOutput: { model: 'gpt-4o-mini' },
            summarizer: { model: 'gpt-3.5-turbo' },
          },
          stopWhen: {
            transferCountIs: 15,
            stepCountIs: 25,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      agent1 = new SubAgent({
        id: 'agent1',
        name: 'Agent 1',
        description: 'Test agent 1 for init',
        prompt: 'Test agent 1',
      });

      agent2 = new SubAgent({
        id: 'agent2',
        name: 'Agent 2',
        description: 'Test agent 2 for init',
        prompt: 'Test agent 2',
      });

      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        defaultSubAgent: agent1,
        subAgents: () => [agent2],
      });

      // Mock successful API responses for agent operations
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'Mocked response' }),
        text: () => Promise.resolve('{"result": "Mocked response"}'),
        status: 200,
        statusText: 'OK',
      } as Response);
    });

    it('should inherit project-level transferCountIs when agent has no stopWhen configured', async () => {
      // Agent starts with default stopWhen (transferCountIs: 10, no stepCountIs)
      const initialStopWhen = agent.getStopWhen();
      expect(initialStopWhen.transferCountIs).toBe(10); // default value

      await agent.init();

      // Should have inherited project transferCountIs (15) since it wasn't explicitly set
      const inheritedStopWhen = agent.getStopWhen();
      expect(inheritedStopWhen.transferCountIs).toBe(15);

      // Verify database client was called for project lookup
      const { getProject } = await import('@inkeep/agents-core');
      expect(getProject).toHaveBeenCalled();
    });

    it('should inherit project-level stepCountIs for agents when not configured', async () => {
      // Agents start with no stopWhen configured
      expect(agent1.config.stopWhen).toBeUndefined();
      expect(agent2.config.stopWhen).toBeUndefined();

      await agent.init();

      // Agents should inherit project stepCountIs (25)
      expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
      expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
    });

    it('should not override existing agent stopWhen configuration', async () => {
      // Set explicit agent stopWhen
      const agentConfig = {
        id: 'test-agent-explicit',
        name: 'Test Agent Explicit',
        defaultSubAgent: agent1,
        subAgents: () => [agent2],
        stopWhen: {
          transferCountIs: 20, // explicit value
        },
      };

      const explicitAgent = new Agent(agentConfig);

      // Should keep explicit value
      expect(explicitAgent.getStopWhen().transferCountIs).toBe(20);

      await explicitAgent.init();

      // Should not inherit from project - keep explicit value
      expect(explicitAgent.getStopWhen().transferCountIs).toBe(20);

      // But agents should still inherit stepCountIs from project
      const agents = explicitAgent.getSubAgents();
      const internalAgents = agents.filter((a) => explicitAgent.isInternalAgent(a));
      for (const agent of internalAgents) {
        expect((agent as any).config.stopWhen?.stepCountIs).toBe(25);
      }
    });

    it('should not override existing agent stopWhen configuration', async () => {
      // Set explicit agent stopWhen
      agent1.config.stopWhen = {
        stepCountIs: 30, // explicit value
      };

      await agent.init();

      // Agent1 should keep its explicit value
      expect(agent1.config.stopWhen.stepCountIs).toBe(30);

      // Agent2 should inherit project value
      expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
    });

    it('should handle project with no stopWhen configured', async () => {
      // Create fresh Agents and Sub Agents for this test
      const testAgent1 = new SubAgent({
        id: 'test-agent1',
        name: 'Test Agent 1',
        description: 'First test agent',
        prompt: 'Test agent 1',
      });

      const testAgent2 = new SubAgent({
        id: 'test-agent2',
        name: 'Test Agent 2',
        description: 'Second test agent',
        prompt: 'Test agent 2',
      });

      const testAgent = new Agent({
        id: 'test-agent-no-stopwhen',
        name: 'Test Agent No StopWhen',
        defaultSubAgent: testAgent1,
        subAgents: () => [testAgent2],
      });

      const initialStopWhen = testAgent.getStopWhen();
      expect(initialStopWhen.transferCountIs).toBe(10); // default value

      // Clear and set specific mock for this test (after beforeEach)
      // Need to handle both model and stopWhen calls
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockClear();
      vi.mocked(getProject).mockImplementation(
        () => () =>
          Promise.resolve({
            tenantId: 'test-tenant',
            id: 'test-project',
            name: 'Test Project',
            description: 'Test project',
            models: {
              base: { model: 'gpt-4o' },
            },
            stopWhen: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
      );

      await testAgent.init();

      // Should keep default when project has no stopWhen
      expect(testAgent.getStopWhen().transferCountIs).toBe(10);

      // Agents should have no stepCountIs configured
      expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
      expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
    });

    it('should handle project database errors gracefully for stopWhen', async () => {
      // Create fresh Agents and Sub Agents for this test
      const testAgent1 = new SubAgent({
        id: 'test-agent1-error',
        name: 'Test Agent 1 Error',
        description: 'Error test agent 1',
        prompt: 'Test agent 1',
      });

      const testAgent2 = new SubAgent({
        id: 'test-agent2-error',
        name: 'Test Agent 2 Error',
        description: 'Error test agent 2',
        prompt: 'Test agent 2',
      });

      const testAgent = new Agent({
        id: 'test-agent-error',
        name: 'Test Agent Error',
        defaultSubAgent: testAgent1,
        subAgents: () => [testAgent2],
      });

      const initialStopWhen = testAgent.getStopWhen();
      expect(initialStopWhen.transferCountIs).toBe(10); // default value

      // Clear and set specific mock for this test (after beforeEach)
      // Need to handle both model and stopWhen calls
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockClear();
      vi.mocked(getProject).mockImplementation(
        () => () => Promise.reject(new Error('Database error'))
      );

      await testAgent.init();

      // Should keep default when project fetch fails
      expect(testAgent.getStopWhen().transferCountIs).toBe(10);

      // Agents should have no stepCountIs configured
      expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
      expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
    });

    it('should support partial stopWhen inheritance', async () => {
      // Create fresh Agents and Sub Agents for this test
      const testAgent1 = new SubAgent({
        id: 'test-agent1-partial',
        name: 'Test Agent 1 Partial',
        description: 'Partial test agent 1',
        prompt: 'Test agent 1',
      });

      const testAgent2 = new SubAgent({
        id: 'test-agent2-partial',
        name: 'Test Agent 2 Partial',
        description: 'Partial test agent 2',
        prompt: 'Test agent 2',
      });

      const testAgent = new Agent({
        id: 'test-agent-partial',
        name: 'Test Agent Partial',
        defaultSubAgent: testAgent1,
        subAgents: () => [testAgent2],
      });

      // Clear and set specific mock for this test (after beforeEach)
      // Need to handle both model and stopWhen calls
      const { getProject } = await import('@inkeep/agents-core');
      vi.mocked(getProject).mockClear();
      vi.mocked(getProject).mockImplementation(
        () => () =>
          Promise.resolve({
            tenantId: 'test-tenant',
            id: 'test-project',
            name: 'Test Project',
            description: 'Test project',
            models: {
              base: { model: 'gpt-4o' },
            },
            stopWhen: {
              transferCountIs: 12,
              // no stepCountIs
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
      );

      await testAgent.init();

      // Should inherit transferCountIs but not stepCountIs
      expect(testAgent.getStopWhen().transferCountIs).toBe(12);

      // Agents should not have stepCountIs since project doesn't define it
      expect(testAgent1.config.stopWhen?.stepCountIs).toBeUndefined();
      expect(testAgent2.config.stopWhen?.stepCountIs).toBeUndefined();
    });

    it('should work with full stopWhen inheritance chain: project -> agent -> agents', async () => {
      // Set up inheritance chain
      const _projectStopWhen = {
        transferCountIs: 15,
        stepCountIs: 25,
      };

      // The default mock already returns project stopWhen, so no additional setup needed

      // Agent starts with default stopWhen - will inherit transferCountIs from project
      const initialAgentStopWhen = agent.getStopWhen();
      expect(initialAgentStopWhen.transferCountIs).toBe(10); // default

      await agent.init();

      // Verify full inheritance chain
      const finalAgentStopWhen = agent.getStopWhen();
      expect(finalAgentStopWhen.transferCountIs).toBe(15); // inherited from project

      // Both agents should inherit stepCountIs from project
      expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
      expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
    });

    it('should initialize agent stopWhen objects when inheriting', async () => {
      // Agents start with no stopWhen
      expect(agent1.config.stopWhen).toBeUndefined();
      expect(agent2.config.stopWhen).toBeUndefined();

      await agent.init();

      // Agents should have stopWhen objects initialized even if they only inherit stepCountIs
      expect(agent1.config.stopWhen).toBeDefined();
      expect(agent2.config.stopWhen).toBeDefined();
      expect(agent1.config.stopWhen?.stepCountIs).toBe(25);
      expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
    });

    it('should handle mixed inheritance scenarios', async () => {
      // Set agent with partial stopWhen and agent with partial stopWhen
      const mixedAgent = new Agent({
        id: 'mixed-agent',
        name: 'Mixed Agent',
        defaultSubAgent: agent1,
        subAgents: () => [agent2],
        stopWhen: {
          transferCountIs: 18, // agent explicit
          // no stepCountIs - will be inherited from project
        },
      });

      // Agent1 has partial stopWhen
      agent1.config.stopWhen = {
        stepCountIs: 35, // agent explicit
      };

      await mixedAgent.init();

      // Agent should keep explicit transferCountIs
      expect(mixedAgent.getStopWhen().transferCountIs).toBe(18);

      // Agent1 should keep explicit stepCountIs
      expect(agent1.config.stopWhen.stepCountIs).toBe(35);

      // Agent2 should inherit stepCountIs from project
      expect(agent2.config.stopWhen?.stepCountIs).toBe(25);
    });
  });

  describe('Referential Getter Syntax', () => {
    it('should support getter functions for agents and credentials', async () => {
      const testAgent = new SubAgent({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test agent',
        prompt: 'Test instructions',
      });

      const credentialRef = {
        id: 'test-cred',
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-default',
        retrievalParams: {
          key: 'TEST_KEY',
        },
      };

      // Using getter functions instead of arrays
      const agent = new Agent({
        id: 'getter-test-agent',
        name: 'Getter Test Agent',
        description: 'Test using getter syntax',
        defaultSubAgent: testAgent,
        subAgents: () => [testAgent],
        credentials: () => [credentialRef],
      });

      expect(agent.getSubAgents()).toContain(testAgent);
      expect(agent.getId()).toBe('getter-test-agent');
    });

    it('should support getter functions for agent tools', () => {
      const tool1 = new Tool({ id: 'tool1', name: 'Tool 1', serverUrl: 'https://example.com' });
      const tool2 = new Tool({ id: 'tool2', name: 'Tool 2', serverUrl: 'https://example.com' });

      const agent = new SubAgent({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test agent',
        prompt: 'Test instructions',
        canUse: () => [tool1, tool2],
      });

      const tools = agent.getTools();
      expect(tools).toHaveProperty('tool1');
      expect(tools).toHaveProperty('tool2');
      expect(tools.tool1).toBe(tool1);
      expect(tools.tool2).toBe(tool2);
    });

    it('should support getter functions for dataComponents and artifactComponents', () => {
      const dataComponent = {
        id: 'data1',
        name: 'Data Component 1',
        description: 'Test data component',
        props: { key: 'value' },
      };

      const artifactComponent = {
        id: 'artifact1',
        name: 'Artifact Component 1',
        description: 'Test artifact component',
        props: {
          type: 'object',
          properties: {
            summary: { type: 'string', inPreview: true },
            full: { type: 'string', inPreview: false },
          },
        },
      };

      const agent = new SubAgent({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Agent with components',
        prompt: 'Test instructions',
        dataComponents: () => [dataComponent],
        artifactComponents: () => [artifactComponent],
      });

      expect(agent.getDataComponents()).toEqual([dataComponent]);
      expect(agent.getArtifactComponents()).toEqual([artifactComponent]);
    });
  });
});
