import { describe, expect, it } from 'vitest';
import { mcpServer } from '../../builderFunctions';
import type { MCPServerConfig } from '../../builders';

describe('mcpServer builder function', () => {
  it('should create an MCP server with basic config', () => {
    const config: MCPServerConfig = {
      name: 'Test MCP Server',
      description: 'Test MCP server',
      serverUrl: 'http://localhost:3000/mcp',
    };

    const server = mcpServer(config);

    expect(server.getName()).toBe('Test MCP Server');
    expect(server.getServerUrl()).toBe('http://localhost:3000/mcp');
    expect(server.getId()).toBe('test-mcp-server');
  });

  it('should throw error when serverUrl is missing', () => {
    const config = {
      name: 'No URL Server',
      description: 'Server without URL',
      // serverUrl is missing
    } as MCPServerConfig;

    expect(() => mcpServer(config)).toThrow();
  });

  it('should create an MCP server with full config', () => {
    const config: MCPServerConfig = {
      id: 'custom-mcp-server-id',
      name: 'Full Config MCP Server',
      description: 'MCP server with all options',
      serverUrl: 'https://api.example.com/mcp',
      transport: 'streamable_http',
      activeTools: ['tool1', 'tool2', 'tool3'],
      headers: {
        Authorization: 'Bearer token123',
        'X-API-Key': 'api-key-456',
      },
      imageUrl: 'https://example.com/server-icon.png',
    };

    const server = mcpServer(config);

    expect(server.getName()).toBe('Full Config MCP Server');
    expect(server.getId()).toBe('custom-mcp-server-id');
    expect(server.getServerUrl()).toBe('https://api.example.com/mcp');
    // Can set context after creation
    server.setContext('test-tenant', 'test-project');
    expect(server.config.transport).toEqual({ type: 'streamable_http' });
    expect(server.config.activeTools).toEqual(['tool1', 'tool2', 'tool3']);
    expect(server.config.headers).toEqual({
      Authorization: 'Bearer token123',
      'X-API-Key': 'api-key-456',
    });
    expect(server.config.imageUrl).toBe('https://example.com/server-icon.png');
  });

  it('should generate ID from name when not provided', () => {
    const config: MCPServerConfig = {
      name: 'Auto Generated ID Server',
      description: 'Server with auto-generated ID',
      serverUrl: 'http://localhost:3000/mcp',
    };

    const server = mcpServer(config);
    expect(server.getId()).toBe('auto-generated-id-server');
  });

  it('should handle credentials in config', () => {
    const testCredential = {
      id: 'test-credential',
      name: 'test-credential',
      credentialStoreId: 'test-store',
      type: 'memory' as const,
      value: 'token123',
    };

    const config: MCPServerConfig = {
      name: 'Authenticated Server',
      description: 'Server with credentials',
      serverUrl: 'https://secure.example.com/mcp',
      credential: testCredential,
    };

    const server = mcpServer(config);
    expect(server.config.credential).toEqual(testCredential);
  });

  it('should handle different transport types', () => {
    const httpConfig: MCPServerConfig = {
      name: 'HTTP Server',
      description: 'HTTP transport server',
      serverUrl: 'http://localhost:3000/mcp',
      transport: 'streamable_http',
    };

    const wsConfig: MCPServerConfig = {
      name: 'WebSocket Server',
      description: 'WebSocket transport server',
      serverUrl: 'ws://localhost:3001/mcp',
      transport: 'sse',
    };

    const httpServer = mcpServer(httpConfig);
    const wsServer = mcpServer(wsConfig);

    expect(httpServer.config.transport).toEqual({ type: 'streamable_http' });
    expect(wsServer.config.transport).toEqual({ type: 'sse' });
  });
});
