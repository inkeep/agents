import path from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import { cleanupTestEnvironment, createTestEnvironment } from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('should rename collide variables', async () => {
    const project: FullProjectDefinition = {
      id: 'chat-to-edit',
      name: 'Chat to edit',
      description: 'Chat to edit project',
      models: { base: { model: 'anthropic/claude-sonnet-4-5' } },
      stopWhen: {},
      agents: {
        'agent-builder': {
          id: 'agent-builder',
          name: 'Agent Builder',
          description: 'Build Inkeep agents using the agents framework.',
          defaultSubAgentId: 'builder',
          subAgents: {
            builder: {
              id: 'builder',
              name: 'Builder',
              prompt:
                'You are a helpful assistant that helps to build inkeep agents.\n' +
                '  This is the project information: {{projectInformation}}',
              canUse: [],
            },
            'mcp-manager': {
              id: 'mcp-manager',
              name: 'MCP Manager',
              description: 'Manages MCP tools / MCP servers',
              prompt:
                'You are a specialized agent that helps users connect and manage MCP (Model Context Protocol) servers.',
              canUse: [],
            },
          },
          prompt:
            'You are a helpful assistant that helps to build inkeep agents.\n' +
            '  You are operating in the context of the target tenantId=[{{headers.x-target-tenant-id}}]',
          stopWhen: { transferCountIs: 10 },
          contextConfig: {
            id: 'builder',
            headersSchema: {
              type: 'object',
              required: [],
              properties: {},
              additionalProperties: false,
            },
            contextVariables: {
              coreConcepts: {
                id: 'llmsTxt',
                trigger: 'initialization',
                fetchConfig: { url: 'https://docs.inkeep.com/api/docs/fragments' },
                responseSchema: { type: 'string' },
              },
              projectInformation: {
                id: 'fetchProjectInformation',
                trigger: 'initialization',
                fetchConfig: {
                  url: 'https://api.agents.inkeep.com/tenants/{{headers.x-target-tenant-id}}/project-full/{{headers.x-target-project-id}}',
                  headers: {
                    'x-forwarded-cookie': '{{headers.x-forwarded-cookie}}',
                  },
                },
                responseSchema: {},
              },
              conversationHistory: {
                id: 'fetchConversationHistory',
                trigger: 'initialization',
                fetchConfig: {
                  url: 'https://api.agents.inkeep.com/tenants/{{headers.x-target-tenant-id}}/projects/{{headers.x-target-project-id}}/conversations/{{headers.x-inkeep-from-conversation-id}}',
                  method: 'GET',
                  headers: {
                    'x-forwarded-cookie': '{{headers.x-forwarded-cookie}}',
                  },
                  transform: 'data.formatted.llmContext',
                  requiredToFetch: ['{{headers.x-inkeep-from-conversation-id}}'],
                },
                defaultValue: 'There is no specific conversation that triggered this session.',
                responseSchema: {},
              },
            },
          },
          tools: {
            ievpj18mulm7nrg4x2tiw: {
              id: 'ievpj18mulm7nrg4x2tiw',
              name: 'agents-mcp',
              description: null,
              config: {
                mcp: {
                  server: { url: 'https://api.agents.inkeep.com/mcp' },
                },
                type: 'mcp',
              },
            },
          },
          functionTools: {},
        },
      },
      tools: {
        ievpj18mulm7nrg4x2tiw: {
          tenantId: 'default',
          id: 'ievpj18mulm7nrg4x2tiw',
          projectId: 'chat-to-edit',
          name: 'agents-mcp',
          description: null,
          config: {
            mcp: {
              prompt: '',
              server: { url: 'https://api.agents.inkeep.com/mcp' },
              transport: { type: 'streamable_http' },
              toolOverrides: {},
            },
            type: 'mcp',
          },
        },
        '5p864wmg6ckv1nf4wj3ar': {
          tenantId: 'default',
          id: '5p864wmg6ckv1nf4wj3ar',
          projectId: 'chat-to-edit',
          name: 'manage inkeep (Andrew Mikofalvy) (Andrew Mikofalvy) (Andrew Mikofalvy)',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://app.getgram.ai/mcp/inkeep-loti5' },
              transport: { type: 'streamable_http' },
              activeTools: ['inkeep_manage_update_tool'],
            },
            type: 'mcp',
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const subAgentPath = path.join(projectPaths.agentsDir, 'sub-agents/builder.ts');
    const subAgentPath2 = path.join(projectPaths.agentsDir, 'agent-builder.ts');
    const { default: subAgentFile } = await import(`${subAgentPath}?raw`);
    expect(subAgentFile).toContain(
      "import { builder as builderContextConfig } from '../../context-configs/builder';"
    );
    expect(subAgentFile).toContain('builderContextConfig.toTemplate("projectInformation")');
    expect(subAgentFile).toContain('export const builder = subAgent({');
    const { default: subAgentFile2 } = await import(`${subAgentPath2}?raw`);
    expect(subAgentFile2).toContain(
      "import { builder as builderContextConfig, builderHeaders } from '../context-configs/builder';"
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: test inserting variable in template
    expect(subAgentFile2).toContain('${builderHeaders.toTemplate("x-target-tenant-id")}');
  });
});
