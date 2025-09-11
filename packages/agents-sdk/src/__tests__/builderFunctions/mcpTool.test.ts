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

    expect(tool.name).toBe('Test MCP Tool');
    expect(tool.serverUrl).toBe('http://localhost:3000/mcp');
    expect(tool.id).toBe('test-mcp-tool');
  });

  it('should create an MCP tool with full config', () => {
    const config: MCPToolConfig = {
      id: 'custom-tool-id',
      name: 'Full Config MCP Tool',
      description: 'MCP tool with all options',
      serverUrl: 'https://api.example.com/tools',
      tenantId: 'test-tenant',
      parameters: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Result limit',
          default: 10,
        },
      },
    };

    const tool = mcpTool(config);

    expect(tool.name).toBe('Full Config MCP Tool');
    expect(tool.id).toBe('custom-tool-id');
    expect(tool.serverUrl).toBe('https://api.example.com/tools');
    expect(tool.config.tenantId).toBe('test-tenant');
    expect(tool.config.parameters).toEqual({
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Result limit',
        default: 10,
      },
    });
  });

  it('should generate ID from name when not provided', () => {
    const config: MCPToolConfig = {
      name: 'Auto Generated ID Tool',
      description: 'Tool with auto-generated ID',
      serverUrl: 'http://localhost:3000/tools',
    };

    const tool = mcpTool(config);
    expect(tool.id).toBe('auto-generated-id-tool');
  });

  it('should handle complex parameter schemas', () => {
    const config: MCPToolConfig = {
      name: 'Complex Schema Tool',
      description: 'Tool with complex parameters',
      serverUrl: 'http://localhost:3000/complex-tool',
      parameters: {
        filters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['docs', 'code', 'api'],
            },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', format: 'date' },
                end: { type: 'string', format: 'date' },
              },
              required: ['start', 'end'],
            },
          },
        },
        options: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Additional options',
        },
      },
    };

    const tool = mcpTool(config);
    expect(tool.config.parameters).toEqual(config.parameters);
  });

  it('should handle tools without parameters', () => {
    const config: MCPToolConfig = {
      name: 'Simple Tool',
      description: 'Tool without parameters',
      serverUrl: 'http://localhost:3000/simple',
    };

    const tool = mcpTool(config);
    expect(tool.config.parameters).toBeUndefined();
  });
});
