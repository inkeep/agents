import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tool } from '../../tool';
import type { ToolConfig } from '../../types';

// Mock dependencies
vi.mock('@inkeep/agents-core', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe.skip('Tool Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful API responses by default
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, id: 'tool-123' }),
      text: () => Promise.resolve('Success'),
    } as Response);
  });

  describe('Tool Constructor', () => {
    it('should create MCP tool with basic config', () => {
      const config: ToolConfig = {
        name: 'Test MCP Tool',
        type: 'mcp',
        command: ['node', 'test-server.js'],
        tenantId: 'test-tenant',
      };

      const tool = new Tool(config);

      expect(tool.getName()).toBe('Test MCP Tool');
      expect(tool.getType()).toBe('mcp');
      expect(tool.getId()).toBe('test-mcp-tool');
    });

    it('should create hosted tool', () => {
      const config: ToolConfig = {
        name: 'Hosted API Tool',
        type: 'hosted',
        url: 'https://api.example.com',
        tenantId: 'test-tenant',
      };

      const tool = new Tool(config);

      expect(tool.getName()).toBe('Hosted API Tool');
      expect(tool.getType()).toBe('hosted');
    });

    it('should generate ID from name', () => {
      const tool = new Tool({
        name: 'Complex Tool Name With Spaces',
        type: 'mcp',
        command: ['test'],
        tenantId: 'test-tenant',
      });

      expect(tool.getId()).toBe('complex-tool-name-with-spaces');
    });

    it('should handle tool with environment variables', () => {
      const config: ToolConfig = {
        name: 'Environment Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        env: {
          API_KEY: 'secret-key',
          DEBUG: 'true',
        },
        tenantId: 'test-tenant',
      };

      const tool = new Tool(config);

      expect(tool.config.env).toEqual({
        API_KEY: 'secret-key',
        DEBUG: 'true',
      });
    });

    it('should handle tool with arguments', () => {
      const config: ToolConfig = {
        name: 'Args Tool',
        type: 'mcp',
        command: ['python', 'tool.py'],
        args: ['--verbose', '--config', 'config.json'],
        tenantId: 'test-tenant',
      };

      const tool = new Tool(config);

      expect(tool.config.args).toEqual(['--verbose', '--config', 'config.json']);
    });
  });

  describe('Tool Initialization', () => {
    let tool: Tool;

    beforeEach(() => {
      tool = new Tool({
        name: 'Test Tool',
        type: 'mcp',
        command: ['node', 'server.js'],
        tenantId: 'test-tenant',
        description: 'A test tool',
        capabilities: ['read', 'write'],
      });
    });

    it('should initialize and create backend entity', async () => {
      await tool.init();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tenants/test-tenant/crud/tools/test-tool'),
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"name":"Test Tool"'),
        })
      );
    });

    it('should not reinitialize if already initialized', async () => {
      await tool.init();
      vi.clearAllMocks();

      await tool.init(); // Second call

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      } as Response);

      await expect(tool.init()).rejects.toThrow('Failed to update tool: 500');
    });

    it('should include required fields in API call', async () => {
      await tool.init();

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);

      expect(requestBody).toMatchObject({
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        config: {
          type: 'mcp',
          mcp: {
            server: {},
          },
        },
      });
    });
  });

  describe('Tool Types', () => {
    it('should handle MCP stdio transport', () => {
      const tool = new Tool({
        name: 'Stdio Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        transport: 'stdio',
        tenantId: 'test-tenant',
      });

      expect(tool.config.transport).toBe('stdio');
    });

    it('should handle MCP SSE transport', () => {
      const tool = new Tool({
        name: 'SSE Tool',
        type: 'mcp',
        url: 'https://mcp.example.com/sse',
        transport: 'sse',
        tenantId: 'test-tenant',
      });

      expect(tool.config.transport).toBe('sse');
      expect(tool.config.url).toBe('https://mcp.example.com/sse');
    });

    it('should handle hosted tool with authentication', () => {
      const tool = new Tool({
        name: 'Auth Tool',
        type: 'hosted',
        url: 'https://api.example.com',
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        tenantId: 'test-tenant',
      });

      expect(tool.config.headers).toEqual({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      });
    });
  });

  describe('Tool Lifecycle Management', () => {
    let tool: Tool;

    beforeEach(async () => {
      tool = new Tool({
        name: 'Lifecycle Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        tenantId: 'test-tenant',
      });
      await tool.init();
    });

    it('should start tool process', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'started' }),
      } as Response);

      const result = await tool.start();

      expect(result).toEqual({ status: 'started' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tools\/.*\/start$/),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should stop tool process', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'stopped' }),
      } as Response);

      const result = await tool.stop();

      expect(result).toEqual({ status: 'stopped' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tools\/.*\/stop$/),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should check tool health', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            healthy: true,
            lastCheck: '2024-01-01T00:00:00Z',
          }),
      } as Response);

      const result = await tool.healthCheck();

      expect(result).toEqual({
        healthy: true,
        lastCheck: '2024-01-01T00:00:00Z',
      });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tools\/.*\/health$/),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should restart tool', async () => {
      const stopSpy = vi.spyOn(tool, 'stop').mockResolvedValue({ status: 'stopped' });
      const startSpy = vi.spyOn(tool, 'start').mockResolvedValue({ status: 'started' });

      const result = await tool.restart();

      expect(stopSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
      expect(result).toEqual({ status: 'restarted' });
    });

    it('should handle lifecycle operation errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
      } as Response);

      await expect(tool.start()).rejects.toThrow('Failed to start tool: 500 Internal Error');
    });
  });

  describe('Tool Discovery', () => {
    let tool: Tool;

    beforeEach(async () => {
      tool = new Tool({
        name: 'Discovery Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        tenantId: 'test-tenant',
      });
      await tool.init();
    });

    it('should discover available tools from MCP server', async () => {
      const mockTools = [
        {
          name: 'file_read',
          description: 'Read file contents',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
        {
          name: 'file_write',
          description: 'Write file contents',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: mockTools }),
      } as Response);

      const result = await tool.discoverTools();

      expect(result.tools).toEqual(mockTools);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tools\/.*\/discover$/),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle discovery errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(tool.discoverTools()).rejects.toThrow('Failed to discover tools: 404 Not Found');
    });
  });

  describe('Tool Configuration Validation', () => {
    it('should require name', () => {
      expect(
        () =>
          new Tool({
            type: 'mcp',
            command: ['node', 'tool.js'],
            tenantId: 'test-tenant',
          } as any)
      ).toThrow();
    });

    it('should require type', () => {
      expect(
        () =>
          new Tool({
            name: 'Test Tool',
            command: ['node', 'tool.js'],
            tenantId: 'test-tenant',
          } as any)
      ).toThrow();
    });

    it('should require command for MCP tools', () => {
      expect(
        () =>
          new Tool({
            name: 'MCP Tool',
            type: 'mcp',
            tenantId: 'test-tenant',
          } as any)
      ).toThrow();
    });

    it('should require URL for hosted tools', () => {
      expect(
        () =>
          new Tool({
            name: 'Hosted Tool',
            type: 'hosted',
            tenantId: 'test-tenant',
          } as any)
      ).toThrow();
    });

    it('should validate transport types', () => {
      const validTransports: Array<'stdio' | 'sse' | 'http'> = ['stdio', 'sse', 'http'];

      validTransports.forEach((transport) => {
        const tool = new Tool({
          name: `${transport} Tool`,
          type: 'mcp',
          command: ['node', 'tool.js'],
          transport,
          tenantId: 'test-tenant',
        });

        expect(tool.config.transport).toBe(transport);
      });
    });
  });

  describe('Error Handling', () => {
    let tool: Tool;

    beforeEach(async () => {
      tool = new Tool({
        name: 'Error Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        tenantId: 'test-tenant',
      });
      await tool.init();
    });

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      await expect(tool.healthCheck()).rejects.toThrow('Network error');
    });

    it('should handle invalid JSON responses', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      } as Response);

      await expect(tool.discoverTools()).rejects.toThrow('Invalid JSON');
    });

    it('should handle timeout errors', async () => {
      vi.mocked(fetch).mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      await expect(tool.start()).rejects.toThrow('Timeout');
    });
  });

  describe('Tool Metadata', () => {
    it('should store and retrieve metadata', async () => {
      const tool = new Tool({
        name: 'Metadata Tool',
        type: 'mcp',
        command: ['node', 'tool.js'],
        tenantId: 'test-tenant',
        metadata: {
          version: '1.0.0',
          author: 'Test Author',
          tags: ['utility', 'filesystem'],
        },
      });

      expect(tool.config.metadata).toEqual({
        version: '1.0.0',
        author: 'Test Author',
        tags: ['utility', 'filesystem'],
      });
    });

    it('should handle tool with credentials reference', () => {
      const tool = new Tool({
        name: 'Credentialed Tool',
        type: 'hosted',
        url: 'https://api.example.com',
        credentialReferenceId: 'cred-123',
        tenantId: 'test-tenant',
      });

      expect(tool.config.credentialReferenceId).toBe('cred-123');
    });
  });
});
