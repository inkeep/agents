import type { MCPToolConfig } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import { mcpTool } from '../../builderFunctions';
import type { AgentMcpConfigInput } from '../../builders';

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
      activeTools: ['search', 'fetch'],
      transport: {
        type: 'streamable_http',
      },
    };

    const tool = mcpTool(config);

    expect(tool.getName()).toBe('Full Config MCP Tool');
    expect(tool.getId()).toBe('custom-tool-id');
    expect(tool.getServerUrl()).toBe('https://api.example.com/tools');
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

  describe('with() method', () => {
    it('should create AgentMcpConfig with selectedTools', () => {
      const config: MCPToolConfig = {
        id: 'test-tool',
        name: 'Test Tool',
        description: 'Test MCP tool',
        serverUrl: 'http://localhost:3000/mcp',
      };

      const tool = mcpTool(config);
      const mcpConfigInput: AgentMcpConfigInput = {
        selectedTools: ['search', 'fetch', 'analyze'],
      };

      const agentMcpConfig = tool.with(mcpConfigInput);

      expect(agentMcpConfig.server).toBe(tool);
      expect(agentMcpConfig.selectedTools).toEqual(['search', 'fetch', 'analyze']);
      expect(agentMcpConfig.headers).toBeUndefined();
    });

    it('should create AgentMcpConfig with headers', () => {
      const config: MCPToolConfig = {
        id: 'auth-tool',
        name: 'Auth Tool',
        description: 'MCP tool with authentication',
        serverUrl: 'http://localhost:3000/auth',
      };

      const tool = mcpTool(config);
      const mcpConfigInput: AgentMcpConfigInput = {
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value',
        },
      };

      const agentMcpConfig = tool.with(mcpConfigInput);

      expect(agentMcpConfig.server).toBe(tool);
      expect(agentMcpConfig.headers).toEqual({
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      });
      expect(agentMcpConfig.selectedTools).toBeUndefined();
    });

    it('should create AgentMcpConfig with both selectedTools and headers', () => {
      const config: MCPToolConfig = {
        id: 'full-config-tool',
        name: 'Full Config Tool',
        description: 'MCP tool with full configuration',
        serverUrl: 'http://localhost:3000/full',
      };

      const tool = mcpTool(config);
      const mcpConfigInput: AgentMcpConfigInput = {
        selectedTools: ['read', 'write'],
        headers: {
          'API-Key': 'secret-key',
          'Content-Type': 'application/json',
        },
      };

      const agentMcpConfig = tool.with(mcpConfigInput);

      expect(agentMcpConfig.server).toBe(tool);
      expect(agentMcpConfig.selectedTools).toEqual(['read', 'write']);
      expect(agentMcpConfig.headers).toEqual({
        'API-Key': 'secret-key',
        'Content-Type': 'application/json',
      });
    });

    it('should create AgentMcpConfig with empty config', () => {
      const config: MCPToolConfig = {
        id: 'empty-config-tool',
        name: 'Empty Config Tool',
        description: 'MCP tool with empty configuration',
        serverUrl: 'http://localhost:3000/empty',
      };

      const tool = mcpTool(config);
      const mcpConfigInput: AgentMcpConfigInput = {};

      const agentMcpConfig = tool.with(mcpConfigInput);

      expect(agentMcpConfig.server).toBe(tool);
      expect(agentMcpConfig.selectedTools).toBeUndefined();
      expect(agentMcpConfig.headers).toBeUndefined();
    });
  });
});
