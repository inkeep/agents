import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import { syncSavedAgentGraph } from '@/features/agent/domain/sync-saved-agent-graph';

describe('syncSavedAgentGraph', () => {
  it('renames saved sub-agent node ids and updates the selected node query id', () => {
    const nodes: Node[] = [
      {
        id: '473gigole08cp6vacy38s',
        type: NodeType.SubAgent,
        position: { x: 10, y: 20 },
        data: {},
      },
      {
        id: 'weather-node',
        type: NodeType.MCP,
        position: { x: 300, y: 20 },
        data: {
          toolId: 'weather',
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
      subAgentFormData: {
        '473gigole08cp6vacy38s': {
          id: 'sub-agent',
        },
      } as any,
    });

    expect(result.nodeId).toBe('sub-agent:sub-agent');
    expect(result.edgeId).toBeNull();
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sub-agent',
          position: { x: 10, y: 20 },
          selected: true,
        }),
        expect.objectContaining({
          id: 'mcp:relation-1',
          data: expect.objectContaining({
            toolId: 'weather',
          }),
        }),
      ])
    );
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'edge-weather',
        source: 'sub-agent',
        target: 'mcp:relation-1',
      }),
    ]);
  });

  it('drops unsaved disconnected nodes that are not returned by the backend', () => {
    const nodes: Node[] = [
      {
        id: 'sub-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'floating-tool',
        type: NodeType.MCP,
        position: { x: 200, y: 0 },
        data: {
          toolId: 'weather',
        },
      },
      {
        id: 'floating-external',
        type: NodeType.ExternalAgent,
        position: { x: 400, y: 0 },
        data: {
          externalAgentId: 'external-agent',
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
        data: {},
      },
      {
        id: 'weather-node',
        type: NodeType.MCP,
        position: { x: 300, y: 20 },
        data: {
          toolId: 'weather',
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
      subAgentFormData: {
        '473gigole08cp6vacy38s': {
          id: 'sub-agent',
        },
      } as any,
    });

    expect(result.edgeId).toBe('edge-weather');
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'edge-weather',
        source: 'sub-agent',
        target: 'mcp:relation-1',
        selected: true,
      }),
    ]);
  });

  it('returns canonical agent edge query ids when connected sub-agent ids are renamed on save', () => {
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent-1',
        type: NodeType.SubAgent,
        position: { x: 10, y: 20 },
        data: {},
      },
      {
        id: 'tmp-sub-agent-2',
        type: NodeType.SubAgent,
        position: { x: 300, y: 20 },
        data: {},
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-tmp-sub-agent-1-tmp-sub-agent-2',
        type: EdgeType.A2A,
        source: 'tmp-sub-agent-1',
        target: 'tmp-sub-agent-2',
      },
    ];

    const result = syncSavedAgentGraph({
      nodes,
      edges,
      nodeId: null,
      edgeId: 'edge-tmp-sub-agent-1-tmp-sub-agent-2',
      savedAgent: {
        id: 'agent-1',
        name: 'Agent',
        description: '',
        prompt: '',
        contextConfig: null,
        statusUpdates: null,
        stopWhen: null,
        models: {},
        defaultSubAgentId: 'sub-agent-1',
        subAgents: {
          'sub-agent-1': {
            id: 'sub-agent-1',
            name: 'Sub Agent 1',
            description: '',
            prompt: '',
            type: 'internal',
            dataComponents: [],
            artifactComponents: [],
            canUse: [],
            canTransferTo: ['sub-agent-2'],
            canDelegateTo: [],
          },
          'sub-agent-2': {
            id: 'sub-agent-2',
            name: 'Sub Agent 2',
            description: '',
            prompt: '',
            type: 'internal',
            dataComponents: [],
            artifactComponents: [],
            canUse: [],
            canTransferTo: ['sub-agent-1'],
            canDelegateTo: [],
          },
        },
        functions: {},
        functionTools: {},
        externalAgents: {},
        teamAgents: {},
        tools: {},
      } as any,
      subAgentFormData: {
        'tmp-sub-agent-1': {
          id: 'sub-agent-1',
        },
        'tmp-sub-agent-2': {
          id: 'sub-agent-2',
        },
      } as any,
    });

    expect(result.edgeId).toBe('a2a:sub-agent:sub-agent-1:sub-agent:sub-agent-2');
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'edge-tmp-sub-agent-1-tmp-sub-agent-2',
        source: 'sub-agent-1',
        target: 'sub-agent-2',
        selected: true,
      }),
    ]);
  });

  it('keeps connected external and team agent nodes and assigns saved relation ids', () => {
    const nodes: Node[] = [
      {
        id: 'tmp-sub-agent',
        type: NodeType.SubAgent,
        position: { x: 10, y: 20 },
        data: {},
      },
      {
        id: '7ubfdp65rn5qvh7l788ae',
        type: NodeType.ExternalAgent,
        position: { x: 300, y: 20 },
        data: {
          externalAgentId: 'external-1',
          relationshipId: null,
        },
      },
      {
        id: 'sxi5bgmobt6kl3i8cnxn7',
        type: NodeType.TeamAgent,
        position: { x: 300, y: 140 },
        data: {
          teamAgentId: 'team-1',
          relationshipId: null,
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-external',
        source: 'tmp-sub-agent',
        target: '7ubfdp65rn5qvh7l788ae',
      },
      {
        id: 'edge-team',
        source: 'tmp-sub-agent',
        target: 'sxi5bgmobt6kl3i8cnxn7',
      },
    ];

    const result = syncSavedAgentGraph({
      nodes,
      edges,
      nodeId: '7ubfdp65rn5qvh7l788ae',
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
            canDelegateTo: [
              {
                externalAgentId: 'external-1',
                subAgentExternalAgentRelationId: 'ext-rel-1',
                headers: null,
              },
              {
                agentId: 'team-1',
                subAgentTeamAgentRelationId: 'team-rel-1',
                headers: null,
              },
            ],
          },
        },
        functions: {},
        functionTools: {},
        externalAgents: {
          'external-1': {
            id: 'external-1',
            name: 'External Agent',
            description: '',
            baseUrl: 'https://example.com',
            credentialReferenceId: null,
          },
        },
        teamAgents: {
          'team-1': {
            id: 'team-1',
            name: 'Team Agent',
            description: '',
          },
        },
        tools: {},
      } as any,
      subAgentFormData: {
        'tmp-sub-agent': {
          id: 'sub-agent',
        },
      } as any,
    });

    expect(result.nodeId).toBe('external-agent:external-1');
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '7ubfdp65rn5qvh7l788ae',
          data: expect.objectContaining({
            externalAgentId: 'external-1',
            relationshipId: 'ext-rel-1',
          }),
          selected: true,
        }),
        expect.objectContaining({
          id: 'sxi5bgmobt6kl3i8cnxn7',
          data: expect.objectContaining({
            teamAgentId: 'team-1',
            relationshipId: 'team-rel-1',
          }),
        }),
      ])
    );
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-external',
          source: 'sub-agent',
          target: '7ubfdp65rn5qvh7l788ae',
        }),
        expect.objectContaining({
          id: 'edge-team',
          source: 'sub-agent',
          target: 'sxi5bgmobt6kl3i8cnxn7',
        }),
      ])
    );
  });
});
