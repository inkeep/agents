/**
 * Tests for SlackApiClient - Internal API client for Slack integration
 *
 * Tests cover:
 * - SlackApiError class and error classification
 * - Project and agent listing
 * - Agent search by name/ID
 * - Agent triggering (chat API)
 * - API key management
 * - Session token validation
 * - Deferred response handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSlackApiClient,
  SlackApiClient,
  SlackApiError,
  sendDeferredResponse,
} from '../api-client';

describe('SlackApiClient', () => {
  const mockConfig = {
    sessionToken: 'test-session-token',
    tenantId: 'test-tenant',
    apiUrl: 'http://localhost:3002',
  };

  let client: SlackApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new SlackApiClient(mockConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SlackApiError', () => {
    it('should create error with status code', () => {
      const error = new SlackApiError('Test error', 401, 'Unauthorized');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(401);
      expect(error.responseBody).toBe('Unauthorized');
      expect(error.name).toBe('SlackApiError');
    });

    it('should identify unauthorized errors', () => {
      const error = new SlackApiError('Session expired', 401);

      expect(error.isUnauthorized).toBe(true);
      expect(error.isForbidden).toBe(false);
      expect(error.isNotFound).toBe(false);
    });

    it('should identify forbidden errors', () => {
      const error = new SlackApiError('Forbidden', 403);

      expect(error.isUnauthorized).toBe(false);
      expect(error.isForbidden).toBe(true);
      expect(error.isNotFound).toBe(false);
    });

    it('should identify not found errors', () => {
      const error = new SlackApiError('Not found', 404);

      expect(error.isUnauthorized).toBe(false);
      expect(error.isForbidden).toBe(false);
      expect(error.isNotFound).toBe(true);
    });
  });

  describe('constructor', () => {
    it('should use provided apiUrl', () => {
      const customClient = new SlackApiClient({
        sessionToken: 'token',
        tenantId: 'tenant',
        apiUrl: 'https://custom-api.example.com',
      });

      expect(customClient.getTenantId()).toBe('tenant');
    });
  });

  describe('listProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockResponse = {
        data: [
          {
            id: 'proj-1',
            name: 'Project 1',
            description: 'Test',
            tenantId: 'test-tenant',
            createdAt: '2026-01-25T00:00:00Z',
            updatedAt: '2026-01-25T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, pages: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.listProjects();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/manage/tenants/test-tenant/projects?page=1&limit=100',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-session-token',
          },
        })
      );
    });

    it('should support custom pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ data: [], pagination: {} }),
      });

      await client.listProjects({ page: 2, limit: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/manage/tenants/test-tenant/projects?page=2&limit=50',
        expect.anything()
      );
    });
  });

  describe('getProject', () => {
    it('should fetch a single project', async () => {
      const mockProject = {
        data: {
          id: 'proj-1',
          name: 'Project 1',
          description: null,
          tenantId: 'test-tenant',
          createdAt: '2026-01-25T00:00:00Z',
          updatedAt: '2026-01-25T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockProject),
      });

      const result = await client.getProject('proj-1');

      expect(result).toEqual(mockProject);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/manage/tenants/test-tenant/projects/proj-1',
        expect.anything()
      );
    });
  });

  describe('listAgents', () => {
    it('should fetch agents for a project', async () => {
      const mockResponse = {
        data: [
          {
            id: 'agent-1',
            name: 'Agent 1',
            description: null,
            projectId: 'proj-1',
            createdAt: '2026-01-25T00:00:00Z',
            updatedAt: '2026-01-25T00:00:00Z',
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, pages: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.listAgents('proj-1');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/manage/tenants/test-tenant/projects/proj-1/agents?page=1&limit=100',
        expect.anything()
      );
    });
  });

  describe('getAgent', () => {
    it('should fetch a single agent', async () => {
      const mockAgent = {
        data: {
          id: 'agent-1',
          name: 'Agent 1',
          description: null,
          projectId: 'proj-1',
          createdAt: '2026-01-25T00:00:00Z',
          updatedAt: '2026-01-25T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockAgent),
      });

      const result = await client.getAgent('proj-1', 'agent-1');

      expect(result).toEqual(mockAgent);
    });
  });

  describe('listAllAgents', () => {
    it('should list all agents across all projects', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [
              { id: 'proj-1', name: 'Project 1' },
              { id: 'proj-2', name: 'Project 2' },
            ],
            pagination: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [{ id: 'agent-1', name: 'Agent 1', projectId: 'proj-1' }],
            pagination: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [{ id: 'agent-2', name: 'Agent 2', projectId: 'proj-2' }],
            pagination: {},
          }),
        });

      const result = await client.listAllAgents();

      expect(result).toHaveLength(2);
      expect(result[0].projectName).toBe('Project 1');
      expect(result[1].projectName).toBe('Project 2');
    });

    it('should continue on project agent list failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [{ id: 'proj-1', name: 'Project 1' }],
            pagination: {},
          }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await client.listAllAgents();

      expect(result).toHaveLength(0);
    });
  });

  describe('findAgentByName', () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [{ id: 'proj-1', name: 'Project 1' }],
            pagination: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [
              { id: 'support-agent', name: 'Support Agent', projectId: 'proj-1' },
              { id: 'sales-agent', name: 'Sales Agent', projectId: 'proj-1' },
            ],
            pagination: {},
          }),
        });
    });

    it('should find agent by exact name match', async () => {
      const result = await client.findAgentByName('Support Agent');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Support Agent');
    });

    it('should find agent by case-insensitive name', async () => {
      const result = await client.findAgentByName('support agent');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Support Agent');
    });

    it('should find agent by id', async () => {
      const result = await client.findAgentByName('support-agent');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('support-agent');
    });

    it('should find agent by partial name match', async () => {
      const result = await client.findAgentByName('Support');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Support Agent');
    });

    it('should return null when no agent found', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ data: [], pagination: {} }),
      });

      const result = await client.findAgentByName('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('triggerAgent', () => {
    it('should trigger agent and return response', async () => {
      const mockChatResponse = {
        choices: [{ message: { content: 'Here is the answer to your question.' } }],
        conversationId: 'conv-123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockChatResponse),
      });

      const result = await client.triggerAgent({
        projectId: 'proj-1',
        agentId: 'agent-1',
        subAgentId: 'sub-agent-1',
        question: 'What is Inkeep?',
      });

      expect(result.content).toBe('Here is the answer to your question.');
      expect(result.conversationId).toBe('conv-123');
    });

    it('should include conversationId when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ content: 'Response' }),
      });

      await client.triggerAgent({
        projectId: 'proj-1',
        agentId: 'agent-1',
        subAgentId: 'sub-agent-1',
        question: 'Follow up question',
        conversationId: 'existing-conv-123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('existing-conv-123'),
        })
      );
    });

    it('should throw SlackApiError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValueOnce('Unauthorized'),
      });

      await expect(
        client.triggerAgent({
          projectId: 'proj-1',
          agentId: 'agent-1',
          subAgentId: 'sub-agent-1',
          question: 'Test',
        })
      ).rejects.toThrow('Session expired');
    });
  });

  describe('listApiKeys', () => {
    it('should list API keys for project', async () => {
      const mockResponse = {
        data: [
          {
            id: 'key-1',
            name: 'slack-integration',
            agentId: 'agent-1',
            keyPrefix: 'sk_',
            expiresAt: null,
            createdAt: '2026-01-25T00:00:00Z',
          },
        ],
        pagination: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.listApiKeys('proj-1', 'agent-1');

      expect(result.data).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('agentId=agent-1'),
        expect.anything()
      );
    });
  });

  describe('createApiKey', () => {
    it('should create a new API key', async () => {
      const mockResponse = {
        data: {
          apiKey: {
            id: 'key-1',
            name: 'slack-integration',
            agentId: 'agent-1',
            keyPrefix: 'sk_',
            expiresAt: null,
            createdAt: '2026-01-25T00:00:00Z',
          },
          key: 'sk_live_abcdefg123456',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await client.createApiKey('proj-1', 'agent-1', 'slack-integration');

      expect(result.data.key).toBe('sk_live_abcdefg123456');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ agentId: 'agent-1', name: 'slack-integration' }),
        })
      );
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await client.deleteApiKey('proj-1', 'key-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/manage/tenants/test-tenant/projects/proj-1/api-keys/key-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('getOrCreateAgentApiKey', () => {
    it('should delete existing slack key and create new one', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: [{ id: 'existing-key', name: 'slack-integration', agentId: 'agent-1' }],
            pagination: {},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: {
              apiKey: { id: 'new-key', name: 'slack-integration' },
              key: 'sk_new_key_123',
            },
          }),
        });

      const result = await client.getOrCreateAgentApiKey('proj-1', 'agent-1');

      expect(result).toBe('sk_new_key_123');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should create key when none exists', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({ data: [], pagination: {} }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValueOnce({
            data: {
              apiKey: { id: 'key-1', name: 'slack-integration' },
              key: 'sk_fresh_key_456',
            },
          }),
        });

      const result = await client.getOrCreateAgentApiKey('proj-1', 'agent-1');

      expect(result).toBe('sk_fresh_key_456');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should throw SlackApiError on 401 with session expired message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValueOnce('{"error":"unauthorized"}'),
      });

      await expect(client.listProjects()).rejects.toThrow('Session expired');
    });

    it('should throw SlackApiError instance on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValueOnce('{"error":"unauthorized"}'),
      });

      await expect(client.listProjects()).rejects.toThrow(SlackApiError);
    });

    it('should throw generic error for other status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValueOnce('Server error'),
      });

      await expect(client.listProjects()).rejects.toThrow('API error: 500');
    });
  });
});

describe('createSlackApiClient', () => {
  it('should create client from valid connection', () => {
    const connection = {
      inkeepSessionToken: 'valid-token',
      inkeepSessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      tenantId: 'test-tenant',
    };

    const client = createSlackApiClient(connection);

    expect(client).toBeInstanceOf(SlackApiClient);
    expect(client.getTenantId()).toBe('test-tenant');
  });

  it('should throw when no session token', () => {
    const connection = {
      tenantId: 'test-tenant',
    };

    expect(() => createSlackApiClient(connection)).toThrow('Session expired');
  });

  it('should throw when session token is expired', () => {
    const connection = {
      inkeepSessionToken: 'expired-token',
      inkeepSessionExpiresAt: new Date(Date.now() - 3600000).toISOString(),
      tenantId: 'test-tenant',
    };

    expect(() => createSlackApiClient(connection)).toThrow('Session expired');
  });

  it('should use default tenantId when not provided', () => {
    const connection = {
      inkeepSessionToken: 'valid-token',
    };

    const client = createSlackApiClient(connection);

    expect(client.getTenantId()).toBe('default');
  });
});

describe('sendDeferredResponse', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should send deferred response to response_url', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const responseUrl = 'https://hooks.slack.com/commands/T123/456/abc';
    const message = {
      text: 'Here is your response',
      response_type: 'ephemeral' as const,
    };

    await sendDeferredResponse(responseUrl, message);

    expect(mockFetch).toHaveBeenCalledWith(
      responseUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Here is your response'),
      })
    );
  });

  it('should include replace_original by default', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendDeferredResponse('https://hooks.slack.com/test', {
      text: 'Test',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.replace_original).toBe(true);
  });

  it('should handle blocks', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const message = {
      text: 'Fallback',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Test block' } }],
    };

    await sendDeferredResponse('https://hooks.slack.com/test', message);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.blocks).toBeDefined();
    expect(callBody.blocks).toHaveLength(1);
  });

  it('should not throw on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      sendDeferredResponse('https://hooks.slack.com/test', { text: 'Test' })
    ).resolves.not.toThrow();
  });

  it('should not throw on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValueOnce('Server error'),
    });

    await expect(
      sendDeferredResponse('https://hooks.slack.com/test', { text: 'Test' })
    ).resolves.not.toThrow();
  });
});
