import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import { cleanupTestEnvironment, createTestEnvironment, getTestPath } from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('should have right import path', async () => {
    const project: FullProjectDefinition = {
      id: 'andrew-test',
      name: 'andrew-test',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
        summarizer: { model: 'anthropic/claude-sonnet-4-5' },
        structuredOutput: { model: 'anthropic/claude-sonnet-4-5' },
      },
      externalAgents: {
        'test-external-agent': {
          id: 'test-external-agent',
          name: 'Test External Agent Name',
          baseUrl: 'https://test.com',
        },
      },
      agents: {
        'remove-me': {
          id: 'remove-me',
          name: 'remove-me',
        },
        sample: {
          id: 'sample',
          name: 'sample',
          defaultSubAgentId: 'pq7f4ockfcm61y9ubfhuk',
          subAgents: {
            pq7f4ockfcm61y9ubfhuk: {
              id: 'pq7f4ockfcm61y9ubfhuk',
              name: '',
              canUse: [],
            },
          },
          triggers: {
            c5pwvhm40zf7y8d8ow0wv: {
              id: 'c5pwvhm40zf7y8d8ow0wv',
              name: 'GitHub Webhook Test',
            },
            vhfn9x24dbqzvokv1g6wm: {
              id: 'vhfn9x24dbqzvokv1g6wm',
              name: 'Signed GitHub Webhook',
              signingSecretCredentialReferenceId: '5vzjrrgsrs625aeygft1u',
            },
          },
        },
        western: {
          id: 'western',
          name: 'western',
          defaultSubAgentId: 'cowboy-greeter',
          subAgents: {
            'bar-tender': {
              id: 'bar-tender',
              name: 'bar tender',
              canUse: [],
            },
            'cowboy-greeter': {
              id: 'cowboy-greeter',
              name: 'Cowboy Greeter',
              canUse: [],
            },
          },
        },
        'linear-ticket-filer': {
          id: 'linear-ticket-filer',
          name: 'Linear Ticket Filer',
          defaultSubAgentId: 'avkkjrdavvv12h0g0dpv622222',
          scheduledTriggers: {
            fj08bu36pfj1pi0p580d3: {
              id: 'fj08bu36pfj1pi0p580d3',
              name: 'my scheduled trigger',
            },
          },
          subAgents: {
            avkkjrdavvv12h0g0dpv622222: {
              id: 'avkkjrdavvv12h0g0dpv622222',
              name: '',
              canUse: [
                {
                  agentToolRelationId: 's67lldl8b9hlsrjomssso',
                  toolId: 'vzj9wh8zv14uffbw0p4dz',
                  toolPolicies: {
                    get_team: { needsApproval: true },
                    get_user: { needsApproval: true },
                  },
                },
              ],
            },
            entrypoint: {
              id: 'entrypoint',
              name: 'entrypoint',
              canUse: [],
            },
          },
          triggers: {
            '4smi15r7ng5tr59efzelt': {
              id: '4smi15r7ng5tr59efzelt',
              name: 'test',
            },
            ixltikx5eqyrjwas32938: {
              id: 'ixltikx5eqyrjwas32938',
              name: 'test',
            },
            u5lo4s7g11u1749yilmab: {
              id: 'u5lo4s7g11u1749yilmab',
              name: 'github',
            },
          },
        },
        router: {
          id: 'router',
          name: 'Router',
          defaultSubAgentId: 'router',
          subAgents: {
            router: {
              id: 'router',
              name: 'Router',
              canUse: [],
            },
          },
          createdAt: '2026-02-28T13:06:59.506Z',
          updatedAt: '2026-02-28T13:06:59.506Z',
          teamAgents: {
            'linear-ticket-filer': {
              id: 'linear-ticket-filer',
              name: 'Linear Ticket Filer',
              description: 'Help to file tickets in the linear system',
              type: 'team',
            },
            western: {
              id: 'western',
              name: 'western',
              description: 'Western Role Playing Game',
              type: 'team',
            },
            sample: {
              id: 'sample',
              name: 'sample',
              description: 'simple general purpose agent that responds friendly',
              type: 'team',
            },
          },
        },
      },
      tools: {
        vzj9wh8zv14uffbw0p4dz: {
          id: 'vzj9wh8zv14uffbw0p4dz',
          name: 'Linear',
          config: {
            mcp: {
              server: { url: 'https://mcp.linear.app/mcp' },
            },
            type: 'mcp',
          },
          credentialReferenceId: '1dapm6e7ajmw50rvw8fwp',
        },
        ha9hkex8ysfuirnmn9uin: {
          id: 'ha9hkex8ysfuirnmn9uin',
          name: 'Google Calendar MCP',
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
            },
            type: 'mcp',
          },
        },
        'notion-mcp-tool': {
          id: 'notion-mcp-tool',
          name: 'Notion',
          config: {
            mcp: {
              server: { url: 'https://mcp.notion.com/mcp' },
            },
            type: 'mcp',
          },
        },
        'google-calendar-mcp-tool': {
          id: 'google-calendar-mcp-tool',
          name: 'Google Calendar MCP',
          config: {
            mcp: {
              server: {
                url: 'https://backend.composio.dev/v3/mcp/d4124a1b-7468-4990-b684-2eeb9960a1c3',
              },
            },
            type: 'mcp',
          },
        },
        hctlvi5ebvshfch4vt5st: {
          id: 'hctlvi5ebvshfch4vt5st',
          name: 'inkeep manage mcp (Andrew Mikofalvy)',
          config: {
            mcp: {
              server: { url: 'https://manage-api.pilot.inkeep.com/mcp' },
            },
            type: 'mcp',
          },
        },
      },
      dataComponents: {
        'cowboy-greeter-ui': {
          id: 'cowboy-greeter-ui',
          name: 'Cowboy Greeter UI',
        },
      },
      credentialReferences: {
        '1dapm6e7ajmw50rvw8fwp': {
          id: '1dapm6e7ajmw50rvw8fwp',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        l331gdcj6f97xm3622ubx: {
          id: 'l331gdcj6f97xm3622ubx',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        onlr4vu2x9vjgra9ntk3v: {
          id: 'onlr4vu2x9vjgra9ntk3v',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        z4d3zyryosn7sr6btz2ut: {
          id: 'z4d3zyryosn7sr6btz2ut',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        hrdtpfr0r9bm1173edgbz: {
          id: 'hrdtpfr0r9bm1173edgbz',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        '1n4jdousjfn7w4iwnxrd0': {
          id: '1n4jdousjfn7w4iwnxrd0',
          name: 'not-the-real-secret',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        '5vzjrrgsrs625aeygft1u': {
          id: '5vzjrrgsrs625aeygft1u',
          name: 'gh-signature-secret',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        '0925fpo6wmx70yuhppy7t': {
          id: '0925fpo6wmx70yuhppy7t',
          name: 'Linear',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
        k38ttnn4yxhgem0tj2tfj: {
          id: 'k38ttnn4yxhgem0tj2tfj',
          name: 'Notion',
          type: 'nango',
          credentialStoreId: 'nango-default',
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    // Project
    const indexFilePath = join(testDir, 'index.ts');
    const { default: indexFile } = await import(`${indexFilePath}?raw`);
    expect(indexFile).toContain(
      "import { googleCalendarMcpTool } from './tools/google-calendar-mcp';"
    );
    expect(indexFile).toContain(
      "import { googleCalendarMcpTool as googleCalendarMcpTool1 } from './tools/google-calendar-mcp-1';"
    );
    expect(indexFile).toContain("import { linearCredential } from './credentials/linear';");
    expect(indexFile).toContain(
      "import { linearCredential as linearCredential1 } from './credentials/linear-1';"
    );
    await expect(indexFile).toMatchFileSnapshot(`${getTestPath()}.ts`);

    // Agent
    const agentFilePath = join(testDir, 'agents', 'linear-ticket-filer.ts');
    const { default: agentFile } = await import(`${agentFilePath}?raw`);
    expect(agentFile).toContain("import { testTrigger } from './triggers/test';");
    expect(agentFile).toContain("import { testTrigger as testTrigger1 } from './triggers/test-1';");
    await expect(agentFile).toMatchFileSnapshot(`${getTestPath()}-agent.ts`);

    // Sub Agent
    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'avkkjrdavvv12h0g0dpv622222.ts');
    const { default: subAgentFile } = await import(`${subAgentFilePath}?raw`);
    expect(subAgentFile).toContain("import { linearTool } from '../../tools/linear';");
    await expect(subAgentFile).toMatchFileSnapshot(`${getTestPath()}-sub-agent.ts`);

    // Trigger
    const triggerFilePath = join(testDir, 'agents', 'triggers', 'signed-git-hub-webhook.ts');
    const { default: triggerFile } = await import(`${triggerFilePath}?raw`);
    expect(triggerFile).toContain(
      "import { ghSignatureSecretCredential } from '../../credentials/gh-signature-secret';"
    );
    await expect(triggerFile).toMatchFileSnapshot(`${getTestPath()}-trigger.ts`);

    // MCP Tool
    const toolFilePath = join(testDir, 'tools', 'linear.ts');
    const { default: toolFile } = await import(`${toolFilePath}?raw`);
    await expect(toolFile).toMatchFileSnapshot(`${getTestPath()}-tool.ts`);

    // Environment
    const envFilePath = join(testDir, 'environments', 'index.ts');
    const { default: envFile } = await import(`${envFilePath}?raw`);
    expect(envFile).toContain("import { development } from './development.env';");
    await expect(envFile).toMatchFileSnapshot(`${getTestPath()}-env.ts`);
  });
});
