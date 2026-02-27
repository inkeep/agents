import { MCPServerType, MCPTransportType, McpClient } from '@inkeep/agents-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AgentMcpManager } from '../../../domains/run/agents/AgentMcpManager';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    McpClient: vi.fn(),
    configureComposioMCPServer: vi.fn(),
    isGithubWorkAppTool: vi.fn(() => false),
  };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    tool: vi.fn((config: any) => config),
  };
});

vi.mock('../../../domains/run/services/AgentSession', () => ({
  agentSessionManager: { recordEvent: vi.fn() },
}));

vi.mock('../../../domains/run/utils/tracer', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name: string, _opts: any, fn: any) => fn({ end: vi.fn() })),
  },
  setSpanWithError: vi.fn(),
}));

vi.mock('../../../env', () => ({
  env: { GITHUB_MCP_API_KEY: 'test-github-key' },
}));

let mockMcpClient: {
  connect: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
  tools: ReturnType<typeof vi.fn>;
  getInstructions: ReturnType<typeof vi.fn>;
};

function createMcpTool(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-tool-id',
    name: 'Test MCP Server',
    credentialReferenceId: undefined,
    credentialScope: 'project',
    headers: {},
    config: {
      type: 'mcp',
      mcp: {
        server: { url: 'https://test-server.example.com/mcp' },
        transport: undefined,
        activeTools: undefined,
        prompt: undefined,
        toolOverrides: undefined,
      },
    },
    ...overrides,
  };
}

function createManager(options: { credentialStuffer?: any } = {}): AgentMcpManager {
  const config = {
    id: 'sub-agent-1',
    agentId: 'parent-agent-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    name: 'Test Sub-Agent',
    userId: undefined,
    contextConfigId: undefined,
    forwardedHeaders: undefined,
  } as any;

  const executionContext = {
    project: {
      agents: {},
      credentialReferences: {},
    },
  } as any;

  return new AgentMcpManager(
    config,
    executionContext,
    options.credentialStuffer,
    () => 'conv-123',
    () => 'stream-123',
    () => undefined
  );
}

describe('AgentMcpManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMcpClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(false),
      tools: vi.fn().mockResolvedValue({}),
      getInstructions: vi.fn().mockReturnValue(undefined),
    };

    vi.mocked(McpClient).mockImplementation(() => mockMcpClient as any);
  });

  describe('serverInstructions precedence', () => {
    test('config.mcp.prompt takes precedence over client.getInstructions()', async () => {
      mockMcpClient.getInstructions.mockReturnValue('Server default instructions');

      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://test.example.com/mcp' },
            prompt: 'Config prompt takes precedence',
            toolOverrides: undefined,
          },
        },
      });

      const result = await createManager().getToolSet(mcpTool);

      expect(result.serverInstructions).toBe('Config prompt takes precedence');
    });

    test('falls back to client.getInstructions() when config.mcp.prompt is undefined', async () => {
      mockMcpClient.getInstructions.mockReturnValue('Server default instructions');

      const result = await createManager().getToolSet(createMcpTool());

      expect(result.serverInstructions).toBe('Server default instructions');
    });

    test('returns undefined when both config.mcp.prompt and getInstructions() are undefined', async () => {
      mockMcpClient.getInstructions.mockReturnValue(undefined);

      const result = await createManager().getToolSet(createMcpTool());

      expect(result.serverInstructions).toBeUndefined();
    });

    test('null config.mcp.prompt falls back to client.getInstructions() via nullish coalescing', async () => {
      mockMcpClient.getInstructions.mockReturnValue('Server default instructions');

      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://test.example.com/mcp' },
            prompt: null,
            toolOverrides: undefined,
          },
        },
      });

      const result = await createManager().getToolSet(mcpTool);

      expect(result.serverInstructions).toBe('Server default instructions');
    });
  });

  describe('createMcpConnection error handling', () => {
    test('wraps ECONNREFUSED with user-friendly message', async () => {
      const err = new Error('connect ECONNREFUSED');
      (err as any).cause = { code: 'ECONNREFUSED' };
      mockMcpClient.connect.mockRejectedValue(err);

      await expect(createManager().getToolSet(createMcpTool())).rejects.toThrow(
        'Connection refused. Please check if the MCP server is running.'
      );
    });

    test('wraps HTTP 404 with user-friendly message', async () => {
      mockMcpClient.connect.mockRejectedValue(new Error('Request failed with HTTP 404'));

      await expect(createManager().getToolSet(createMcpTool())).rejects.toThrow(
        'Error accessing endpoint (HTTP 404)'
      );
    });

    test('wraps generic errors with MCP server context', async () => {
      mockMcpClient.connect.mockRejectedValue(new Error('unexpected socket hang up'));

      await expect(createManager().getToolSet(createMcpTool())).rejects.toThrow(
        'MCP server connection failed: unexpected socket hang up'
      );
    });
  });

  describe('applyToolOverrides', () => {
    test('returns original tools unchanged when no toolOverrides configured', async () => {
      const originalTools = {
        search: { description: 'Search tool', execute: vi.fn() },
      };
      mockMcpClient.tools.mockResolvedValue(originalTools);

      const result = await createManager().getToolSet(createMcpTool());

      expect(result.tools).toBe(originalTools);
    });

    test('renames tool when displayName override is set', async () => {
      mockMcpClient.tools.mockResolvedValue({
        original_name: {
          description: 'Original tool',
          inputSchema: { properties: {}, required: [] },
          execute: vi.fn().mockResolvedValue('result'),
        },
      });

      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://test.example.com/mcp' },
            toolOverrides: {
              original_name: { displayName: 'renamed_tool' },
            },
          },
        },
      });

      const result = await createManager().getToolSet(mcpTool);

      expect(result.tools['renamed_tool']).toBeDefined();
      expect(result.tools['original_name']).toBeUndefined();
    });

    test('applies description override', async () => {
      mockMcpClient.tools.mockResolvedValue({
        search: {
          description: 'Original description',
          inputSchema: { properties: {}, required: [] },
          execute: vi.fn().mockResolvedValue('result'),
        },
      });

      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://test.example.com/mcp' },
            toolOverrides: {
              search: { description: 'Override description' },
            },
          },
        },
      });

      const result = await createManager().getToolSet(mcpTool);

      expect(result.tools['search']).toBeDefined();
      expect(result.tools['search'].description).toBe('Override description');
    });

    test('falls back to original tool when override processing fails', async () => {
      const originalTool = { description: 'Tool', execute: vi.fn() };
      mockMcpClient.tools.mockResolvedValue({ search: originalTool });

      const { tool: mockedTool } = await import('ai');
      vi.mocked(mockedTool).mockImplementationOnce(() => {
        throw new Error('Simulated tool() failure');
      });

      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://test.example.com/mcp' },
            toolOverrides: {
              search: { description: 'Override' },
            },
          },
        },
      });

      const result = await createManager().getToolSet(mcpTool);

      expect(result.tools['search']).toBe(originalTool);
    });
  });

  describe('convertToMCPToolConfig', () => {
    test('maps McpTool fields correctly and detects Nango URL', () => {
      const mcpTool = createMcpTool({
        id: 'nango-tool',
        name: 'Nango Tool',
        headers: { 'x-custom': 'value' },
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://api.nango.dev/mcp' },
            transport: { type: MCPTransportType.sse },
            activeTools: ['tool_a'],
            toolOverrides: { tool_a: { description: 'Override' } },
          },
        },
      });

      const result = (createManager() as any).convertToMCPToolConfig(mcpTool);

      expect(result).toMatchObject({
        id: 'nango-tool',
        name: 'Nango Tool',
        description: 'Nango Tool',
        serverUrl: 'https://api.nango.dev/mcp',
        activeTools: ['tool_a'],
        mcpType: MCPServerType.nango,
        transport: { type: MCPTransportType.sse },
        headers: { 'x-custom': 'value' },
      });
    });

    test('detects non-Nango URL as generic MCPServerType', () => {
      const mcpTool = createMcpTool({
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://mcp.example.com' },
            transport: { type: MCPTransportType.streamableHttp },
          },
        },
      });

      const result = (createManager() as any).convertToMCPToolConfig(mcpTool);

      expect(result.mcpType).toBe(MCPServerType.generic);
      expect(result.serverUrl).toBe('https://mcp.example.com');
    });
  });

  describe('credential stuffer integration', () => {
    function createCredentialedManager(
      credentialStuffer: any,
      credentialReferences: Record<string, any> = {}
    ) {
      return new AgentMcpManager(
        {
          id: 'sub-1',
          agentId: 'agent-1',
          tenantId: 'tenant-abc',
          projectId: 'project-xyz',
          name: 'Agent',
        } as any,
        { project: { agents: {}, credentialReferences } } as any,
        credentialStuffer,
        () => 'conv-1',
        () => 'stream-1',
        () => undefined
      );
    }

    test('passes tenantId, projectId, and storeReference to buildMcpServerConfig', async () => {
      const mockCredentialStuffer = {
        buildMcpServerConfig: vi.fn().mockResolvedValue({
          type: MCPTransportType.sse,
          url: 'https://api.nango.dev/mcp',
          headers: {},
        }),
      };

      const mcpTool = createMcpTool({
        id: 'cred-tool',
        name: 'Credentialed Tool',
        credentialReferenceId: 'cred-ref-1',
        config: {
          type: 'mcp',
          mcp: {
            server: { url: 'https://api.nango.dev/mcp' },
            transport: { type: MCPTransportType.sse },
          },
        },
      });

      const manager = new AgentMcpManager(
        {
          id: 'sub-1',
          agentId: 'agent-1',
          tenantId: 'tenant-abc',
          projectId: 'project-xyz',
          name: 'Agent',
        } as any,
        {
          project: {
            agents: {},
            credentialReferences: {
              'cred-ref-1': {
                credentialStoreId: 'store-1',
                retrievalParams: { connectionId: 'conn-1' },
              },
            },
          },
        } as any,
        mockCredentialStuffer as any,
        () => 'conv-1',
        () => 'stream-1',
        () => undefined
      );

      await manager.getToolSet(mcpTool);
      await createCredentialedManager(mockCredentialStuffer, {
        'cred-ref-1': { credentialStoreId: 'store-1', retrievalParams: { connectionId: 'conn-1' } },
      }).getToolSet(mcpTool);

      expect(mockCredentialStuffer.buildMcpServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-abc', projectId: 'project-xyz' }),
        expect.objectContaining({
          id: 'cred-tool',
          name: 'Credentialed Tool',
          mcpType: MCPServerType.nango,
        }),
        { credentialStoreId: 'store-1', retrievalParams: { connectionId: 'conn-1' } },
        undefined
      );
    });

    test('passes undefined storeReference when tool has no credentialReferenceId', async () => {
      const mockCredentialStuffer = {
        buildMcpServerConfig: vi.fn().mockResolvedValue({
          type: MCPTransportType.streamableHttp,
          url: 'https://mcp.example.com',
          headers: {},
        }),
      };

      await createCredentialedManager(mockCredentialStuffer).getToolSet(createMcpTool());

      expect(mockCredentialStuffer.buildMcpServerConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        undefined
      );
    });

    test('getToolSet returns tools, toolPolicies, mcpServerId, and mcpServerName', async () => {
      const mockTools = { search: { description: 'Search', execute: vi.fn() } };
      mockMcpClient.tools.mockResolvedValue(mockTools);

      const mcpTool = createMcpTool({ id: 'srv-id', name: 'My Server' });
      const result = await createManager().getToolSet(mcpTool);

      expect(result.mcpServerId).toBe('srv-id');
      expect(result.mcpServerName).toBe('My Server');
      expect(result.toolPolicies).toEqual({});
      expect(result.tools).toBe(mockTools);
    });
  });
});
