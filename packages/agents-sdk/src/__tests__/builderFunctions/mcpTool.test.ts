import type { MCPToolConfig } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import { mcpTool } from '../../builderFunctions';

describe('mcpTool builder function', () => {
  it('should create an MCP tool with basic config', () => {
    const config: MCPToolConfig = {
      name: 'Test MCP Tool',
      description: 'Test MCP tool',
      serverUrl: 'http://localhost:3000/mcp',
    };

    const tool = mcpTool(config);

    expect(tool.getName()).toBe('Test MCP Tool');
    expect(tool.getServerUrl()).toBe('http://localhost:3000/mcp');
    expect(tool.getId()).toBe('test-mcp-tool');
  });

  it('should create an MCP tool with full config', () => {
    const config: MCPToolConfig = {
      id: 'custom-tool-id',
      name: 'Full Config MCP Tool',
      description: 'MCP tool with all options',
      serverUrl: 'https://api.example.com/tools',
      tenantId: 'test-tenant',
      activeTools: ['search', 'fetch'],
      transport: {
        type: 'streamable_http',
      },
    };

    const tool = mcpTool(config);

    expect(tool.getName()).toBe('Full Config MCP Tool');
    expect(tool.getId()).toBe('custom-tool-id');
    expect(tool.getServerUrl()).toBe('https://api.example.com/tools');
    expect(tool.config.tenantId).toBe('test-tenant');
    expect(tool.config.activeTools).toEqual(['search', 'fetch']);
    expect(tool.config.transport).toEqual({
      type: 'streamable_http',
    });
  });

  it('should generate ID from name when not provided', () => {
    const config: MCPToolConfig = {
      name: 'Auto Generated ID Tool',
      description: 'Tool with auto-generated ID',
      serverUrl: 'http://localhost:3000/tools',
    };

    const tool = mcpTool(config);
    expect(tool.getId()).toBe('auto-generated-id-tool');
  });

  it('should handle complex transport configurations', () => {
    const config: MCPToolConfig = {
      name: 'Complex Transport Tool',
      description: 'Tool with complex transport config',
      serverUrl: 'http://localhost:3000/complex-tool',
      transport: {
        type: 'sse',
      },
      activeTools: ['tool1', 'tool2', 'tool3'],
    };

    const tool = mcpTool(config);
    expect(tool.config.transport).toEqual(config.transport);
    expect(tool.config.activeTools).toEqual(config.activeTools);
  });

  it('should handle tools without optional fields', () => {
    const config: MCPToolConfig = {
      name: 'Simple Tool',
      description: 'Tool without optional fields',
      serverUrl: 'http://localhost:3000/simple',
    };

    const tool = mcpTool(config);
    expect(tool.config.activeTools).toBeUndefined();
    expect(tool.config.transport).toBeUndefined();
  });

  describe('imageUrl handling', () => {
    it('should accept and store URL-based imageUrl', () => {
      const config: MCPToolConfig = {
        id: 'weather-tool',
        name: 'Weather Tool',
        description: 'Get weather information',
        serverUrl: 'https://api.weather.com/mcp',
        imageUrl: 'https://i.pinimg.com/originals/d5/3b/01/d53b014d86a6b6761bf649a0ed813c2b.png',
      };

      const tool = mcpTool(config);
      expect(tool.config.imageUrl).toBe('https://i.pinimg.com/originals/d5/3b/01/d53b014d86a6b6761bf649a0ed813c2b.png');
    });

    it('should accept and store base64 data URL imageUrl', () => {
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const config: MCPToolConfig = {
        name: 'Base64 Icon Tool',
        description: 'Tool with base64 encoded icon',
        serverUrl: 'https://api.example.com/mcp',
        imageUrl: base64Image,
      };

      const tool = mcpTool(config);
      expect(tool.config.imageUrl).toBe(base64Image);
    });

    it('should handle tools without imageUrl', () => {
      const config: MCPToolConfig = {
        name: 'No Icon Tool',
        description: 'Tool without custom icon',
        serverUrl: 'https://api.example.com/mcp',
      };

      const tool = mcpTool(config);
      expect(tool.config.imageUrl).toBeUndefined();
    });

    it('should preserve imageUrl with all other config options', () => {
      const config: MCPToolConfig = {
        id: 'full-featured-tool',
        name: 'Full Featured Tool',
        description: 'Tool with all configuration options',
        serverUrl: 'https://api.example.com/mcp',
        imageUrl: 'https://cdn.example.com/icons/tool.svg',
        tenantId: 'test-tenant',
        projectId: 'test-project',
        activeTools: ['search', 'fetch', 'analyze'],
        headers: {
          'X-API-Version': '2.0',
          'User-Agent': 'Inkeep/1.0',
        },
        transport: {
          type: 'streamable_http',
        },
        credential: {
          id: 'api-key-cred',
          type: 'memory',
          credentialStoreId: 'memory-default',
          retrievalParams: {
            key: 'API_KEY',
          },
        },
      };

      const tool = mcpTool(config);
      expect(tool.config.imageUrl).toBe('https://cdn.example.com/icons/tool.svg');
      expect(tool.config.headers).toEqual({
        'X-API-Version': '2.0',
        'User-Agent': 'Inkeep/1.0',
      });
      expect(tool.config.activeTools).toEqual(['search', 'fetch', 'analyze']);
      expect(tool.config.credential).toEqual({
        id: 'api-key-cred',
        type: 'memory',
        credentialStoreId: 'memory-default',
        retrievalParams: {
          key: 'API_KEY',
        },
      });
    });

    it('should handle various image formats and protocols', () => {
      const imageUrls = [
        'https://example.com/icon.png',
        'https://example.com/icon.jpg',
        'https://example.com/icon.jpeg',
        'https://example.com/icon.gif',
        'https://example.com/icon.svg',
        'https://example.com/icon.webp',
        'https://example.com/icon.ico',
        'http://localhost:3000/static/icon.png',
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAE=',
      ];

      imageUrls.forEach((imageUrl, index) => {
        const config: MCPToolConfig = {
          id: `tool-${index}`,
          name: `Tool ${index}`,
          description: `Testing image format: ${imageUrl.substring(0, 30)}`,
          serverUrl: 'https://api.example.com/mcp',
          imageUrl,
        };

        const tool = mcpTool(config);
        expect(tool.config.imageUrl).toBe(imageUrl);
      });
    });

    it('should work with real-world example URLs', () => {
      const realWorldExamples = [
        {
          name: 'Weather Service',
          imageUrl: 'https://i.pinimg.com/originals/d5/3b/01/d53b014d86a6b6761bf649a0ed813c2b.png',
        },
        {
          name: 'GitHub Integration',
          imageUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        },
        {
          name: 'Slack Connector',
          imageUrl: 'https://cdn.brandfolder.io/5H442O3W/as/pl546j-7le8zk-4nzzs1/Slack_Mark.svg',
        },
      ];

      realWorldExamples.forEach((example) => {
        const config: MCPToolConfig = {
          name: example.name,
          description: `${example.name} MCP tool`,
          serverUrl: 'https://api.example.com/mcp',
          imageUrl: example.imageUrl,
        };

        const tool = mcpTool(config);
        expect(tool.config.imageUrl).toBe(example.imageUrl);
        expect(tool.getName()).toBe(example.name);
      });
    });
  });
});
