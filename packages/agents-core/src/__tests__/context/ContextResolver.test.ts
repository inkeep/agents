import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextResolver, MissingRequiredVariableError } from '../../context';
import type { DatabaseClient } from '../../db/client';
import { createTestDatabaseClient } from '../../db/test-client';
import type { ContextConfigSelect } from '../../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ContextResolver', () => {
  let dbClient: DatabaseClient;
  let resolver: ContextResolver;
  const tenantId = 'test-tenant';
  const projectId = 'test-project';

  beforeEach(async () => {
    dbClient = await createTestDatabaseClient();
    resolver = new ContextResolver(tenantId, projectId, dbClient);
    mockFetch.mockClear();
  });

  describe('skip behavior for missing required variables', () => {
    it('should mark context fetch as skipped (not errored) when required header variable is missing', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: {}, // No x-inkeep-conversation-id header
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should have 1 skipped definition
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].definitionId).toBe('conversation-history-fetch');
      expect(result.skipped[0].reason).toContain('Missing required variable');

      // Should NOT have any errors
      expect(result.errors).toHaveLength(0);

      // Fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should mark context fetch as skipped when required header resolves to empty string', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: { 'x-inkeep-conversation-id': '' }, // Empty header value
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should have 1 skipped definition
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].definitionId).toBe('conversation-history-fetch');

      // Should NOT have any errors
      expect(result.errors).toHaveLength(0);

      // Fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use default value for skipped context fetch when provided', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
            defaultValue: { messages: [] }, // Default value provided
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: {}, // No header
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should have 1 skipped definition
      expect(result.skipped).toHaveLength(1);

      // Should NOT have any errors
      expect(result.errors).toHaveLength(0);

      // Should have the default value in resolved context
      expect(result.resolvedContext.conversationHistory).toEqual({ messages: [] });
    });

    it('should proceed with fetch when required header variable is provided', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResponseData = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResponseData,
      });

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: { 'x-inkeep-conversation-id': 'existing-conv-123' }, // Header provided
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should NOT have any skipped definitions
      expect(result.skipped).toHaveLength(0);

      // Should NOT have any errors
      expect(result.errors).toHaveLength(0);

      // Should have fetched the data
      expect(result.fetchedDefinitions).toContain('conversation-history-fetch');

      // Should have the fetched data in resolved context
      expect(result.resolvedContext.conversationHistory).toEqual(mockResponseData);

      // Fetch should have been called with the correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/conversations/existing-conv-123',
        expect.any(Object)
      );
    });

    it('should still report actual fetch errors as errors, not skips', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock a failed HTTP response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: { 'x-inkeep-conversation-id': 'existing-conv-123' }, // Header provided
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should NOT have any skipped definitions (the fetch was attempted)
      expect(result.skipped).toHaveLength(0);

      // Should have 1 error
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].definitionId).toBe('conversation-history-fetch');
      expect(result.errors[0].error).toContain('HTTP 500');
    });

    it('should handle mixed skipped and successful fetches', async () => {
      const contextConfig: ContextConfigSelect = {
        id: 'test-context-config',
        tenantId,
        projectId,
        agentId: 'test-agent',
        name: 'Test Context Config',
        contextVariables: {
          conversationHistory: {
            id: 'conversation-history-fetch',
            name: 'Conversation History',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/conversations/{{headers.x-inkeep-conversation-id}}',
              method: 'GET',
              requiredToFetch: ['{{headers.x-inkeep-conversation-id}}'],
            },
          },
          userProfile: {
            id: 'user-profile-fetch',
            name: 'User Profile',
            trigger: 'initialization',
            fetchConfig: {
              url: 'https://api.example.com/users/default',
              method: 'GET',
              // No requiredToFetch - always fetches
            },
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUserProfile = { id: 'user-123', name: 'John' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockUserProfile,
      });

      const options = {
        triggerEvent: 'initialization' as const,
        conversationId: 'test-conversation',
        headers: {}, // No x-inkeep-conversation-id header - conversationHistory will be skipped
        tenantId,
      };

      const result = await resolver.resolve(contextConfig, options);

      // Should have 1 skipped definition (conversationHistory)
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].definitionId).toBe('conversation-history-fetch');

      // Should NOT have any errors
      expect(result.errors).toHaveLength(0);

      // Should have 1 fetched definition (userProfile)
      expect(result.fetchedDefinitions).toContain('user-profile-fetch');

      // userProfile should be in resolved context
      expect(result.resolvedContext.userProfile).toEqual(mockUserProfile);
    });
  });
});

