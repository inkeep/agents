import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { EdgeType } from '@/components/graph/configuration/edge-types';
import { NodeType } from '@/components/graph/configuration/node-types';
import { deserializeGraphData } from '@/features/graph/domain/deserialize';
import { serializeGraphData } from '@/features/graph/domain/serialize';

describe('graph serialize/deserialize', () => {
  it('handles self-referencing agents correctly', () => {
    const nodes: Node[] = [
      {
        id: 'goodbye-agent',
        type: NodeType.Agent,
        position: { x: 0, y: 0 },
        data: {
          id: 'goodbye-agent',
          name: 'Goodbye Agent',
          prompt: 'Say goodbye',
        },
      },
      {
        id: 'hello-agent',
        type: NodeType.Agent,
        position: { x: 0, y: 100 },
        data: {
          id: 'hello-agent',
          name: 'Hello Agent',
          isDefault: true,
          prompt: 'Say hello',
        },
        deletable: false,
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-self-goodbye',
        type: EdgeType.SelfLoop,
        source: 'goodbye-agent',
        target: 'goodbye-agent',
        data: {
          relationships: {
            transferSourceToTarget: true,
            transferTargetToSource: false,
            delegateSourceToTarget: true,
            delegateTargetToSource: false,
          },
        },
      } as Edge,
    ];

    const serialized = serializeGraphData(nodes, edges, {
      id: 'test-graph',
      name: 'Test Graph',
      description: 'Graph with self-referencing agent',
      contextConfig: {
        id: '',
        name: '',
        description: '',
        contextVariables: '',
        requestContextSchema: '',
      },
    });

    expect(serialized.agents['goodbye-agent']).toBeDefined();
    const goodbyeAgent = serialized.agents['goodbye-agent'];
    if ('canTransferTo' in goodbyeAgent) {
      expect(goodbyeAgent.canTransferTo).toContain('goodbye-agent');
    }
    if ('canDelegateTo' in goodbyeAgent) {
      expect(goodbyeAgent.canDelegateTo).toContain('goodbye-agent');
    }

    const deserialized = deserializeGraphData(serialized);

    // Should have the self-loop edge
    const selfLoopEdge = deserialized.edges.find(
      (e) =>
        e.type === EdgeType.SelfLoop && e.source === 'goodbye-agent' && e.target === 'goodbye-agent'
    );
    expect(selfLoopEdge).toBeDefined();
    if (
      selfLoopEdge?.data &&
      typeof selfLoopEdge.data === 'object' &&
      'relationships' in selfLoopEdge.data
    ) {
      const relationships = selfLoopEdge.data.relationships as any;
      expect(relationships.transferSourceToTarget).toBe(true);
      expect(relationships.delegateSourceToTarget).toBe(true);
    }
  });

  it('round-trips a simple agent with tool and a2a edge', () => {
    const nodes: Node[] = [
      {
        id: 'a1',
        type: NodeType.Agent,
        position: { x: 0, y: 0 },
        data: { id: 'a1', name: 'A1', isDefault: true, prompt: 'i' },
        deletable: false,
      },
      {
        id: 'a2',
        type: NodeType.Agent,
        position: { x: 0, y: 0 },
        data: { id: 'a2', name: 'A2', prompt: 'i' },
      },
      {
        id: 't1node',
        type: NodeType.MCP,
        position: { x: 0, y: 0 },
        data: { id: 't1', type: 'mcp', name: 'Tool1', config: {} },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'e1',
        type: EdgeType.Default,
        source: 'a1',
        target: 't1node',
      } as Edge,
      {
        id: 'e2',
        type: EdgeType.A2A,
        source: 'a1',
        target: 'a2',
        data: {
          relationships: {
            transferSourceToTarget: true,
            transferTargetToSource: false,
            delegateSourceToTarget: false,
            delegateTargetToSource: false,
          },
        },
      } as Edge,
    ];

    const serialized = serializeGraphData(nodes, edges, {
      id: 'g1',
      name: 'G',
      description: 'D',
      contextConfig: {
        name: 'Context',
        description: 'Context description',
        contextVariables: '{}',
        requestContextSchema: '{}',
      },
    });
    expect(serialized.id).toBe('g1');
    expect(serialized.agents.a1).toBeDefined();
    // Note: Tools are now project-scoped and not included in graph serialization
    // expect(serialized.tools.t1).toBeDefined();
    const a1 = serialized.agents.a1;
    if ('tools' in a1) {
      expect(a1.tools).toContain('t1');
    }
    if ('canTransferTo' in a1) {
      expect(a1.canTransferTo).toContain('a2');
    }

    const deserialized = deserializeGraphData(serialized);
    expect(deserialized.nodes.length).toBeGreaterThan(0);
    expect(deserialized.edges.length).toBeGreaterThan(0);
  });
});
