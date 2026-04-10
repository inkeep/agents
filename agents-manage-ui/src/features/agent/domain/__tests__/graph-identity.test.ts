import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType, newNodeDefaults } from '@/components/agent/configuration/node-types';
import {
  findNodeByGraphKey,
  getEdgeGraphKey,
  getNodeGraphKey,
} from '@/features/agent/domain/graph-identity';
import { getPlaceholderGraphKey } from '@/features/agent/domain/graph-keys';

describe('graph identity', () => {
  it('reads explicit node keys for each node type', () => {
    const subAgentNode: Node = {
      id: 'tmp-sub-agent',
      type: NodeType.SubAgent,
      position: { x: 0, y: 0 },
      data: {
        nodeKey: 'sub-agent-1',
      },
    };
    const mcpNode: Node = {
      id: 'mcp-node',
      type: NodeType.MCP,
      position: { x: 0, y: 0 },
      data: {
        nodeKey: 'mcp:weather:mcp-node',
        toolId: 'weather',
      },
    };
    const functionToolNode: Node = {
      id: 'tmp-function-node',
      type: NodeType.FunctionTool,
      position: { x: 0, y: 0 },
      data: {
        nodeKey: 'function-tool:function-tool-1',
        toolId: 'function-tool-1',
      },
    };
    const externalAgentNode: Node = {
      id: '7ubfdp65rn5qvh7l788ae',
      type: NodeType.ExternalAgent,
      position: { x: 0, y: 0 },
      data: {
        nodeKey: 'external-agent:external-agent-1',
        externalAgentId: 'external-agent-1',
        relationshipId: 'external-relation-1',
      },
    };
    const teamAgentNode: Node = {
      id: 'sxi5bgmobt6kl3i8cnxn7',
      type: NodeType.TeamAgent,
      position: { x: 0, y: 0 },
      data: {
        nodeKey: 'team-agent:team-agent-1',
        teamAgentId: 'team-agent-1',
        relationshipId: 'team-relation-1',
      },
    };

    expect(getNodeGraphKey(subAgentNode)).toBe('sub-agent-1');
    expect(getNodeGraphKey(mcpNode)).toBe('mcp:weather:mcp-node');
    expect(getNodeGraphKey(functionToolNode)).toBe('function-tool:function-tool-1');
    expect(getNodeGraphKey(externalAgentNode)).toBe('external-agent:external-agent-1');
    expect(getNodeGraphKey(teamAgentNode)).toBe('team-agent:team-agent-1');
  });

  it('finds nodes from explicit graph keys only', () => {
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: 'sub-agent-1',
        },
      },
      {
        id: 'tmp-mcp-node',
        type: NodeType.MCP,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: 'mcp:weather:tmp-mcp-node',
          toolId: 'weather',
        },
      },
      {
        id: 'tmp-placeholder',
        type: NodeType.MCPPlaceholder,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: getPlaceholderGraphKey(NodeType.MCPPlaceholder, 'tmp-placeholder'),
        },
      },
      {
        id: 'generic-external-node',
        type: NodeType.ExternalAgent,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: 'external-agent:external-agent-1',
          externalAgentId: 'external-agent-1',
          relationshipId: null,
        },
      },
    ];

    expect(findNodeByGraphKey(nodes, 'sub-agent-1')?.id).toBe('tmp-sub-agent');
    expect(findNodeByGraphKey(nodes, 'mcp:weather:tmp-mcp-node')?.id).toBe('tmp-mcp-node');
    expect(findNodeByGraphKey(nodes, 'external-agent:external-agent-1')?.id).toBe(
      'generic-external-node'
    );
    expect(
      findNodeByGraphKey(nodes, getPlaceholderGraphKey(NodeType.MCPPlaceholder, 'tmp-placeholder'))
        ?.id
    ).toBe('tmp-placeholder');
    expect(findNodeByGraphKey(nodes, 'tmp-placeholder')).toBeUndefined();
    expect(findNodeByGraphKey(nodes, 'weather')).toBeUndefined();
  });

  it('canonicalizes agent edge graph keys from explicit node keys', () => {
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent-a',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: 'sub-agent-a',
        },
      },
      {
        id: 'tmp-sub-agent-b',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {
          nodeKey: 'sub-agent-b',
        },
      },
    ];
    const edge: Edge = {
      id: 'edge-tmp-sub-agent-a-tmp-sub-agent-b',
      type: EdgeType.A2A,
      source: 'tmp-sub-agent-a',
      target: 'tmp-sub-agent-b',
    };

    expect(getEdgeGraphKey(edge, nodes)).toBe('a2a:sub-agent-a:sub-agent-b');
  });

  it('returns null when explicit graph identity is missing', () => {
    const malformedNode: Node = {
      id: 'tmp-sub-agent-a',
      type: NodeType.SubAgent,
      position: { x: 0, y: 0 },
      data: {},
    };
    const edge: Edge = {
      id: 'edge-tmp-sub-agent-a-tmp-sub-agent-a',
      type: EdgeType.SelfLoop,
      source: 'tmp-sub-agent-a',
      target: 'tmp-sub-agent-a',
    };

    expect(getNodeGraphKey(malformedNode)).toBeNull();
    expect(getEdgeGraphKey(edge, [malformedNode])).toBeNull();
  });

  it('seeds explicit node keys for every non-placeholder live node', () => {
    const liveNodeTypes = [
      NodeType.SubAgent,
      NodeType.ExternalAgent,
      NodeType.TeamAgent,
      NodeType.MCP,
      NodeType.FunctionTool,
    ] as const;

    for (const nodeType of liveNodeTypes) {
      expect(newNodeDefaults[nodeType]('node-1')).toEqual(
        expect.objectContaining({
          nodeKey: expect.any(String),
        })
      );
    }
  });
});
