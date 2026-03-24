import { NodeType } from '@/components/agent/configuration/node-types';
import { serializeAgentForm } from '@/components/agent/form/validation';
import { deserializeAgentData } from '@/features/agent/domain/deserialize';
import { serializeAgentData } from '@/features/agent/domain/serialize';

describe('deserializeAgentData', () => {
  function serializeWithFormData(fullAgent: any) {
    const deserialized = deserializeAgentData(fullAgent);
    const formData = serializeAgentForm(fullAgent);
    const mcpRelations = Object.fromEntries(
      Object.entries(formData.mcpRelations ?? {}).map(([key, value]) => [
        key,
        {
          ...value,
          headers: value.headers ? JSON.parse(value.headers) : undefined,
        },
      ])
    );
    const externalAgents = Object.fromEntries(
      Object.entries(formData.externalAgents ?? {}).map(([key, value]) => [
        key,
        {
          ...value,
          headers: value.headers ? JSON.parse(value.headers) : undefined,
        },
      ])
    );
    const teamAgents = Object.fromEntries(
      Object.entries(formData.teamAgents ?? {}).map(([key, value]) => [
        key,
        {
          ...value,
          headers: value.headers ? JSON.parse(value.headers) : undefined,
        },
      ])
    );

    return {
      deserialized,
      serialized: serializeAgentData(
        deserialized.nodes,
        deserialized.edges,
        mcpRelations as any,
        formData.functionTools,
        externalAgents as any,
        teamAgents as any,
        formData.subAgents as any,
        formData.functions as any,
        formData.defaultSubAgentNodeId
      ),
    };
  }

  it('keeps MCP nodes graph-focused and round-trips relation config through RHF data', () => {
    const fullAgent = {
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      defaultSubAgentId: 'sub-agent-1',
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              toolId: 'tool-1',
              toolSelection: ['search', 'summarize'],
              headers: {
                Authorization: 'Bearer token',
              },
              toolPolicies: {
                search: {
                  needsApproval: true,
                },
              },
              agentToolRelationId: 'relation-1',
            },
          ],
          canTransferTo: [],
          canDelegateTo: [],
        },
      },
      tools: {
        'tool-1': {
          id: 'tool-1',
          name: 'Project Tool',
          description: 'Tool description',
          imageUrl: 'https://example.com/tool.png',
        },
      },
    } as any;

    const { deserialized, serialized } = serializeWithFormData(fullAgent);
    const mcpNode = deserialized.nodes.find((node) => node.type === NodeType.MCP);

    expect(mcpNode?.data).toMatchObject({
      toolId: 'tool-1',
      subAgentId: 'sub-agent-1',
      relationshipId: 'relation-1',
    });
    expect(mcpNode?.id).toBe('mcp:relation-1');

    expect(serialized.subAgents['sub-agent-1'].canUse).toEqual([
      {
        toolId: 'tool-1',
        toolSelection: ['search', 'summarize'],
        headers: {
          Authorization: 'Bearer token',
        },
        toolPolicies: {
          search: {
            needsApproval: true,
          },
        },
        agentToolRelationId: 'relation-1',
      },
    ]);
  });

  it('uses deterministic ids for function tool nodes during deserialize', () => {
    const fullAgent = {
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      defaultSubAgentId: 'sub-agent-1',
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [
            {
              toolId: 'function-tool-1',
              agentToolRelationId: 'function-relation-1',
            },
          ],
          canTransferTo: [],
          canDelegateTo: [],
        },
      },
      functionTools: {
        'function-tool-1': {
          id: 'function-tool-1',
          name: 'Lookup customer',
          description: 'Looks up customer information',
          functionId: 'function-1',
        },
      },
      functions: {
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
          dependencies: {},
        },
      },
    } as any;

    const deserialized = deserializeAgentData(fullAgent);
    const functionToolNode = deserialized.nodes.find((node) => node.type === NodeType.FunctionTool);

    expect(functionToolNode?.id).toBe('function-tool:function-tool-1');
    expect(functionToolNode?.data).toMatchObject({
      toolId: 'function-tool-1',
      subAgentId: 'sub-agent-1',
      relationshipId: 'function-relation-1',
    });
  });

  it('keeps external agent nodes graph-focused and round-trips headers through RHF data', () => {
    const fullAgent = {
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      defaultSubAgentId: 'sub-agent-1',
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
          canTransferTo: [],
          canDelegateTo: [
            {
              externalAgentId: 'external-agent-1',
              headers: {
                Authorization: 'Bearer token',
              },
              subAgentExternalAgentRelationId: 'external-relation-1',
            },
          ],
        },
      },
      externalAgents: {
        'external-agent-1': {
          id: 'external-agent-1',
          name: 'External Agent',
          description: 'External description',
          baseUrl: 'https://example.com/agent',
          credentialReferenceId: null,
          headers: {
            Authorization: 'Bearer token',
          },
        },
      },
    } as any;

    const { deserialized, serialized } = serializeWithFormData(fullAgent);
    const externalAgentNode = deserialized.nodes.find(
      (node) => node.type === NodeType.ExternalAgent
    );

    expect(externalAgentNode?.data).toMatchObject({
      externalAgentId: 'external-agent-1',
      relationshipId: 'external-relation-1',
    });

    expect(serialized.subAgents['sub-agent-1'].canDelegateTo).toEqual([
      {
        externalAgentId: 'external-agent-1',
        headers: {
          Authorization: 'Bearer token',
        },
        subAgentExternalAgentRelationId: 'external-relation-1',
      },
    ]);
  });

  it('keeps team agent nodes graph-focused and round-trips headers through RHF data', () => {
    const fullAgent = {
      id: 'agent-1',
      name: 'Agent 1',
      description: '',
      defaultSubAgentId: 'sub-agent-1',
      subAgents: {
        'sub-agent-1': {
          id: 'sub-agent-1',
          name: 'Sub agent 1',
          description: '',
          prompt: 'Handle requests',
          type: 'internal',
          dataComponents: [],
          artifactComponents: [],
          canUse: [],
          canTransferTo: [],
          canDelegateTo: [
            {
              agentId: 'team-agent-1',
              headers: {
                Authorization: 'Bearer token',
              },
              subAgentTeamAgentRelationId: 'team-relation-1',
            },
          ],
        },
      },
      teamAgents: {
        'team-agent-1': {
          id: 'team-agent-1',
          name: 'Team Agent',
          description: 'Team description',
          headers: {
            Authorization: 'Bearer token',
          },
        },
      },
    } as any;

    const { deserialized, serialized } = serializeWithFormData(fullAgent);
    const teamAgentNode = deserialized.nodes.find((node) => node.type === NodeType.TeamAgent);

    expect(teamAgentNode?.data).toMatchObject({
      teamAgentId: 'team-agent-1',
      relationshipId: 'team-relation-1',
    });

    expect(serialized.subAgents['sub-agent-1'].canDelegateTo).toEqual([
      {
        agentId: 'team-agent-1',
        headers: {
          Authorization: 'Bearer token',
        },
        subAgentTeamAgentRelationId: 'team-relation-1',
      },
    ]);
  });
});
