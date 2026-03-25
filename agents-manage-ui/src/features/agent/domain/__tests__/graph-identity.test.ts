import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import {
  findNodeByGraphKey,
  getEdgeGraphKey,
  getNodeGraphKey,
} from '@/features/agent/domain/graph-identity';

describe('graph identity', () => {
  it('builds canonical graph keys for each node type', () => {
    const subAgentFormData = {
      'tmp-sub-agent': {
        id: 'sub-agent-1',
      },
    } as any;

    const subAgentNode: Node = {
      id: 'tmp-sub-agent',
      type: NodeType.SubAgent,
      position: { x: 0, y: 0 },
      data: {},
    };
    const mcpNode: Node = {
      id: 'mcp-node',
      type: NodeType.MCP,
      position: { x: 0, y: 0 },
      data: {
        toolId: 'weather',
      },
    };
    const functionToolNode: Node = {
      id: 'tmp-function-node',
      type: NodeType.FunctionTool,
      position: { x: 0, y: 0 },
      data: {
        toolId: 'function-tool-1',
        relationshipId: 'relation-1',
      },
    };
    const externalAgentNode: Node = {
      id: '7ubfdp65rn5qvh7l788ae',
      type: NodeType.ExternalAgent,
      position: { x: 0, y: 0 },
      data: {
        externalAgentId: 'external-agent-1',
        relationshipId: 'external-relation-1',
      },
    };
    const teamAgentNode: Node = {
      id: 'sxi5bgmobt6kl3i8cnxn7',
      type: NodeType.TeamAgent,
      position: { x: 0, y: 0 },
      data: {
        teamAgentId: 'team-agent-1',
        relationshipId: 'team-relation-1',
      },
    };

    expect(getNodeGraphKey(subAgentNode, subAgentFormData)).toBe('sub-agent:sub-agent-1');
    expect(getNodeGraphKey(mcpNode, subAgentFormData)).toBe('mcp:weather:mcp-node');
    expect(getNodeGraphKey(functionToolNode, subAgentFormData)).toBe(
      'function-tool:function-tool-1'
    );
    expect(getNodeGraphKey(externalAgentNode, subAgentFormData)).toBe(
      'external-agent:external-agent-1'
    );
    expect(getNodeGraphKey(teamAgentNode, subAgentFormData)).toBe('team-agent:team-agent-1');
  });

  it('finds nodes from canonical graph keys and legacy raw references', () => {
    const subAgentFormData = {
      'tmp-sub-agent': {
        id: 'sub-agent-1',
      },
    } as any;
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'tmp-mcp-node',
        type: NodeType.MCP,
        position: { x: 0, y: 0 },
        data: {
          toolId: 'weather',
        },
      },
      {
        id: 'generic-external-node',
        type: NodeType.ExternalAgent,
        position: { x: 0, y: 0 },
        data: {
          externalAgentId: 'external-agent-1',
          relationshipId: null,
        },
      },
    ];

    expect(findNodeByGraphKey(nodes, 'sub-agent:sub-agent-1', subAgentFormData)?.id).toBe(
      'tmp-sub-agent'
    );
    expect(findNodeByGraphKey(nodes, 'sub-agent-1', subAgentFormData)?.id).toBe('tmp-sub-agent');
    expect(findNodeByGraphKey(nodes, 'mcp:weather:tmp-mcp-node', subAgentFormData)?.id).toBe(
      'tmp-mcp-node'
    );
    expect(findNodeByGraphKey(nodes, 'weather', subAgentFormData)?.id).toBe('tmp-mcp-node');
    expect(findNodeByGraphKey(nodes, 'external-agent:external-agent-1', subAgentFormData)?.id).toBe(
      'generic-external-node'
    );
    expect(findNodeByGraphKey(nodes, 'external-agent-1', subAgentFormData)?.id).toBe(
      'generic-external-node'
    );
  });

  it('canonicalizes agent edge graph keys from node graph keys', () => {
    const subAgentFormData = {
      'tmp-sub-agent-a': {
        id: 'sub-agent-a',
      },
      'tmp-sub-agent-b': {
        id: 'sub-agent-b',
      },
    } as any;
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent-a',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'tmp-sub-agent-b',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    const edge: Edge = {
      id: 'edge-tmp-sub-agent-a-tmp-sub-agent-b',
      type: EdgeType.A2A,
      source: 'tmp-sub-agent-a',
      target: 'tmp-sub-agent-b',
    };

    expect(getEdgeGraphKey(edge, nodes, subAgentFormData)).toBe(
      'a2a:sub-agent:sub-agent-a:sub-agent:sub-agent-b'
    );
  });
});
