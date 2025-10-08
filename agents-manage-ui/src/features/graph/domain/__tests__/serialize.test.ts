import type { Edge, Node } from '@xyflow/react';
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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
            toolId: 'mcp1',
            name: 'Test MCP Server',
            tempSelectedTools: ['tool1', 'tool2'],
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

      expect((result.agents.agent1 as any).canUse).toBeDefined();
      expect((result.agents.agent1 as any).canUse).toHaveLength(1);
      expect((result.agents.agent1 as any).canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: ['tool1', 'tool2'],
        headers: {},
      });
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
            toolId: 'mcp1',
            name: 'Test MCP Server',
            tempSelectedTools: null, // null means all tools selected
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

      // When tempSelectedTools is null, all tools should be selected (toolSelection: null)
      expect((result.agents.agent1 as any).canUse).toBeDefined();
      expect((result.agents.agent1 as any).canUse).toHaveLength(1);
      expect((result.agents.agent1 as any).canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null,
        headers: {},
      });
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
            toolId: 'mcp1',
            name: 'Test MCP Server',
            tempSelectedTools: [], // empty array means no tools selected
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

      expect((result.agents.agent1 as any).canUse).toBeDefined();
      expect((result.agents.agent1 as any).canUse).toHaveLength(1);
      expect((result.agents.agent1 as any).canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: [],
        headers: {},
      });
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
            toolId: 'mcp1',
            name: 'Test MCP Server',
            // no tempSelectedTools property
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

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
            toolId: 'mcp1',
            name: 'Test MCP Server',
            // tempSelectedTools is undefined (user didn't interact with UI)
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

      const result = serializeGraphData(nodes, edges, undefined, {}, {}, {});

      // When tempSelectedTools is undefined and there's an edge to MCP tool,
      // the toolSelection will be null (all tools selected by default)
      expect((result.agents.agent1 as any).canUse).toBeDefined();
      expect((result.agents.agent1 as any).canUse).toHaveLength(1);
      expect((result.agents.agent1 as any).canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null, // null means all tools are selected
        headers: {},
      });
    });
  });
});
