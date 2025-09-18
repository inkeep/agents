import type { MCPToolConfig } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import { mcpTool } from '../../builderFunctions';

describe('mcpTool builder function', () => {
  it('should create an MCP tool with basic config', () => {
    const config: MCPToolConfig = {
      id: 'test-mcp-tool',
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
      id: 'auto-generated-id-tool',
      name: 'Auto Generated ID Tool',
      description: 'Tool with auto-generated ID',
      serverUrl: 'http://localhost:3000/tools',
    };

    const tool = mcpTool(config);
    expect(tool.getId()).toBe('auto-generated-id-tool');
  });

  it('should handle complex transport configurations', () => {
    const config: MCPToolConfig = {
      id: 'complex-transport-tool',
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
      id: 'simple-tool',
      name: 'Simple Tool',
      description: 'Tool without optional fields',
      serverUrl: 'http://localhost:3000/simple',
    };

    const tool = mcpTool(config);
    expect(tool.config.activeTools).toBeUndefined();
    expect(tool.config.transport).toBeUndefined();
  });
});
