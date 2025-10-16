import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionApiClient, ManagementApiClient } from '../api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock config module
vi.mock('../utils/config.js', () => ({
  loadConfig: vi.fn(),
  validateConfiguration: vi.fn(async () => ({
    tenantId: 'test-tenant-id',
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    agentsManageApiKey: undefined,
    agentsRunApiKey: undefined,
    sources: {
      tenantId: 'test',
      agentsManageApiUrl: 'test',
      agentsRunApiUrl: 'test',
    },
  })),
}));

describe('ApiClient', () => {
  let apiClient: ManagementApiClient;
  let executionApiClient: ExecutionApiClient;

  beforeEach(async () => {
    apiClient = await ManagementApiClient.create(
      undefined,
      undefined,
      undefined,
      'test-project-id'
    );
    executionApiClient = await ExecutionApiClient.create(
      undefined,
      undefined,
      undefined,
      'test-project-id'
    );
    mockFetch.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should use default API URL when none provided', async () => {
      const client = await ManagementApiClient.create();
      expect(client).toBeDefined();
    });

    it('should use provided API URL', async () => {
      const customUrl = 'http://custom.example.com';
      const client = await ManagementApiClient.create(customUrl);
      expect(client).toBeDefined();
    });
  });

  describe('listAgents', () => {
    it('should fetch and return agent list successfully', async () => {
      const mockAgents = [
        { id: 'agent1', name: 'Test Agent 1' },
        { id: 'agent2', name: 'Test Agent 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockAgents }),
      });

      const result = await apiClient.listAgents();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant-id/projects/test-project-id/agents',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
      expect(result).toEqual(mockAgents);
    });

    it('should return empty array when no data field in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await apiClient.listAgents();
      expect(result).toEqual([]);
    });

    it('should throw error when request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(apiClient.listAgents()).rejects.toThrow('Failed to list agents: Not Found');
    });

    it('should throw error when tenant ID is not configured', async () => {
      const { validateConfiguration } = await import('../utils/config.js');
      // Mock validateConfiguration to return a config with empty tenant ID
      vi.mocked(validateConfiguration).mockResolvedValueOnce({
        tenantId: '',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3003',
        agentsManageApiKey: undefined,
        agentsRunApiKey: undefined,
        sources: {
          tenantId: 'test',
          agentsManageApiUrl: 'test',
          agentsRunApiUrl: 'test',
        },
      });

      const client = await ManagementApiClient.create();

      await expect(client.listAgents()).rejects.toThrow(
        'No tenant ID configured. Please run: inkeep init'
      );
    });

    it('should include Authorization header when API key is provided', async () => {
      const { validateConfiguration } = await import('../utils/config.js');
      vi.mocked(validateConfiguration).mockResolvedValueOnce({
        tenantId: 'test-tenant-id',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3003',
        agentsManageApiKey: 'test-api-key-123',
        agentsRunApiKey: undefined,
        sources: {
          tenantId: 'test',
          agentsManageApiUrl: 'test',
          agentsRunApiUrl: 'test',
        },
      });

      const clientWithApiKey = await ManagementApiClient.create(
        undefined,
        undefined,
        undefined,
        'test-project-id'
      );

      const mockAgents = [{ id: 'agent1', name: 'Test Agent 1' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockAgents }),
      });

      await clientWithApiKey.listAgents();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant-id/projects/test-project-id/agents',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer test-api-key-123',
          },
        }
      );
    });
  });

  describe('getAgent', () => {
    it('should return agent when found in list', async () => {
      const mockAgents = [
        { id: 'agent1', name: 'Test Agent 1' },
        { id: 'agent2', name: 'Test Agent 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockAgents }),
      });

      const result = await apiClient.getAgent('agent1');

      expect(result).toEqual({ id: 'agent1', name: 'Test Agent 1' });
    });

    it('should return null when agent not found', async () => {
      const mockAgents = [{ id: 'agent1', name: 'Test Agent 1' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockAgents }),
      });

      const result = await apiClient.getAgent('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('pushAgent', () => {
    it('should push agent successfully', async () => {
      const agentDefinition = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
      };

      const expectedResponse = {
        id: 'test-agent',
        name: 'Test Agent',
        tenantId: 'test-tenant-id',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: expectedResponse }),
      });

      const result = await apiClient.pushAgent(agentDefinition);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant-id/projects/test-project-id/agents/test-agent',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            ...agentDefinition,
            tenantId: 'test-tenant-id',
          }),
        }
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should throw error when agent has no id', async () => {
      const agentDefinition = {
        name: 'Test Agent',
        description: 'A test agent without id',
      };

      await expect(apiClient.pushAgent(agentDefinition)).rejects.toThrow(
        'Agent must have an id property'
      );
    });

    it('should throw error when push request fails', async () => {
      const agentDefinition = {
        id: 'test-agent',
        name: 'Test Agent',
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        text: async () => 'Invalid agent definition',
      });

      await expect(apiClient.pushAgent(agentDefinition)).rejects.toThrow(
        'Failed to push agent: Bad Request\nInvalid agent definition'
      );
    });

    it('should include Authorization header when API key is provided', async () => {
      const { validateConfiguration } = await import('../utils/config.js');
      vi.mocked(validateConfiguration).mockResolvedValueOnce({
        tenantId: 'test-tenant-id',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3003',
        agentsManageApiKey: 'test-manage-key-456',
        agentsRunApiKey: undefined,
        sources: {
          tenantId: 'test',
          agentsManageApiUrl: 'test',
          agentsRunApiUrl: 'test',
        },
      });

      const clientWithApiKey = await ManagementApiClient.create(
        undefined,
        undefined,
        undefined,
        'test-project-id'
      );

      const agentDefinition = {
        id: 'test-agent',
        name: 'Test Agent',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'test-agent' } }),
      });

      await clientWithApiKey.pushAgent(agentDefinition);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/tenants/test-tenant-id/projects/test-project-id/agents/test-agent',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer test-manage-key-456',
          },
          body: JSON.stringify({
            ...agentDefinition,
            tenantId: 'test-tenant-id',
          }),
        }
      );
    });
  });

  describe('chatCompletion', () => {
    it('should return streaming response when content type is event-stream', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const mockStream = new ReadableStream();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'text/event-stream' : null),
        },
        body: mockStream,
      });

      const result = await executionApiClient.chatCompletion('test-agent', messages);

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toBe(mockStream);
    });

    it('should return text response when content type is not event-stream', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello! How can I help you?',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        },
        json: async () => mockResponse,
      });

      const result = await executionApiClient.chatCompletion('test-agent', messages);

      expect(result).toBe('Hello! How can I help you?');
    });

    it('should handle response with result field instead of choices', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const mockResponse = {
        result: 'This is the result',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        },
        json: async () => mockResponse,
      });

      const result = await executionApiClient.chatCompletion('test-agent', messages);

      expect(result).toBe('This is the result');
    });

    it('should include conversation ID when provided', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const conversationId = 'conv-123';
      const mockStream = new ReadableStream();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'text/event-stream' : null),
        },
        body: mockStream,
      });

      await executionApiClient.chatCompletion('test-agent', messages, conversationId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            model: 'openai/gpt-4.1-mini',
            messages,
            conversationId,
            stream: true,
          }),
        })
      );
    });

    it('should throw error when chat request fails', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      await expect(executionApiClient.chatCompletion('test-agent', messages)).rejects.toThrow(
        'Chat request failed: Unauthorized\nInvalid credentials'
      );
    });

    it('should return empty string when no content in response', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({}),
      });

      const result = await executionApiClient.chatCompletion('test-agent', messages);

      expect(result).toBe('');
    });

    it('should include Authorization header when API key is provided', async () => {
      const { validateConfiguration } = await import('../utils/config.js');
      vi.mocked(validateConfiguration).mockResolvedValueOnce({
        tenantId: 'test-tenant-id',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3003',
        agentsManageApiKey: undefined,
        agentsRunApiKey: 'test-run-key-789',
        sources: {
          tenantId: 'test',
          agentsManageApiUrl: 'test',
          agentsRunApiUrl: 'test',
        },
      });

      const clientWithApiKey = await ExecutionApiClient.create(
        undefined,
        undefined,
        undefined,
        'test-project-id'
      );

      const messages = [{ role: 'user', content: 'Hello' }];
      const mockStream = new ReadableStream();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (key: string) => (key === 'content-type' ? 'text/event-stream' : null),
        },
        body: mockStream,
      });

      await clientWithApiKey.chatCompletion('test-agent', messages);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3003/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: 'Bearer test-run-key-789',
          'x-inkeep-tenant-id': 'test-tenant-id',
          'x-inkeep-project-id': 'test-project-id',
          'x-inkeep-agent-id': 'test-agent',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4.1-mini',
          messages,
          conversationId: undefined,
          stream: true,
        }),
      });
    });
  });

  describe('checkTenantId', () => {
    it('should throw error for all methods when tenant ID is not configured', async () => {
      const { validateConfiguration } = await import('../utils/config.js');
      // Mock validateConfiguration to return a config with no tenant ID
      vi.mocked(validateConfiguration).mockResolvedValue({
        tenantId: '',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3003',
        agentsManageApiKey: undefined,
        agentsRunApiKey: undefined,
        sources: {
          tenantId: 'test',
          agentsManageApiUrl: 'test',
          agentsRunApiUrl: 'test',
        },
      });

      const client = await ManagementApiClient.create();
      const execClient = await ExecutionApiClient.create();

      await expect(client.listAgents()).rejects.toThrow(
        'No tenant ID configured. Please run: inkeep init'
      );
      await expect(client.getAgent('test')).rejects.toThrow(
        'No tenant ID configured. Please run: inkeep init'
      );
      await expect(client.pushAgent({ id: 'test' })).rejects.toThrow(
        'No tenant ID configured. Please run: inkeep init'
      );
      await expect(execClient.chatCompletion('test', [])).rejects.toThrow();
    });
  });
});
