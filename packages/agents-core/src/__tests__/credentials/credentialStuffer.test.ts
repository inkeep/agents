import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TemplateEngine } from '../../context/TemplateEngine';
import { CredentialStoreRegistry } from '../../credential-stores/CredentialStoreRegistry';
import {
  type CredentialContext,
  type CredentialStoreReference,
  CredentialStuffer,
} from '../../credential-stuffer/CredentialStuffer';
import {
  type CredentialStore,
  CredentialStoreType,
  MCPServerType,
  type MCPToolConfig,
  MCPTransportType,
} from '../../types/index';

// Mock logger from utils
vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock TemplateEngine
vi.mock('../../context/TemplateEngine.js', () => ({
  TemplateEngine: {
    render: vi.fn(),
  },
}));

// Mock ContextResolver - create interface implementation
const mockResolveHeaders = vi.fn();
const mockContextResolver = {
  resolveHeaders: mockResolveHeaders,
};

describe('CredentialStuffer', () => {
  let credentialStuffer: CredentialStuffer;
  let mockRegistry: CredentialStoreRegistry;
  let mockNangoStore: CredentialStore;
  let mockMemoryStore: CredentialStore;
  let mockTemplateRender: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get reference to mocked template render function
    mockTemplateRender = vi.mocked(TemplateEngine.render);

    // Mock credential stores with proper method implementations
    mockNangoStore = {
      id: 'nango-default',
      type: CredentialStoreType.nango,
      get: vi.fn().mockResolvedValue(null), // Default to null, override in tests
      set: vi.fn().mockResolvedValue(null),
      has: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(false),
      checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    };

    mockMemoryStore = {
      id: 'generic-store',
      type: CredentialStoreType.memory,
      get: vi.fn().mockResolvedValue(null), // Default to null, override in tests
      set: vi.fn().mockResolvedValue(null),
      has: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(false),
      checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    };

    // Create registry and add stores
    mockRegistry = new CredentialStoreRegistry();
    mockRegistry.add(mockNangoStore);
    mockRegistry.add(mockMemoryStore);

    credentialStuffer = new CredentialStuffer(mockRegistry, mockContextResolver);
  });

  describe('getCredentials', () => {
    const mockContext: CredentialContext = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
    };

    test('should return credentials from nango store', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      };

      const nangoStorePayload = {
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        secretKey: 'secret-key',
        provider: 'test',
        metadata: {},
      };

      vi.mocked(mockNangoStore.get).mockResolvedValue(JSON.stringify(nangoStorePayload));

      const result = await credentialStuffer.getCredentials(
        mockContext,
        storeReference,
        MCPServerType.nango
      );

      expect(result).toEqual({
        headers: {
          Authorization: 'Bearer secret-key',
          'provider-config-key': 'test-provider',
          'connection-id': 'test-connection',
        },
        metadata: {},
      });
      expect(mockNangoStore.get).toHaveBeenCalledWith(
        JSON.stringify({
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        })
      );
    });

    test('should return Authorization header from generic store payload', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {},
      };

      const mockCredentials = {
        apiKey: 'generic-api-key',
        endpoint: 'https://api.example.com',
      };

      vi.mocked(mockMemoryStore.get).mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await credentialStuffer.getCredentials(
        mockContext,
        storeReference,
        MCPServerType.generic
      );

      expect(result).toEqual({
        headers: {
          Authorization: `Bearer ${JSON.stringify(mockCredentials)}`,
        },
      });
      expect(mockMemoryStore.get).toHaveBeenCalledWith('test-tenant');
    });

    test('should return null when store not found', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'non-existent-store',
        retrievalParams: {},
      };

      const result = await credentialStuffer.getCredentials(
        mockContext,
        storeReference,
        MCPServerType.generic
      );

      expect(result).toBeNull();
    });

    test('should return null when credentials not found', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {},
      };

      vi.mocked(mockMemoryStore.get).mockResolvedValue(null);

      const result = await credentialStuffer.getCredentials(
        mockContext,
        storeReference,
        MCPServerType.generic
      );

      expect(result).toBeNull();
    });

    test('should use custom key from retrievalParams', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {
          key: 'custom-key-123',
        },
      };

      const mockCredentials = { token: 'custom-token' };
      vi.mocked(mockMemoryStore.get).mockResolvedValue(JSON.stringify(mockCredentials));

      await credentialStuffer.getCredentials(mockContext, storeReference, MCPServerType.generic);

      expect(mockMemoryStore.get).toHaveBeenCalledWith('custom-key-123');
    });
  });

  describe('getCredentialHeaders', () => {
    const mockContext: CredentialContext = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
    };

    test('should return headers from nango credentials', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      };

      const nangoStorePayload = {
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        secretKey: 'secret-key',
        provider: 'test',
        metadata: {},
      };

      vi.mocked(mockNangoStore.get).mockResolvedValue(JSON.stringify(nangoStorePayload));

      const result = await credentialStuffer.getCredentialHeaders({
        context: mockContext,
        mcpType: MCPServerType.nango,
        storeReference: storeReference,
      });

      expect(result).toEqual({
        Authorization: 'Bearer secret-key',
        'provider-config-key': 'test-provider',
        'connection-id': 'test-connection',
      });
    });

    test('should return Authorization header when generic credentials have no headers', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {},
      };

      const mockCredentials = {
        apiKey: 'test-key',
        // No headers property
      };

      vi.mocked(mockMemoryStore.get).mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await credentialStuffer.getCredentialHeaders({
        context: mockContext,
        mcpType: MCPServerType.generic,
        storeReference: storeReference,
      });

      expect(result).toEqual({
        Authorization: `Bearer ${JSON.stringify(mockCredentials)}`,
      });
    });

    test('should return empty object when credentials not found', async () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'non-existent-store',
        retrievalParams: {},
      };

      const result = await credentialStuffer.getCredentialHeaders({
        context: mockContext,
        mcpType: MCPServerType.generic,
        storeReference: storeReference,
      });

      expect(result).toEqual({});
    });
  });

  describe('buildMcpServerConfig', () => {
    const mockContext: CredentialContext = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
    };

    test('should build MCP server config with nango credentials', async () => {
      const toolConfig: MCPToolConfig = {
        id: 'test-tool-id',
        name: 'test-tool',
        description: 'Test tool',
        serverUrl: 'https://api.nango.dev/mcp',
        mcpType: MCPServerType.nango,
        transport: { type: MCPTransportType.sse },
        headers: {},
      };

      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      };

      const mockCredentials = {
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        secretKey: 'secret-key',
        provider: 'test',
      };

      vi.mocked(mockNangoStore.get).mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await credentialStuffer.buildMcpServerConfig(
        mockContext,
        toolConfig,
        storeReference
      );

      expect(result).toEqual({
        type: MCPTransportType.sse,
        url: 'https://api.nango.dev/mcp',
        headers: {
          Authorization: 'Bearer secret-key',
          'provider-config-key': 'test-provider',
          'connection-id': 'test-connection',
        },
      });
    });

    test('should build MCP server config without credentials', async () => {
      const toolConfig: MCPToolConfig = {
        id: 'test-tool-id',
        name: 'test-tool',
        description: 'Test tool',
        serverUrl: 'https://api.example.com/mcp',
        mcpType: MCPServerType.generic,
        transport: { type: MCPTransportType.streamableHttp },
        headers: { 'Custom-Header': 'custom-value' },
      };

      const result = await credentialStuffer.buildMcpServerConfig(
        mockContext,
        toolConfig,
        undefined
      );

      expect(result).toEqual({
        type: MCPTransportType.streamableHttp,
        url: 'https://api.example.com/mcp',
        headers: { 'Custom-Header': 'custom-value' },
      });
    });

    test('should merge tool headers with Authorization from generic credentials', async () => {
      const toolConfig: MCPToolConfig = {
        id: 'test-tool-id',
        name: 'test-tool',
        description: 'Test tool',
        serverUrl: 'https://api.example.com/mcp',
        mcpType: MCPServerType.generic,
        transport: { type: MCPTransportType.streamableHttp },
        headers: { 'Tool-Header': 'tool-value' },
      };

      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {},
      };

      const mockCredentials = {
        headers: {
          'Auth-Header': 'auth-value',
        },
      };

      vi.mocked(mockMemoryStore.get).mockResolvedValue(JSON.stringify(mockCredentials));

      const result = await credentialStuffer.buildMcpServerConfig(
        mockContext,
        toolConfig,
        storeReference
      );

      expect(result).toEqual({
        type: MCPTransportType.streamableHttp,
        url: 'https://api.example.com/mcp',
        headers: {
          'Tool-Header': 'tool-value',
          Authorization: `Bearer ${JSON.stringify(mockCredentials)}`,
        },
      });
    });
  });

  describe('generateCredentialKey', () => {
    const mockContext: CredentialContext = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
    };

    test('should use custom key when provided', () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'test-store',
        retrievalParams: {
          key: 'custom-key-override',
        },
      };

      const result = (credentialStuffer as any).generateCredentialKey(mockContext, storeReference);

      expect(result).toBe('custom-key-override');
    });

    test('should generate JSON key for nango store', () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'nango-default',
        retrievalParams: {
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        },
      };

      const result = (credentialStuffer as any).generateCredentialKey(
        mockContext,
        storeReference,
        CredentialStoreType.nango
      );

      expect(result).toBe(
        JSON.stringify({
          connectionId: 'test-connection',
          providerConfigKey: 'test-provider',
        })
      );
    });

    test('should use tenantId for generic stores', () => {
      const storeReference: CredentialStoreReference = {
        credentialStoreId: 'generic-store',
        retrievalParams: {},
      };

      const result = (credentialStuffer as any).generateCredentialKey(mockContext, storeReference);

      expect(result).toBe('test-tenant');
    });
  });

  describe('getCredentialsFromHeaders', () => {
    const mockContextWithIds: CredentialContext = {
      tenantId: 'test-tenant',
      contextConfigId: 'test-context-config',
      conversationId: 'test-conversation',
      projectId: 'test-project',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should resolve headers with template variables from request context', async () => {
      const headers = {
        Authorization: 'Bearer {{headers.authorization}}',
        'X-Custom-Header': '{{customField}}',
      };

      const mockContext = {
        headers: {
          authorization: 'secret-token-123',
        },
        customField: 'custom-value',
      };

      mockResolveHeaders.mockResolvedValue(mockContext);
      mockTemplateRender
        .mockReturnValueOnce('Bearer secret-token-123')
        .mockReturnValueOnce('custom-value');

      const result = await credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers);

      expect(mockResolveHeaders).toHaveBeenCalledWith('test-conversation', 'test-context-config');

      expect(mockTemplateRender).toHaveBeenCalledWith(
        'Bearer {{headers.authorization}}',
        mockContext,
        { strict: true }
      );

      expect(mockTemplateRender).toHaveBeenCalledWith(
        '{{customField}}',
        mockContext,
        { strict: true }
      );

      expect(result).toEqual({
        headers: {
          Authorization: 'Bearer secret-token-123',
          'X-Custom-Header': 'custom-value',
        },
        metadata: {},
      });
    });

    test('should return null when contextConfigId is missing', async () => {
      const contextWithoutConfigId: CredentialContext = {
        tenantId: 'test-tenant',
        conversationId: 'test-conversation',
        // contextConfigId is missing
        projectId: 'test-project',
      };

      const headers = {
        Authorization: 'Bearer {{headers.authorization}}',
      };

      const result = await credentialStuffer.getCredentialsFromHeaders(
        contextWithoutConfigId,
        headers
      );

      expect(result).toBeNull();
      expect(mockResolveHeaders).not.toHaveBeenCalled();
      expect(mockTemplateRender).not.toHaveBeenCalled();
    });

    test('should return null when conversationId is missing', async () => {
      const contextWithoutConversationId: CredentialContext = {
        tenantId: 'test-tenant',
        contextConfigId: 'test-context-config',
        // conversationId is missing
        projectId: 'test-project',
      };

      const headers = {
        Authorization: 'Bearer {{headers.authorization}}',
      };

      const result = await credentialStuffer.getCredentialsFromHeaders(
        contextWithoutConversationId,
        headers
      );

      expect(result).toBeNull();
      expect(mockResolveHeaders).not.toHaveBeenCalled();
      expect(mockTemplateRender).not.toHaveBeenCalled();
    });

    test('should handle empty headers object', async () => {
      const headers = {};

      const mockHeadersContext = {
        headers: {
          authorization: 'secret-token-123',
        },
      };

      mockResolveHeaders.mockResolvedValue(mockHeadersContext);

      const result = await credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers);

      expect(mockResolveHeaders).toHaveBeenCalledWith('test-conversation', 'test-context-config');

      expect(mockTemplateRender).not.toHaveBeenCalled();

      expect(result).toEqual({
        headers: {},
        metadata: {},
      });
    });

    test('should handle multiple template variables in single header value', async () => {
      const headers = {
        Authorization: 'Bearer {{token}} {{secret}}',
      };

      const mockContext = {
        token: 'token-123',
        secret: 'secret-456',
      };

      mockResolveHeaders.mockResolvedValue(mockContext);
      mockTemplateRender.mockReturnValue('Bearer token-123 secret-456');

      const result = await credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers);

      expect(mockTemplateRender).toHaveBeenCalledWith('Bearer {{token}} {{secret}}', mockContext, {
        strict: true,
      });

      expect(result).toEqual({
        headers: {
          Authorization: 'Bearer token-123 secret-456',
        },
        metadata: {},
      });
    });

    test('should handle headers without template variables', async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Static-Header': 'static-value',
      };

      const mockContext = {
        someField: 'some-value',
      };

      mockResolveHeaders.mockResolvedValue(mockContext);
      mockTemplateRender
        .mockReturnValueOnce('application/json')
        .mockReturnValueOnce('static-value');

      const result = await credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers);

      expect(mockTemplateRender).toHaveBeenCalledTimes(2);
      expect(mockTemplateRender).toHaveBeenCalledWith('application/json', mockContext, {
        strict: true,
      });
      expect(mockTemplateRender).toHaveBeenCalledWith('static-value', mockContext, {
        strict: true,
      });

      expect(result).toEqual({
        headers: {
          'Content-Type': 'application/json',
          'X-Static-Header': 'static-value',
        },
        metadata: {},
      });
    });

    test('should handle context resolver errors gracefully', async () => {
      const headers = {
        Authorization: 'Bearer {{headers.authorization}}',
      };

      mockResolveHeaders.mockRejectedValue(new Error('Context resolution failed'));

      await expect(
        credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers)
      ).rejects.toThrow('Context resolution failed');
    });

    test('should error on invalid variable path', async () => {
      const headers = {
        Authorization: 'Bearer {{headers.auth}}',
      };

      const mockContext = {
        headers: {
          authorization: 'secret-token-123',
        },
      };

      mockResolveHeaders.mockResolvedValue(mockContext);
      mockTemplateRender.mockImplementation(() => {
        throw new Error('Failed to resolve template variable');
      });

      await expect(
        credentialStuffer.getCredentialsFromHeaders(mockContextWithIds, headers)
      ).rejects.toThrow('Failed to resolve template variable');
    });
  });
});
