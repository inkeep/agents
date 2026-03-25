import type { Edge, Node } from '@xyflow/react';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import { apiToGraph } from '@/features/agent/domain/deserialize';
import type { SerializeAgentFormState } from '@/features/agent/domain/serialize';
import { editorToPayload as editorToPayloadInternal } from '@/features/agent/domain/serialize';

function createSubAgentFormValue(
  id: string,
  overrides: Partial<SerializeAgentFormState['subAgents'][string]> = {}
): SerializeAgentFormState['subAgents'][string] {
  return {
    id,
    name: '',
    description: '',
    prompt: '',
    type: 'internal',
    models: {
      base: {},
      structuredOutput: {},
      summarizer: {},
    },
    canUse: [],
    dataComponents: [],
    artifactComponents: [],
    stopWhen: {},
    skills: [],
    ...overrides,
  };
}

function createSerializeAgentFormState(nodes: Node[]): SerializeAgentFormState {
  return {
    mcpRelations: Object.fromEntries(
      nodes
        .filter((node) => node.type === NodeType.MCP)
        .map((node) => [
          node.id,
          {
            selectedTools: null,
            headers: undefined,
            toolPolicies: undefined,
          },
        ])
    ),
    functionTools: {},
    externalAgents: {},
    teamAgents: {},
    subAgents: Object.fromEntries(
      nodes
        .filter((node) => node.type === NodeType.SubAgent)
        .map((node) => [node.id, createSubAgentFormValue(node.id)])
    ),
    functions: {},
    defaultSubAgentNodeId: undefined,
  };
}

function editorToPayload(
  nodes: Node[],
  edges: Edge[],
  subAgents?: SerializeAgentFormState['subAgents']
) {
  return editorToPayloadInternal(nodes, edges, {
    ...createSerializeAgentFormState(nodes),
    ...(subAgents && { subAgents }),
  });
}

describe('agent serialize/deserialize', () => {
  it('handles self-referencing agents correctly', () => {
    const nodes: Node[] = [
      {
        id: 'goodbye-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'hello-agent',
        type: NodeType.SubAgent,
        position: { x: 0, y: 100 },
        data: {},
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
      },
    ];

    const serialized = editorToPayload(nodes, edges);

    expect(serialized.subAgents['goodbye-agent']).toBeDefined();
    const goodbyeAgent = serialized.subAgents['goodbye-agent'];
    if ('canTransferTo' in goodbyeAgent) {
      expect(goodbyeAgent.canTransferTo).toContain('goodbye-agent');
    }
    if ('canDelegateTo' in goodbyeAgent) {
      expect(goodbyeAgent.canDelegateTo).toContain('goodbye-agent');
    }

    const deserialized = apiToGraph(serialized);

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
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
        deletable: false,
      },
      {
        id: 'a2',
        type: NodeType.SubAgent,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 't1node',
        type: NodeType.MCP,
        position: { x: 0, y: 0 },
        data: {
          toolId: 't1',
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'e1',
        type: EdgeType.Default,
        source: 'a1',
        target: 't1node',
      },
      {
        id: 'e2',
        type: EdgeType.A2A,
        source: 'a1',
        target: 'a2',
        data: {
          relationships: {
            transferSourceToTarget: true,
            transferTargetToSource: false,
            delegateSourceToTarget: true,
            delegateTargetToSource: false,
          },
        },
      },
    ];

    const serialized = editorToPayload(nodes, edges);
    expect(serialized.subAgents.a1).toBeDefined();
    // Note: Tools are now project-scoped and not included in agent serialization
    // expect(serialized.tools.t1).toBeDefined();
    const a1 = serialized.subAgents.a1;
    if ('tools' in a1) {
      expect(a1.tools).toContain('t1');
    }
    // Edge has delegateSourceToTarget: true, not transfer
    if ('canDelegateTo' in a1) {
      expect(a1.canDelegateTo).toContain('a2');
    }

    const deserialized = apiToGraph(serialized);
    expect(deserialized.nodes.length).toBeGreaterThan(0);
    expect(deserialized.edges.length).toBeGreaterThan(0);
  });
});
