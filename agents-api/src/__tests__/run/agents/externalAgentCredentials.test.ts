// Functions now imported from @inkeep/agents-core and mocked above
import { CredentialStuffer } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the ai package's tool function - must be before imports
vi.mock('ai', () => ({
  tool: (config: any) => ({
    ...config,
    execute: config.execute,
  }),
}));

import { A2AClient } from '../../../domains/run/a2a/client';
import { createDelegateToAgentTool } from '../../../domains/run/agents/relationTools';
import { saveA2AMessageResponse } from '../../../domains/run/data/conversations';

const {
  createMessageMock,
  getCredentialReferenceMock,
  createCredentialReferenceMock,
  getExternalAgentMock,
  getCredentialHeadersSpy,
  CredentialStufferMockClass,
} = vi.hoisted(() => {
  const createMessageMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' }));
  const getCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  const createCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'cred-123' }));
  const getExternalAgentMock = vi.fn(() => vi.fn().mockResolvedValue(null));

  // Create spy functions
  const getCredentialHeadersSpy = vi.fn().mockResolvedValue({});
  const stuffSpy = vi.fn().mockResolvedValue({});

  // Create a mock class that returns an instance with spied methods
  const CredentialStufferMockClass = vi.fn().mockImplementation(() => ({
    stuff: stuffSpy,
    getCredentialHeaders: getCredentialHeadersSpy,
  }));

  return {
    createMessageMock,
    getCredentialReferenceMock,
    createCredentialReferenceMock,
    getExternalAgentMock,
    getCredentialHeadersSpy,
    CredentialStufferMockClass,
  };
});

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createMessage: createMessageMock,
    getCredentialReference: getCredentialReferenceMock,
    createCredentialReference: createCredentialReferenceMock,
    getExternalAgent: getExternalAgentMock,
    contextValidationMiddleware: vi.fn().mockReturnValue(async (c: any, next: any) => {
      c.set('validatedContext', {
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        projectId: 'default',
      });
      await next();
    }),
    createDatabaseClient: vi.fn().mockReturnValue({}),
    CredentialStuffer: CredentialStufferMockClass,
    ContextResolver: vi.fn().mockImplementation(() => ({})), // Mock ContextResolver as well
  };
});

vi.mock('../../../data/db/runDbClient.js', () => ({
  default: {},
}));

vi.mock('../../../domains/run/a2a/client');
vi.mock('../../../domains/run/data/conversations');

describe('External Agent Credential Handling', () => {
  const mockTenantId = 'test-tenant';
  const mockAgentId = 'external-agent-1';
  const mockContextId = 'test-context';
  const mockProjectId = 'test-project';

  // Create mock credential store registry
  const mockCredentialStoreRegistry = {
    get: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    has: vi.fn(),
    getAll: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database operations
    vi.mocked(saveA2AMessageResponse).mockResolvedValue({} as any);
  });

  describe('createDelegateToAgentTool with credentials', () => {
    it.skip('should resolve static headers for external agents', async () => {
      const mockHeaders = {
        Authorization: 'Bearer static-token',
        'X-Custom-Header': 'custom-value',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: mockHeaders,
        credentialReferenceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Update the spy to return the expected headers for this test
      getCredentialHeadersSpy.mockResolvedValueOnce(mockHeaders);

      const mockExecutionContext = {
        apiKey: 'test-api-key',
        apiKeyId: 'test-api-key-id',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        agentId: 'caller-agent',
        baseUrl: 'http://localhost:3000',
        resolvedRef: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
        project: {
          id: mockProjectId,
          tenantId: mockTenantId,
          name: 'Test Project',
          description: null,
          models: null,
          stopWhen: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          agents: {},
          tools: {},
          functionTools: {},
          functions: {},
          dataComponents: {},
          artifactComponents: {},
          externalAgents: {},
          credentialReferences: {},
          statusUpdates: null,
        },
      };

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            relationId: 'test-relation-id',
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
            ref: { name: 'main', type: 'branch', hash: 'test-hash' },
            credentialReferenceId: null,
            headers: mockHeaders,
            relationType: 'delegate',
          },
        },
        callingAgentId: 'caller-agent',
        executionContext: mockExecutionContext,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        sessionId: 'session-123',
        subAgent: {
          getStreamingHelper: () => null,
        },
        credentialStoreRegistry: mockCredentialStoreRegistry,
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((_url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await (delegateTool as any).execute({ message: 'Test delegation' }, undefined);

      // The important thing is that the correct headers were passed to A2AClient
      expect(capturedHeaders).toEqual(mockHeaders);
      expect(vi.mocked(A2AClient)).toHaveBeenCalledWith(
        'https://external-agent.example.com',
        expect.objectContaining({
          headers: mockHeaders,
        })
      );
    });

    it.skip('should resolve credential references for external agents', async () => {
      const mockCredentialReferenceId = 'cred-ref-123';
      const resolvedHeaders = {
        Authorization: 'Bearer resolved-token',
        'X-API-Key': 'resolved-api-key',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: null,
        credentialReferenceId: mockCredentialReferenceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Mock getCredentialReference to return the expected credential reference
      getCredentialReferenceMock.mockReturnValue(
        vi.fn().mockResolvedValue({
          id: mockCredentialReferenceId,
          tenantId: mockTenantId,
          projectId: mockProjectId,
          type: 'test-type',
          credentialStoreId: mockCredentialReferenceId,
          retrievalParams: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      // Update the spy to return the resolved headers for this test
      getCredentialHeadersSpy.mockResolvedValueOnce(resolvedHeaders);

      const mockExecutionContext = {
        apiKey: 'test-api-key',
        apiKeyId: 'test-api-key-id',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        agentId: 'caller-agent',
        baseUrl: 'http://localhost:3000',
        resolvedRef: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
        project: {
          id: mockProjectId,
          tenantId: mockTenantId,
          name: 'Test Project',
          description: null,
          models: null,
          stopWhen: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          agents: {},
          tools: {},
          functionTools: {},
          functions: {},
          dataComponents: {},
          artifactComponents: {},
          externalAgents: {},
          credentialReferences: {},
          statusUpdates: null,
        },
      };

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            relationId: 'test-relation-id',
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
            ref: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
            credentialReferenceId: mockCredentialReferenceId,
            headers: null,
            relationType: 'delegate',
          },
        },
        callingAgentId: 'caller-agent',
        executionContext: mockExecutionContext,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        sessionId: 'session-123',
        subAgent: {
          getStreamingHelper: () => null,
        },
        credentialStoreRegistry: mockCredentialStoreRegistry,
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((_url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await (delegateTool as any).execute({ message: 'Test delegation' }, undefined);

      // Verify resolved headers were passed to A2AClient
      expect(capturedHeaders).toEqual(resolvedHeaders);
    });

    it.skip('should combine static headers and credential references', async () => {
      const mockStaticHeaders = {
        'X-Custom-Header': 'static-value',
      };
      const mockCredentialReferenceId = 'cred-ref-123';
      const resolvedHeaders = {
        Authorization: 'Bearer resolved-token',
        'X-Custom-Header': 'static-value', // Should preserve static headers
        'X-API-Key': 'resolved-api-key',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: mockStaticHeaders,
        credentialReferenceId: mockCredentialReferenceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Update the spy to return the combined headers for this test
      getCredentialHeadersSpy.mockResolvedValueOnce(resolvedHeaders);

      const mockExecutionContext = {
        apiKey: 'test-api-key',
        apiKeyId: 'test-api-key-id',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        agentId: 'caller-agent',
        baseUrl: 'http://localhost:3000',
        resolvedRef: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
        project: {
          id: mockProjectId,
          tenantId: mockTenantId,
          name: 'Test Project',
          description: null,
          models: null,
          stopWhen: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          agents: {},
          tools: {},
          functionTools: {},
          functions: {},
          dataComponents: {},
          artifactComponents: {},
          externalAgents: {},
          credentialReferences: {},
          statusUpdates: null,
        },
      };

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            relationId: 'test-relation-id',
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
            ref: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
            credentialReferenceId: mockCredentialReferenceId,
            headers: mockStaticHeaders,
            relationType: 'delegate',
          },
        },
        callingAgentId: 'caller-agent',
        executionContext: mockExecutionContext,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        sessionId: 'session-123',
        subAgent: {
          getStreamingHelper: () => null,
        },
        credentialStoreRegistry: mockCredentialStoreRegistry,
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((_url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await (delegateTool as any).execute({ message: 'Test delegation' }, undefined);

      // Verify combined headers were passed to A2AClient
      expect(capturedHeaders).toEqual(resolvedHeaders);
    });

    it.skip('should handle external agents without credentials', async () => {
      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: null,
        credentialReferenceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      const mockExecutionContext = {
        apiKey: 'test-api-key',
        apiKeyId: 'test-api-key-id',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        agentId: 'caller-agent',
        baseUrl: 'http://localhost:3000',
        resolvedRef: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
        project: {
          id: mockProjectId,
          tenantId: mockTenantId,
          name: 'Test Project',
          description: null,
          models: null,
          stopWhen: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          agents: {},
          tools: {},
          functionTools: {},
          functions: {},
          dataComponents: {},
          artifactComponents: {},
          externalAgents: {},
          credentialReferences: {},
          statusUpdates: null,
        },
      };

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            relationId: 'test-relation-id',
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
            ref: { name: 'main', type: 'branch' as const, hash: 'test-hash' },
            credentialReferenceId: null,
            headers: null,
            relationType: 'delegate',
          },
        },
        callingAgentId: 'caller-agent',
        executionContext: mockExecutionContext,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        sessionId: 'session-123',
        subAgent: {
          getStreamingHelper: () => null,
        },
        credentialStoreRegistry: mockCredentialStoreRegistry,
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((_url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await (delegateTool as any).execute({ message: 'Test delegation' }, undefined);

      // Verify no headers were passed to A2AClient
      expect(capturedHeaders).toEqual({});
      expect(vi.mocked(CredentialStuffer)).not.toHaveBeenCalled();
    });
  });

  describe('A2AClient with headers', () => {
    it('should pass headers to constructor options', () => {
      const mockHeaders = {
        Authorization: 'Bearer test-token',
        'X-Custom-Header': 'custom-value',
      };

      // Since A2AClient is mocked, we just verify it's called with correct options
      const _client = new A2AClient('https://external-agent.example.com', {
        headers: mockHeaders,
      });

      expect(A2AClient).toHaveBeenCalledWith(
        'https://external-agent.example.com',
        expect.objectContaining({
          headers: mockHeaders,
        })
      );
    });
  });
});
