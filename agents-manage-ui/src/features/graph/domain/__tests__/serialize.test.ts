import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import type { AgentNodeData, MCPNodeData } from '@/components/graph/configuration/node-types';
import { NodeType } from '@/components/graph/configuration/node-types';
import { serializeGraphData } from '../serialize';

describe('serializeGraphData', () => {
  describe('models object processing', () => {
    it('should set models to undefined when models object has only empty values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: undefined,
              structuredOutput: undefined,
              summarizer: undefined,
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toBeUndefined();
    });

    it('should set models to undefined when models object has only whitespace values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: undefined,
              structuredOutput: undefined,
              summarizer: undefined,
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toBeUndefined();
    });

    it('should include models object when model field has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: { model: 'gpt-4' },
              structuredOutput: undefined,
              summarizer: undefined,
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: undefined,
        summarizer: undefined,
      });
    });

    it('should include models object when structuredOutput has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: undefined,
              structuredOutput: { model: 'gpt-4o-2024-08-06' },
              summarizer: undefined,
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toEqual({
        base: undefined,
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
        summarizer: undefined,
      });
    });

    it('should include models object when summarizer has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: undefined,
              structuredOutput: undefined,
              summarizer: { model: 'gpt-3.5-turbo' },
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toEqual({
        base: undefined,
        structuredOutput: undefined,
        summarizer: { model: 'gpt-3.5-turbo' },
      });
    });

    it('should include all fields when they have values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            models: {
              base: { model: 'gpt-4' },
              structuredOutput: { model: 'gpt-4o-2024-08-06' },
              summarizer: { model: 'gpt-3.5-turbo' },
            },
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
        summarizer: { model: 'gpt-3.5-turbo' },
      });
    });

    it('should set models to undefined when no models data is provided', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            // no models property
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).models).toBeUndefined();
    });
  });

  describe('selectedTools processing', () => {
    it('should transfer tempSelectedTools from MCP nodes to agent selectedTools', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
          },
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            id: 'mcp1',
            name: 'Test MCP Server',
            config: { type: 'mcp', mcp: { server: { url: 'test://server' } } },
            tempSelectedTools: ['tool1', 'tool2'],
            tenantId: 'test-tenant',
            projectId: 'test-project',
            status: 'unknown',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as MCPNodeData,
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'mcp1',
        },
      ];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).selectedTools).toBeDefined();
      expect((result.agents.agent1 as any).selectedTools.mcp1).toEqual(['tool1', 'tool2']);
    });

    it('should handle null tempSelectedTools (all tools selected) by removing from selectedTools', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            selectedTools: { mcp1: ['existing'] }, // existing selection
          },
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            id: 'mcp1',
            name: 'Test MCP Server',
            config: { type: 'mcp', mcp: { server: { url: 'test://server' } } },
            tempSelectedTools: null, // null means all tools selected
            tenantId: 'test-tenant',
            projectId: 'test-project',
            status: 'unknown',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as MCPNodeData,
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'mcp1',
        },
      ];

      const result = serializeGraphData(nodes, edges);

      // When tempSelectedTools is null, the tool ID should be removed from selectedTools
      expect((result.agents.agent1 as any).selectedTools).toBeDefined();
      expect((result.agents.agent1 as any).selectedTools.mcp1).toBeUndefined();
    });

    it('should handle empty array tempSelectedTools (no tools selected)', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
          },
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            id: 'mcp1',
            name: 'Test MCP Server',
            config: { type: 'mcp', mcp: { server: { url: 'test://server' } } },
            tempSelectedTools: [], // empty array means no tools selected
            tenantId: 'test-tenant',
            projectId: 'test-project',
            status: 'unknown',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as MCPNodeData,
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'mcp1',
        },
      ];

      const result = serializeGraphData(nodes, edges);

      expect((result.agents.agent1 as any).selectedTools).toBeDefined();
      expect((result.agents.agent1 as any).selectedTools.mcp1).toEqual([]);
    });

    it('should not modify selectedTools when tempSelectedTools is undefined', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
          },
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            id: 'mcp1',
            name: 'Test MCP Server',
            config: { type: 'mcp', mcp: { server: { url: 'test://server' } } },
            // no tempSelectedTools property
            tenantId: 'test-tenant',
            projectId: 'test-project',
            status: 'unknown',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as MCPNodeData,
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'mcp1',
        },
      ];

      const result = serializeGraphData(nodes, edges);

      // selectedTools should not be created if tempSelectedTools is undefined
      expect((result.agents.agent1 as any).selectedTools).toBeUndefined();
    });

    it('should preserve existing selectedTools when tempSelectedTools is undefined', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.Agent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            // Existing selectedTools from database (added by deserializer)
            selectedTools: { mcp1: ['existing-tool1'] },
          },
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            id: 'mcp1',
            name: 'Test MCP Server',
            config: { type: 'mcp', mcp: { server: { url: 'test://server' } } },
            // tempSelectedTools is undefined (user didn't interact with UI)
            tenantId: 'test-tenant',
            projectId: 'test-project',
            status: 'unknown',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as MCPNodeData,
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge1',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'mcp1',
        },
      ];

      const result = serializeGraphData(nodes, edges);

      // Should preserve existing selectedTools from database
      expect((result.agents.agent1 as any).selectedTools).toBeDefined();
      expect((result.agents.agent1 as any).selectedTools.mcp1).toEqual(['existing-tool1']);
    });
  });
});
