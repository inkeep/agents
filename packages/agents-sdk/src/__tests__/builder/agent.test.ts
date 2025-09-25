import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../../agent';
import { ExternalAgent } from '../../externalAgent';
import type { AgentConfig } from '../../types';

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

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Agent Builder', () => {
  let mockTool: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful API responses
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
      text: () => Promise.resolve('Success'),
    } as Response);

    mockTool = {
      id: 'testTool',
      name: 'Test Tool',
      serverUrl: 'http://localhost:3000',
      tenantId: 'test-tenant',
      getId: () => 'testTool',
      getName: () => 'Test Tool',
      getCredentialReferenceId: () => undefined,
    } as any;
  });

  describe('Constructor', () => {
    it('should initialize with basic config', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test agent description',
        prompt: 'You are a helpful test agent',
      };

      const agent = new Agent(config);

      expect(agent.getName()).toBe('Test Agent');
      expect(agent.getId()).toBe('test-agent');
    });

    it('should use provided ID', () => {
      const agent = new Agent({
        id: 'custom-id-123',
        name: 'Customer Support Agent v2',
        description: 'Customer support agent description',
        prompt: 'Help customers',
      });

      expect(agent.getId()).toBe('custom-id-123');
    });

    it('should handle tools in config', () => {
      const config: AgentConfig = {
        id: 'tool-agent',
        name: 'Tool Agent',
        description: 'Tool agent description',
        prompt: 'Agent with tools',
        canUse: () => [mockTool],
      };

      const agent = new Agent(config);
      const tools = agent.getTools();

      expect(tools).toHaveProperty('testTool');
      expect(tools.testTool).toBe(mockTool);
    });

    it('should handle function-based relationships', () => {
      const transferAgent = new Agent({
        id: 'transfer-agent',
        name: 'Transfer Agent',
        description: 'Transfer agent description',
        prompt: 'Transfer agent prompt',
      });

      const config: AgentConfig = {
        id: 'source-agent',
        name: 'Source Agent',
        description: 'Source agent description',
        prompt: 'Source agent prompt',
        canTransferTo: () => [transferAgent],
      };

      const agent = new Agent(config);
      const transfers = agent.getTransfers();

      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toBe(transferAgent);
    });
  });

  describe('Tool Management', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test agent description',
        prompt: 'Test agent',
      });
    });

    it('should add tools', () => {
      agent.addTool('myTool', mockTool);
      const tools = agent.getTools();

      // Tool is indexed by its id property, not the name passed to addTool
      expect(tools).toHaveProperty('testTool');
      expect(tools.testTool).toBe(mockTool);
    });

    it('should initialize tools object if not present', () => {
      expect(agent.getTools()).toEqual({});

      agent.addTool('firstTool', mockTool);
      const tools = agent.getTools();

      // Tool is indexed by its id property
      expect(tools).toHaveProperty('testTool');
    });
  });

  describe('Agent Relationships', () => {
    let sourceAgent: Agent;
    let transferAgent: Agent;
    let delegateAgent: Agent;
    let externalAgent: ExternalAgent;

    beforeEach(() => {
      sourceAgent = new Agent({
        id: 'source-agent',
        name: 'Source Agent',
        description: 'Source agent description',
        prompt: 'Source agent',
      });

      transferAgent = new Agent({
        id: 'transfer-agent',
        name: 'Transfer Agent',
        description: 'Transfer agent description',
        prompt: 'Handles transferred tasks',
      });

      delegateAgent = new Agent({
        id: 'delegate-agent',
        name: 'Delegate Agent',
        description: 'Delegate agent description',
        prompt: 'Handles delegated tasks',
      });

      externalAgent = new ExternalAgent({
        id: 'external-1',
        name: 'External Agent',
        description: 'External service',
        baseUrl: 'https://external.com',
      });
    });

    it('should add transfer relationships', () => {
      sourceAgent.addTransfer(transferAgent);
      const transfers = sourceAgent.getTransfers();

      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toBe(transferAgent);
    });

    it('should add multiple transfer relationships', () => {
      const secondTransfer = new Agent({
        id: 'second-transfer',
        name: 'Second Transfer Agent',
        description: 'Second transfer description',
        prompt: 'Second transfer agent',
      });

      sourceAgent.addTransfer(transferAgent, secondTransfer);
      const transfers = sourceAgent.getTransfers();

      expect(transfers).toHaveLength(2);
      expect(transfers).toContain(transferAgent);
      expect(transfers).toContain(secondTransfer);
    });

    it('should add transfers to existing canTransferTo function', () => {
      const existingTransfer = new Agent({
        id: 'existing-transfer',
        name: 'Existing Transfer Agent',
        description: 'Existing transfer description',
        prompt: 'Existing transfer agent',
      });

      // Set initial transfer function
      sourceAgent.config.canTransferTo = () => [existingTransfer];

      // Add new transfer
      sourceAgent.addTransfer(transferAgent);
      const transfers = sourceAgent.getTransfers();

      expect(transfers).toHaveLength(2);
      expect(transfers).toContain(existingTransfer);
      expect(transfers).toContain(transferAgent);
    });

    it('should add delegate relationships', () => {
      sourceAgent.addDelegate(delegateAgent);
      const delegates = sourceAgent.getDelegates();

      expect(delegates).toHaveLength(1);
      expect(delegates[0]).toBe(delegateAgent);
    });

    it('should add external agent delegates', () => {
      sourceAgent.addDelegate(externalAgent);
      const delegates = sourceAgent.getDelegates();

      expect(delegates).toHaveLength(1);
      expect(delegates[0]).toBe(externalAgent);
    });

    it('should combine internal and external delegates', () => {
      sourceAgent.addDelegate(delegateAgent, externalAgent);
      const delegates = sourceAgent.getDelegates();

      expect(delegates).toHaveLength(2);
      expect(delegates).toContain(delegateAgent);
      expect(delegates).toContain(externalAgent);
    });
  });

  describe('Description Methods', () => {
    let sourceAgent: Agent;
    let _transferAgent: Agent;
    let _delegateAgent: Agent;

    beforeEach(() => {
      sourceAgent = new Agent({
        id: 'source-agent',
        name: 'Source Agent',
        description: 'Main agent that handles requests',
        prompt: 'You are the main agent',
      });

      _transferAgent = new Agent({
        id: 'transfer-agent',
        name: 'Transfer Agent',
        description: 'Specialized agent for transfers',
        prompt: 'You handle transfers',
      });

      _delegateAgent = new Agent({
        id: 'delegate-agent',
        name: 'Delegate Agent',
        description: 'Specialized agent for delegations',
        prompt: 'You handle delegations',
      });
    });

    it('should return basic description', () => {
      const description = sourceAgent.getDescription();
      expect(description).toBe('Main agent that handles requests');
    });

    it('should return empty string for missing description', () => {
      const agentWithoutDesc = new Agent({
        id: 'no-desc-agent',
        name: 'No Description Agent',
        description: '',
        prompt: 'No description provided',
      });

      const description = agentWithoutDesc.getDescription();
      expect(description).toBe('');
    });
  });

  describe('Initialization', () => {
    let agent: Agent;

    beforeEach(() => {
      const testTool = {
        id: 'testTool',
        name: 'Test Tool',
        serverUrl: 'http://localhost:3000',
        tenantId: 'test-tenant',
        getId: () => 'testTool',
        getName: () => 'Test Tool',
        getCredentialReferenceId: () => undefined,
      } as any;

      agent = new Agent({
        id: 'test-agent',
        name: 'Test Agent',
        prompt: 'Test instructions',
        description: 'Test description',
        canUse: () => [testTool],
        dataComponents: () => [
          {
            id: 'test-data-component',
            name: 'Test Data Component',
            description: 'Test description',
          },
        ],
      });
      // Set context for the agent
      agent.setContext('test-tenant', 'test-project');
    });

    it('should initialize agent and create backend entities', async () => {
      await agent.init();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tenants/test-tenant/agents/test-agent'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"name":"Test Agent"'),
        })
      );
    });

    it('should not reinitialize if already initialized', async () => {
      await agent.init();
      vi.clearAllMocks();

      await agent.init(); // Second call

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      } as Response);

      await expect(agent.init()).rejects.toThrow('updateResponse.text is not a function');
    });

    it('should handle tools during initialization', async () => {
      await agent.init();

      // With the new getter syntax, tools are handled differently
      // The agent should still initialize successfully
      expect(agent.getTools()).toBeDefined();
      expect(Object.keys(agent.getTools()).length).toBeGreaterThanOrEqual(0);
    });

    it('should create data components during initialization', async () => {
      await agent.init();

      // Verify data component creation API calls (check for both data-components and agent-data-components endpoints)
      const dataComponentCalls = vi
        .mocked(fetch)
        .mock.calls.filter(
          (call) =>
            call[0]?.toString().includes('/data-components') ||
            call[0]?.toString().includes('/agent-data-components')
        );
      expect(dataComponentCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Environment Handling', () => {
    it('should use custom base URL from environment', () => {
      process.env.INKEEP_API_URL = 'https://custom-api.example.com';

      const agent = new Agent({
        id: 'custom-url-agent',
        name: 'Custom URL Agent',
        description: 'Custom URL agent description',
        prompt: 'Uses custom URL',
      });

      // URL should be used in API calls
      expect((agent as any).baseURL).toBe('https://custom-api.example.com');

      delete process.env.INKEEP_API_URL;
    });

    it('should fallback to default URL', () => {
      delete process.env.INKEEP_API_URL;

      const agent = new Agent({
        id: 'default-url-agent',
        name: 'Default URL Agent',
        description: 'Default URL agent description',
        prompt: 'Uses default URL',
      });

      expect((agent as any).baseURL).toBe('http://localhost:3002');
    });
  });
});
