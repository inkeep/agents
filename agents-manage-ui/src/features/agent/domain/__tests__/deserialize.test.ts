import { NodeType } from '@/components/agent/configuration/node-types';
import { deserializeAgentData } from '@/features/agent/domain/deserialize';
import { serializeAgentData } from '@/features/agent/domain/serialize';

describe('deserializeAgentData', () => {
  it('hydrates MCP relation config onto node data so it round-trips without a lookup', () => {
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

    const deserialized = deserializeAgentData(fullAgent);
    const mcpNode = deserialized.nodes.find((node) => node.type === NodeType.MCP);

    expect(mcpNode?.data).toMatchObject({
      relationshipId: 'relation-1',
      tempSelectedTools: ['search', 'summarize'],
      tempHeaders: {
        Authorization: 'Bearer token',
      },
      tempToolPolicies: {
        search: {
          needsApproval: true,
        },
      },
    });

    const serialized = serializeAgentData(deserialized.nodes, deserialized.edges);

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

  it('hydrates external agent headers onto node data so it round-trips without a lookup', () => {
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
        },
      },
    } as any;

    const deserialized = deserializeAgentData(fullAgent);
    const externalAgentNode = deserialized.nodes.find(
      (node) => node.type === NodeType.ExternalAgent
    );

    expect(externalAgentNode?.data).toMatchObject({
      relationshipId: 'external-relation-1',
      tempHeaders: {
        Authorization: 'Bearer token',
      },
    });

    const serialized = serializeAgentData(deserialized.nodes, deserialized.edges);

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
});
