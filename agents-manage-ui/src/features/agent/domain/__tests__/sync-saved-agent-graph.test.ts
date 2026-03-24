import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { NodeType } from '@/components/agent/configuration/node-types';
import { syncSavedAgentGraph } from '@/features/agent/domain/sync-saved-agent-graph';

describe('syncSavedAgentGraph', () => {
  it('renames saved sub-agent node ids and updates the selected node query id', () => {
    const nodes: Node[] = [
      {
        id: '473gigole08cp6vacy38s',
        type: NodeType.SubAgent,
        position: { x: 10, y: 20 },
        data: {
          id: 'sub-agent',
          name: 'Sub Agent',
        },
      },
      {
        id: 'weather-node',
        type: NodeType.MCP,
        position: { x: 300, y: 20 },
        data: {
          toolId: 'weather',
          subAgentId: '473gigole08cp6vacy38s',
          relationshipId: null,
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-weather',
        source: '473gigole08cp6vacy38s',
        target: 'weather-node',
      },
    ];

    const result = syncSavedAgentGraph({
      nodes,
      edges,
      nodeId: '473gigole08cp6vacy38s',
      edgeId: null,
      savedAgent: {
        id: 'agent-1',
        name: 'Agent',
        description: '',
        prompt: '',
        contextConfig: null,
        statusUpdates: null,
        stopWhen: null,
        models: {},
        defaultSubAgentId: 'sub-agent',
        subAgents: {
          'sub-agent': {
            id: 'sub-agent',
            name: 'Sub Agent',
            description: '',
            prompt: '',
            type: 'internal',
            dataComponents: [],
            artifactComponents: [],
            canUse: [
              {
                toolId: 'weather',
                agentToolRelationId: 'relation-1',
              },
            ],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        functions: {},
        functionTools: {},
        externalAgents: {},
        teamAgents: {},
        tools: {
          weather: {
            id: 'weather',
            name: 'Weather',
            description: 'Weather tool',
          },
        },
      } as any,
    });

    expect(result.nodeId).toBe('sub-agent');
    expect(result.edgeId).toBeNull();
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sub-agent',
          position: { x: 10, y: 20 },
          selected: true,
        }),
        expect.objectContaining({
          id: 'weather-node',
          data: expect.objectContaining({
            subAgentId: 'sub-agent',
            relationshipId: 'relation-1',
          }),
        }),
      ])
    );
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'edge-weather',
        source: 'sub-agent',
        target: 'weather-node',
      }),
    ]);
  });

  it('drops unsaved disconnected nodes that are not returned by the backend', () => {
    const nodes: Node[] = [
      {
        id: 'sub-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {
          id: 'sub-agent',
          name: 'Sub Agent',
        },
      },
      {
        id: 'floating-tool',
        type: NodeType.MCP,
        position: { x: 200, y: 0 },
        data: {
          toolId: 'weather',
          subAgentId: null,
          relationshipId: null,
        },
      },
      {
        id: 'floating-external',
        type: NodeType.ExternalAgent,
        position: { x: 400, y: 0 },
        data: {
          id: 'external-agent',
          name: 'External Agent',
          relationshipId: null,
        },
      },
    ];

    const result = syncSavedAgentGraph({
      nodes,
      edges: [],
      nodeId: 'floating-tool',
      edgeId: null,
      savedAgent: {
        id: 'agent-1',
        name: 'Agent',
        description: '',
        prompt: '',
        contextConfig: null,
        statusUpdates: null,
        stopWhen: null,
        models: {},
        defaultSubAgentId: 'sub-agent',
        subAgents: {
          'sub-agent': {
            id: 'sub-agent',
            name: 'Sub Agent',
            description: '',
            prompt: '',
            type: 'internal',
            dataComponents: [],
            artifactComponents: [],
            canUse: [],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        functions: {},
        functionTools: {},
        externalAgents: {},
        teamAgents: {},
        tools: {},
      } as any,
    });

    expect(result.nodeId).toBeNull();
    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: 'sub-agent',
      }),
    ]);
  });

  it('preserves selected edges when connected sub-agent ids are renamed on save', () => {
    const nodes: Node[] = [
      {
        id: '473gigole08cp6vacy38s',
        type: NodeType.SubAgent,
        position: { x: 10, y: 20 },
        data: {
          id: 'sub-agent',
          name: 'Sub Agent',
        },
      },
      {
        id: 'weather-node',
        type: NodeType.MCP,
        position: { x: 300, y: 20 },
        data: {
          toolId: 'weather',
          subAgentId: '473gigole08cp6vacy38s',
          relationshipId: null,
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-weather',
        source: '473gigole08cp6vacy38s',
        target: 'weather-node',
      },
    ];

    const result = syncSavedAgentGraph({
      nodes,
      edges,
      nodeId: null,
      edgeId: 'edge-weather',
      savedAgent: {
        id: 'agent-1',
        name: 'Agent',
        description: '',
        prompt: '',
        contextConfig: null,
        statusUpdates: null,
        stopWhen: null,
        models: {},
        defaultSubAgentId: 'sub-agent',
        subAgents: {
          'sub-agent': {
            id: 'sub-agent',
            name: 'Sub Agent',
            description: '',
            prompt: '',
            type: 'internal',
            dataComponents: [],
            artifactComponents: [],
            canUse: [
              {
                toolId: 'weather',
                agentToolRelationId: 'relation-1',
              },
            ],
            canTransferTo: [],
            canDelegateTo: [],
          },
        },
        functions: {},
        functionTools: {},
        externalAgents: {},
        teamAgents: {},
        tools: {
          weather: {
            id: 'weather',
            name: 'Weather',
            description: 'Weather tool',
          },
        },
      } as any,
    });

    expect(result.edgeId).toBe('edge-weather');
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'edge-weather',
        source: 'sub-agent',
        target: 'weather-node',
        selected: true,
      }),
    ]);
  });
});
