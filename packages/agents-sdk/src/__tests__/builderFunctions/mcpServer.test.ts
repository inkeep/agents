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
      tenantId: 'test-tenant',
      transport: 'websocket',
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
    expect(server.config.tenantId).toBe('test-tenant');
    expect(server.config.transport).toEqual({ type: 'websocket' });
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
      type: 'bearer',
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
      transport: 'http',
    };

    const wsConfig: MCPServerConfig = {
      name: 'WebSocket Server',
      description: 'WebSocket transport server',
      serverUrl: 'ws://localhost:3001/mcp',
      transport: 'websocket',
    };

    const httpServer = mcpServer(httpConfig);
    const wsServer = mcpServer(wsConfig);

    expect(httpServer.config.transport).toEqual({ type: 'http' });
    expect(wsServer.config.transport).toEqual({ type: 'websocket' });
  });

  describe('imageUrl handling', () => {
    it('should accept and store URL-based imageUrl', () => {
      const config: MCPServerConfig = {
        name: 'Weather Service',
        description: 'Weather information service',
        serverUrl: 'https://weather.example.com/mcp',
        imageUrl: 'https://i.pinimg.com/originals/d5/3b/01/d53b014d86a6b6761bf649a0ed813c2b.png',
      };

      const server = mcpServer(config);
      expect(server.config.imageUrl).toBe('https://i.pinimg.com/originals/d5/3b/01/d53b014d86a6b6761bf649a0ed813c2b.png');
    });

    it('should accept and store base64 data URL imageUrl', () => {
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const config: MCPServerConfig = {
        name: 'Custom Icon Server',
        description: 'Server with base64 icon',
        serverUrl: 'https://api.example.com/mcp',
        imageUrl: base64Image,
      };

      const server = mcpServer(config);
      expect(server.config.imageUrl).toBe(base64Image);
    });

    it('should handle servers without imageUrl', () => {
      const config: MCPServerConfig = {
        name: 'No Icon Server',
        description: 'Server without custom icon',
        serverUrl: 'https://api.example.com/mcp',
      };

      const server = mcpServer(config);
      expect(server.config.imageUrl).toBeUndefined();
    });

    it('should preserve imageUrl when combined with other optional fields', () => {
      const config: MCPServerConfig = {
        name: 'Complete Server',
        description: 'Server with all optional fields',
        serverUrl: 'https://api.example.com/mcp',
        imageUrl: 'https://example.com/icon.svg',
        headers: { 'X-Custom': 'header' },
        activeTools: ['tool1'],
        transport: 'http',
      };

      const server = mcpServer(config);
      expect(server.config.imageUrl).toBe('https://example.com/icon.svg');
      expect(server.config.headers).toEqual({ 'X-Custom': 'header' });
      expect(server.config.activeTools).toEqual(['tool1']);
    });

    it('should handle various image URL formats', () => {
      const formats = [
        'https://example.com/icon.png',
        'https://example.com/icon.jpg',
        'https://example.com/icon.svg',
        'https://example.com/icon.gif',
        'https://example.com/icon.webp',
        'http://localhost:3000/static/icon.png',
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
      ];

      formats.forEach((imageUrl) => {
        const config: MCPServerConfig = {
          name: `Server with ${imageUrl.substring(0, 20)}`,
          description: 'Testing various image formats',
          serverUrl: 'https://api.example.com/mcp',
          imageUrl,
        };

        const server = mcpServer(config);
        expect(server.config.imageUrl).toBe(imageUrl);
      });
    });
  });
});
