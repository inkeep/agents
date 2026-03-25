import type { Edge, Node } from '@xyflow/react';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import type { SerializeAgentFormState } from '../serialize';
import { editorToPayload as editorToPayloadInternal } from '../serialize';
import { syncSavedAgentGraph } from '../sync-saved-agent-graph';

type TestMcpRelations = Record<
  string,
  {
    relationshipId?: string | null;
    selectedTools?: string[] | null;
    headers?: Record<string, string> | null;
    toolPolicies?: Record<string, { needsApproval?: boolean }> | null;
  }
>;

type SubAgentFormOverride = Omit<
  Partial<SerializeAgentFormState['subAgents'][string]>,
  'models'
> & {
  models?: Partial<NonNullable<SerializeAgentFormState['subAgents'][string]['models']>>;
};

function createSubAgentFormValue(
  id: string,
  overrides: SubAgentFormOverride = {}
): SerializeAgentFormState['subAgents'][string] {
  const { models, ...rest } = overrides;

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
    ...rest,
    ...(models && { models: models as SerializeAgentFormState['subAgents'][string]['models'] }),
  };
}

function createFunctionToolFormValue(
  toolId: string,
  overrides: Partial<SerializeAgentFormState['functionTools'][string]> = {}
): SerializeAgentFormState['functionTools'][string] {
  return {
    functionId: toolId,
    name: '',
    description: '',
    tempToolPolicies: {},
    ...overrides,
  };
}

function createExternalAgentFormValue(
  id: string,
  overrides: Partial<SerializeAgentFormState['externalAgents'][string]> = {}
): SerializeAgentFormState['externalAgents'][string] {
  return {
    id,
    name: '',
    description: '',
    baseUrl: 'https://example.com/agent',
    headers: undefined,
    ...overrides,
  };
}

function createTeamAgentFormValue(
  id: string,
  overrides: Partial<SerializeAgentFormState['teamAgents'][string]> = {}
): SerializeAgentFormState['teamAgents'][string] {
  return {
    id,
    name: '',
    description: '',
    headers: undefined,
    ...overrides,
  };
}

function createSerializeAgentFormState(
  nodes: Node[],
  overrides: Partial<SerializeAgentFormState> = {}
): SerializeAgentFormState {
  const subAgents = Object.fromEntries(
    nodes
      .filter((node) => node.type === NodeType.SubAgent)
      .map((node) => [node.id, createSubAgentFormValue(node.id)])
  ) as SerializeAgentFormState['subAgents'];

  const functionTools = Object.fromEntries(
    nodes
      .filter((node) => node.type === NodeType.FunctionTool)
      .map((node) => {
        const toolId =
          typeof node.data.toolId === 'string' && node.data.toolId ? node.data.toolId : node.id;

        return [toolId, createFunctionToolFormValue(toolId)];
      })
  ) as SerializeAgentFormState['functionTools'];

  const functions = Object.fromEntries(
    Object.values(functionTools).map((tool) => [
      tool.functionId,
      {
        executeCode: '',
        inputSchema: {},
        dependencies: {},
      },
    ])
  );

  const externalAgents = Object.fromEntries(
    nodes
      .filter((node) => node.type === NodeType.ExternalAgent)
      .map((node) => {
        const externalAgentId =
          typeof node.data.externalAgentId === 'string' && node.data.externalAgentId
            ? node.data.externalAgentId
            : node.id;

        return [externalAgentId, createExternalAgentFormValue(externalAgentId)];
      })
  ) as SerializeAgentFormState['externalAgents'];

  const teamAgents = Object.fromEntries(
    nodes
      .filter((node) => node.type === NodeType.TeamAgent)
      .map((node) => {
        const teamAgentId =
          typeof node.data.teamAgentId === 'string' && node.data.teamAgentId
            ? node.data.teamAgentId
            : node.id;

        return [teamAgentId, createTeamAgentFormValue(teamAgentId)];
      })
  ) as SerializeAgentFormState['teamAgents'];

  return {
    mcpRelations: {
      ...Object.fromEntries(
        nodes
          .filter((node) => node.type === NodeType.MCP)
          .map((node) => {
            return [
              node.id,
              {
                relationshipId: undefined,
                selectedTools: null,
                headers: undefined,
                toolPolicies: undefined,
              },
            ];
          })
      ),
      ...overrides.mcpRelations,
    },
    functionTools: {
      ...functionTools,
      ...overrides.functionTools,
    },
    externalAgents: {
      ...externalAgents,
      ...overrides.externalAgents,
    },
    teamAgents: {
      ...teamAgents,
      ...overrides.teamAgents,
    },
    subAgents: {
      ...subAgents,
      ...overrides.subAgents,
    },
    functions: {
      ...functions,
      ...overrides.functions,
    },
    defaultSubAgentNodeId: overrides.defaultSubAgentNodeId,
  };
}

function editorToPayload(
  nodes: Node[],
  edges: Edge[],
  mcpRelations: TestMcpRelations = {},
  functionTools: SerializeAgentFormState['functionTools'] = {},
  externalAgents: SerializeAgentFormState['externalAgents'] = {},
  teamAgents: SerializeAgentFormState['teamAgents'] = {},
  subAgents?: SerializeAgentFormState['subAgents'],
  functions: SerializeAgentFormState['functions'] = {},
  defaultSubAgentNodeId?: SerializeAgentFormState['defaultSubAgentNodeId']
) {
  return editorToPayloadInternal(
    nodes,
    edges,
    createSerializeAgentFormState(nodes, {
      mcpRelations: Object.fromEntries(
        Object.entries(mcpRelations).map(([key, value]) => [
          key,
          {
            relationshipId: value.relationshipId ?? undefined,
            selectedTools: value.selectedTools,
            headers: value.headers ?? undefined,
            toolPolicies: value.toolPolicies ?? undefined,
          },
        ])
      ),
      functionTools,
      externalAgents,
      teamAgents,
      subAgents,
      functions,
      defaultSubAgentNodeId,
    })
  );
}

describe('editorToPayload', () => {
  describe('models object processing', () => {
    it('should set models to undefined when models object has only empty values', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];

      const result = editorToPayload(nodes, edges);

      expect(result.subAgents.agent1.models).toBeUndefined();
    });

    it('should set models to undefined when models object has only whitespace values', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];

      const result = editorToPayload(nodes, edges);

      expect(result.subAgents.agent1.models).toBeUndefined();
    });

    it('should include models object when model field has a value', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];
      const models = {
        base: { model: 'gpt-4' },
      };
      const result = editorToPayload(nodes, edges, undefined, undefined, undefined, undefined, {
        agent1: createSubAgentFormValue('agent1', {
          models,
        }),
      });

      expect(result.subAgents.agent1.models).toEqual(models);
    });

    it('should include models object when structuredOutput has a value', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];
      const models = {
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
      };
      const result = editorToPayload(nodes, edges, undefined, undefined, undefined, undefined, {
        agent1: createSubAgentFormValue('agent1', {
          name: 'Test Agent',
          prompt: 'Test instructions',
          models,
        }),
      });

      expect(result.subAgents.agent1.models).toEqual(models);
    });

    it('should include models object when summarizer has a value', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];
      const models = {
        summarizer: { model: 'gpt-3.5-turbo' },
      };
      const result = editorToPayload(nodes, edges, undefined, undefined, undefined, undefined, {
        agent1: createSubAgentFormValue('agent1', {
          models,
        }),
      });

      expect(result.subAgents.agent1.models).toEqual(models);
    });

    it('should include all fields when they have values', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];

      const models = {
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
        summarizer: { model: 'gpt-3.5-turbo' },
      };

      const result = editorToPayload(nodes, edges, undefined, undefined, undefined, undefined, {
        agent1: createSubAgentFormValue('agent1', {
          models,
        }),
      });

      expect(result.subAgents.agent1.models).toEqual(models);
    });

    it('should set models to undefined when no models data is provided', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];
      const edges: Edge[] = [];

      const result = editorToPayload(nodes, edges);

      expect(result.subAgents.agent1.models).toBeUndefined();
    });
  });

  describe('selectedTools processing', () => {
    it('should transfer selectedTools from mcpRelations using node id key', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges, {
        mcp1: {
          selectedTools: ['tool1', 'tool2'],
        },
      });

      expect(result.subAgents.agent1.canUse).toBeDefined();
      expect(result.subAgents.agent1.canUse).toHaveLength(1);
      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: ['tool1', 'tool2'],
        headers: null,
        toolPolicies: null,
      });
    });

    it('should handle null selectedTools (all tools selected)', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges, {
        mcp1: {
          selectedTools: null,
        },
      });

      // When selectedTools is null, all tools should be selected (toolSelection: null)
      expect(result.subAgents.agent1.canUse).toBeDefined();
      expect(result.subAgents.agent1.canUse).toHaveLength(1);
      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null,
        headers: null,
        toolPolicies: null,
      });
    });

    it('should handle empty selectedTools array (no tools selected)', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges, {
        mcp1: {
          selectedTools: [],
        },
      });

      expect(result.subAgents.agent1.canUse).toBeDefined();
      expect(result.subAgents.agent1.canUse).toHaveLength(1);
      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: [],
        headers: null,
        toolPolicies: null,
      });
    });

    it('should default to all tools selected when selectedTools is missing', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges);

      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null,
        headers: null,
        toolPolicies: null,
      });
    });

    it('should serialize explicit null MCP relation data from RHF', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges, {
        mcp1: {
          relationshipId: 'rel-1',
          selectedTools: null,
          headers: null,
          toolPolicies: null,
        },
      });

      expect(result.subAgents.agent1.canUse).toBeDefined();
      expect(result.subAgents.agent1.canUse).toHaveLength(1);
      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null,
        headers: null,
        toolPolicies: null,
        agentToolRelationId: 'rel-1',
      });
    });

    it('should require explicit RHF relation state for connected MCP nodes', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      expect(() =>
        editorToPayloadInternal(nodes, edges, {
          mcpRelations: {},
          functionTools: {},
          externalAgents: {},
          teamAgents: {},
          subAgents: {
            agent1: {
              id: 'agent1',
              name: 'Test Agent',
              description: '',
              prompt: 'Test instructions',
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
            },
          },
          functions: {},
        })
      ).toThrow('Missing RHF MCP relation data for node "mcp1".');
    });

    it('should transfer toolPolicies from mcpRelations', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'mcp1',
          type: NodeType.MCP,
          position: { x: 200, y: 0 },
          data: {
            toolId: 'mcp1',
          },
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

      const result = editorToPayload(nodes, edges, {
        mcp1: {
          selectedTools: ['tool1', 'tool2'],
          toolPolicies: {
            tool1: { needsApproval: true },
            tool2: { needsApproval: false },
          },
        },
      });

      expect(result.subAgents.agent1.canUse).toBeDefined();
      expect(result.subAgents.agent1.canUse).toHaveLength(1);
      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: ['tool1', 'tool2'],
        headers: null,
        toolPolicies: {
          tool1: { needsApproval: true },
          tool2: { needsApproval: false },
        },
      });
    });
  });

  describe('non-MCP relation form state', () => {
    it('should use RHF function tool policies when serializing canUse', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
            subAgentId: null,
            relationshipId: null,
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-agent-function',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'function-node-1',
        },
      ];

      const result = editorToPayload(nodes, edges, undefined, {
        'function-tool-1': {
          id: 'function-tool-1',
          name: 'Lookup customer',
          tempToolPolicies: {
            '*': { needsApproval: true },
          },
        },
      } as any);

      expect(result.subAgents.agent1.canUse).toEqual([
        {
          toolId: 'function-tool-1',
          toolSelection: null,
          headers: null,
          toolPolicies: {
            '*': { needsApproval: true },
          },
        },
      ]);
    });

    it('should omit function tool policies when form state is missing', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
            subAgentId: null,
            relationshipId: null,
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-agent-function',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'function-node-1',
        },
      ];

      const result = editorToPayload(nodes, edges);

      expect(result.subAgents.agent1.canUse).toEqual([
        {
          toolId: 'function-tool-1',
          toolSelection: null,
          headers: null,
        },
      ]);
    });

    it('should use shared external and team agent headers for delegation relationships', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'external-node-1',
          type: NodeType.ExternalAgent,
          position: { x: 300, y: -100 },
          data: {
            externalAgentId: 'external-1',
            relationshipId: 'ext-rel-1',
          },
        },
        {
          id: 'team-node-1',
          type: NodeType.TeamAgent,
          position: { x: 300, y: 100 },
          data: {
            teamAgentId: 'team-1',
            relationshipId: 'team-rel-1',
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-ext',
          type: EdgeType.A2AExternal,
          source: 'agent1',
          target: 'external-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
        {
          id: 'edge-team',
          type: EdgeType.A2ATeam,
          source: 'agent1',
          target: 'team-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
      ];

      const result = editorToPayload(
        nodes,
        edges,
        undefined,
        undefined,
        {
          'external-1': createExternalAgentFormValue('external-1', {
            headers: { authorization: 'Bearer external-token' },
          }),
        },
        {
          'team-1': createTeamAgentFormValue('team-1', {
            headers: { authorization: 'Bearer team-token' },
          }),
        }
      );

      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        externalAgentId: 'external-1',
        headers: { authorization: 'Bearer external-token' },
        subAgentExternalAgentRelationId: 'ext-rel-1',
      });
      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        agentId: 'team-1',
        headers: { authorization: 'Bearer team-token' },
        subAgentTeamAgentRelationId: 'team-rel-1',
      });
    });

    it('serializes delegations using external and team agent ids from node data', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: '7ubfdp65rn5qvh7l788ae',
          type: NodeType.ExternalAgent,
          position: { x: 300, y: -100 },
          data: {
            externalAgentId: 'external-1',
            relationshipId: 'ext-rel-1',
          },
        },
        {
          id: 'sxi5bgmobt6kl3i8cnxn7',
          type: NodeType.TeamAgent,
          position: { x: 300, y: 100 },
          data: {
            teamAgentId: 'team-1',
            relationshipId: 'team-rel-1',
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-ext',
          type: EdgeType.A2AExternal,
          source: 'agent1',
          target: '7ubfdp65rn5qvh7l788ae',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
        {
          id: 'edge-team',
          type: EdgeType.A2ATeam,
          source: 'agent1',
          target: 'sxi5bgmobt6kl3i8cnxn7',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
      ];

      const result = editorToPayload(
        nodes,
        edges,
        undefined,
        undefined,
        {
          'external-1': createExternalAgentFormValue('external-1', {
            headers: { authorization: 'Bearer external-token' },
          }),
        },
        {
          'team-1': createTeamAgentFormValue('team-1', {
            headers: { authorization: 'Bearer team-token' },
          }),
        }
      );

      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        externalAgentId: 'external-1',
        headers: { authorization: 'Bearer external-token' },
        subAgentExternalAgentRelationId: 'ext-rel-1',
      });
      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        agentId: 'team-1',
        headers: { authorization: 'Bearer team-token' },
        subAgentTeamAgentRelationId: 'team-rel-1',
      });
    });

    it('shares external and team agent headers across connected subagents', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'agent2',
          type: NodeType.SubAgent,
          position: { x: 0, y: 200 },
          data: {},
        },
        {
          id: 'external-node-1',
          type: NodeType.ExternalAgent,
          position: { x: 300, y: -100 },
          data: {
            externalAgentId: 'external-1',
            relationshipId: null,
          },
        },
        {
          id: 'team-node-1',
          type: NodeType.TeamAgent,
          position: { x: 300, y: 100 },
          data: {
            teamAgentId: 'team-1',
            relationshipId: null,
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-ext-1',
          type: EdgeType.A2AExternal,
          source: 'agent1',
          target: 'external-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
        {
          id: 'edge-ext-2',
          type: EdgeType.A2AExternal,
          source: 'agent2',
          target: 'external-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
        {
          id: 'edge-team-1',
          type: EdgeType.A2ATeam,
          source: 'agent1',
          target: 'team-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
        {
          id: 'edge-team-2',
          type: EdgeType.A2ATeam,
          source: 'agent2',
          target: 'team-node-1',
          data: {
            relationships: {
              transferTargetToSource: false,
              transferSourceToTarget: false,
              delegateTargetToSource: false,
              delegateSourceToTarget: true,
            },
          },
        },
      ];

      const result = editorToPayload(
        nodes,
        edges,
        undefined,
        undefined,
        {
          'external-1': createExternalAgentFormValue('external-1', {
            headers: { authorization: 'Bearer shared-external' },
          }),
        },
        {
          'team-1': createTeamAgentFormValue('team-1', {
            headers: { authorization: 'Bearer shared-team' },
          }),
        },
        undefined,
        undefined
      );

      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        externalAgentId: 'external-1',
        headers: { authorization: 'Bearer shared-external' },
      });
      expect(result.subAgents.agent2.canDelegateTo).toContainEqual({
        externalAgentId: 'external-1',
        headers: { authorization: 'Bearer shared-external' },
      });
      expect(result.subAgents.agent1.canDelegateTo).toContainEqual({
        agentId: 'team-1',
        headers: { authorization: 'Bearer shared-team' },
      });
      expect(result.subAgents.agent2.canDelegateTo).toContainEqual({
        agentId: 'team-1',
        headers: { authorization: 'Bearer shared-team' },
      });
    });
  });

  describe('function tool serialization', () => {
    it('should include empty functionTools and functions records when no function tool nodes exist', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];

      const result = editorToPayload(nodes, []);

      expect(result.functionTools).toEqual({});
      expect(result.functions).toEqual({});
    });

    it('should preserve live function tool nodes from form data during serialization', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
            subAgentId: null,
            relationshipId: null,
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-agent-function',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'function-node-1',
        },
      ];

      const formData = {
        subAgents: {
          agent1: {
            id: 'agent1',
            name: 'Current agent name',
            description: 'Current description',
            prompt: 'Current prompt',
            dataComponents: [],
            artifactComponents: [],
            skills: [],
            type: 'internal',
          },
        },
        functionTools: {
          'function-tool-1': {
            functionId: 'function-1',
            name: 'Lookup customer',
            description: 'Looks up customer information',
          },
        },
        functions: {
          'function-1': {
            executeCode: 'async function execute() { return { ok: true }; }',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string' },
              },
              required: ['customerId'],
            },
            dependencies: {
              axios: '^1.7.0',
            },
          },
        },
        externalAgents: {},
        teamAgents: {},
      } as any;

      const result = editorToPayload(
        nodes,
        edges,
        undefined,
        formData.functionTools,
        formData.externalAgents,
        formData.teamAgents,
        formData.subAgents,
        formData.functions
      );

      expect(result.subAgents.agent1.name).toBe('Current agent name');
      expect(result.functionTools).toEqual({
        'function-tool-1': {
          id: 'function-tool-1',
          name: 'Lookup customer',
          description: 'Looks up customer information',
          functionId: 'function-1',
        },
      });
      expect(result.functions).toEqual({
        'function-1': {
          id: 'function-1',
          executeCode: 'async function execute() { return { ok: true }; }',
          inputSchema: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
            },
            required: ['customerId'],
          },
          dependencies: {
            axios: '^1.7.0',
          },
        },
      });
    });

    it('should hydrate sub-agent ids before reconciling the saved graph', () => {
      const tempNodeId = '1uod8ks26jpu729czv0z4';
      const nodes: Node[] = [
        {
          id: tempNodeId,
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'weather-node',
          type: NodeType.MCP,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'weather',
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-weather',
          type: EdgeType.Default,
          source: tempNodeId,
          target: 'weather-node',
        },
      ];

      const formData = {
        subAgents: {
          [tempNodeId]: {
            id: 'sub-agent1',
            name: 'Sub Agent 1',
            description: '',
            prompt: 'Current prompt',
            dataComponents: [],
            artifactComponents: [],
            skills: [],
            type: 'internal',
          },
        },
        functionTools: {},
        functions: {},
        externalAgents: {},
        teamAgents: {},
      } as any;

      const result = syncSavedAgentGraph({
        nodes,
        edges,
        nodeId: null,
        edgeId: 'edge-weather',
        subAgentFormData: formData.subAgents,
        savedAgent: {
          id: 'agent-1',
          name: 'Agent',
          description: '',
          prompt: '',
          contextConfig: null,
          statusUpdates: null,
          stopWhen: null,
          models: {},
          defaultSubAgentId: 'sub-agent1',
          subAgents: {
            'sub-agent1': {
              id: 'sub-agent1',
              name: 'Sub Agent 1',
              description: '',
              prompt: 'Current prompt',
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

      expect(result.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'sub-agent1',
          }),
        ])
      );
      expect(result.edges).toEqual([
        expect.objectContaining({
          id: 'edge-weather',
          source: 'sub-agent1',
          target: 'mcp:relation-1',
          selected: true,
        }),
      ]);
    });

    it('should serialize connected function tool nodes into functionTools and functions', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
            subAgentId: null,
            relationshipId: null,
          },
        },
      ];

      const edges: Edge[] = [
        {
          id: 'edge-agent-function',
          type: EdgeType.Default,
          source: 'agent1',
          target: 'function-node-1',
        },
      ];

      const result = editorToPayload(
        nodes,
        edges,
        undefined,
        {
          'function-tool-1': {
            functionId: 'function-1',
            name: 'Lookup customer',
            description: 'Looks up customer information',
          },
        } as any,
        undefined,
        undefined,
        undefined,
        {
          'function-1': {
            executeCode: 'async function execute() { return { ok: true }; }',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string' },
              },
              required: ['customerId'],
            },
            dependencies: {
              axios: '^1.7.0',
            },
          },
        } as any
      );

      expect(result.subAgents.agent1.canUse).toEqual([
        {
          toolId: 'function-tool-1',
          toolSelection: null,
          headers: null,
        },
      ]);
      expect(result.functionTools).toEqual({
        'function-tool-1': {
          id: 'function-tool-1',
          name: 'Lookup customer',
          description: 'Looks up customer information',
          functionId: 'function-1',
        },
      });
      expect(result.functions).toEqual({
        'function-1': {
          id: 'function-1',
          executeCode: 'async function execute() { return { ok: true }; }',
          inputSchema: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
            },
            required: ['customerId'],
          },
          dependencies: {
            axios: '^1.7.0',
          },
        },
      });
    });

    it('should serialize defaultSubAgentNodeId to the persisted defaultSubAgentId', () => {
      const tempNodeId = 'temp-node-id';
      const result = editorToPayload(
        [
          {
            id: tempNodeId,
            type: NodeType.SubAgent,
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        [],
        undefined,
        undefined,
        undefined,
        undefined,
        {
          [tempNodeId]: {
            id: 'persisted-agent-id',
            name: 'Sub Agent',
            description: '',
            prompt: 'Hi',
            dataComponents: [],
            artifactComponents: [],
            skills: [],
            type: 'internal',
          },
        } as any,
        undefined,
        tempNodeId
      );

      expect(result.defaultSubAgentId).toBe('persisted-agent-id');
    });
  });
});
