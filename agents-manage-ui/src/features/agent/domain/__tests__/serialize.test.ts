import type { Edge, Node } from '@xyflow/react';
import { EdgeType } from '@/components/agent/configuration/edge-types';
import type { AgentNodeData } from '@/components/agent/configuration/node-types';
import { NodeType } from '@/components/agent/configuration/node-types';
import { serializeAgentData } from '../serialize';
import { syncSavedAgentGraph } from '../sync-saved-agent-graph';

describe('serializeAgentData', () => {
  describe('models object processing', () => {
    it('should set models to undefined when models object has only empty values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toBeUndefined();
    });

    it('should set models to undefined when models object has only whitespace values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toBeUndefined();
    });

    it('should include models object when model field has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: undefined,
        summarizer: undefined,
      });
    });

    it('should include models object when structuredOutput has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toEqual({
        base: undefined,
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
        summarizer: undefined,
      });
    });

    it('should include models object when summarizer has a value', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toEqual({
        base: undefined,
        structuredOutput: undefined,
        summarizer: { model: 'gpt-3.5-turbo' },
      });
    });

    it('should include all fields when they have values', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            skills: [],
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.models).toEqual({
        base: { model: 'gpt-4' },
        structuredOutput: { model: 'gpt-4o-2024-08-06' },
        summarizer: { model: 'gpt-3.5-turbo' },
      });
    });

    it('should set models to undefined when no models data is provided', () => {
      const nodes: Node<AgentNodeData>[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
            // no models property
          },
        },
      ];
      const edges: Edge[] = [];

      const result = serializeAgentData(nodes, edges);

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

      const result = serializeAgentData(nodes, edges, {
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

      const result = serializeAgentData(nodes, edges, {
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

      const result = serializeAgentData(nodes, edges, {
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

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.canUse[0]).toEqual({
        toolId: 'mcp1',
        toolSelection: null,
        headers: null,
        toolPolicies: null,
      });
    });

    it('should default MCP relation data to `null` when `mcpRelations` is missing', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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
            relationshipId: 'rel-1',
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

      const result = serializeAgentData(nodes, edges);

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

    it('should transfer toolPolicies from mcpRelations', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
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

      const result = serializeAgentData(nodes, edges, {
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
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
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

      const result = serializeAgentData(nodes, edges, undefined, {
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
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
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

      const result = serializeAgentData(nodes, edges);

      expect(result.subAgents.agent1.canUse).toEqual([
        {
          toolId: 'function-tool-1',
          toolSelection: null,
          headers: null,
        },
      ]);
    });

    it('should use RHF external/team headers for delegation relationships', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
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

      const result = serializeAgentData(
        nodes,
        edges,
        undefined,
        undefined,
        {
          'external-1': {
            id: 'external-1',
            name: 'External Agent',
            baseUrl: 'https://example.com',
            headers: { authorization: 'Bearer external-token' },
          },
        } as any,
        {
          'team-1': {
            id: 'team-1',
            name: 'Team Agent',
            description: '',
            headers: { authorization: 'Bearer team-token' },
          },
        } as any
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
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
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

      const result = serializeAgentData(
        nodes,
        edges,
        undefined,
        undefined,
        {
          'external-1': {
            id: 'external-1',
            name: 'External Agent',
            baseUrl: 'https://example.com',
            headers: { authorization: 'Bearer external-token' },
          },
        } as any,
        {
          'team-1': {
            id: 'team-1',
            name: 'Team Agent',
            description: '',
            headers: { authorization: 'Bearer team-token' },
          },
        } as any
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
  });

  describe('function tool serialization', () => {
    it('should include empty functionTools and functions records when no function tool nodes exist', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
        },
      ];

      const result = serializeAgentData(nodes, []);

      expect(result.functionTools).toEqual({});
      expect(result.functions).toEqual({});
    });

    it('should preserve live function tool nodes from form data during serialization', () => {
      const nodes: Node[] = [
        {
          id: 'agent1',
          type: NodeType.SubAgent,
          position: { x: 0, y: 0 },
          data: {
            id: 'agent1',
            name: 'Stale agent name',
            prompt: 'Stale prompt',
            skills: [],
          },
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
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

      const result = serializeAgentData(
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
          data: {
            id: tempNodeId,
            name: 'Stale sub agent',
            prompt: 'Stale prompt',
            skills: [],
          },
        },
        {
          id: 'weather-node',
          type: NodeType.MCP,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'weather',
            subAgentId: tempNodeId,
            relationshipId: null,
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
          target: 'weather-node',
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
          data: {
            id: 'agent1',
            name: 'Test Agent',
            prompt: 'Test instructions',
            skills: [],
          },
        },
        {
          id: 'function-node-1',
          type: NodeType.FunctionTool,
          position: { x: 300, y: 0 },
          data: {
            toolId: 'function-tool-1',
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

      const result = serializeAgentData(
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
      const result = serializeAgentData(
        [
          {
            id: tempNodeId,
            type: NodeType.SubAgent,
            position: { x: 0, y: 0 },
            data: {
              id: tempNodeId,
              name: 'Sub Agent',
              prompt: 'Hi',
              skills: [],
            },
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
