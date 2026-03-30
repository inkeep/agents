import fs from 'node:fs';
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

  it('should generate function tools inside tools directory and not include them in project tools', async () => {
    const project: FullProjectDefinition = {
      id: 'dima',
      name: 'dima',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
        summarizer: { model: 'anthropic/claude-sonnet-4-5' },
        structuredOutput: { model: 'anthropic/claude-sonnet-4-5' },
      },
      agents: {
        test: {
          id: 'test',
          name: 'test',
          defaultSubAgentId: 'nfbsyhwenholyhw1l4fdq',
          subAgents: {
            nfbsyhwenholyhw1l4fdq: {
              id: 'nfbsyhwenholyhw1l4fdq',
              name: '',
              canDelegateTo: [
                {
                  externalAgentId: 'DBDeFYIGS6UYcmDltDpzT',
                  subAgentExternalAgentRelationId: 'jMzpC4kjQSt6uzhUNvFYX',
                },
              ],
              canUse: [
                {
                  agentToolRelationId: 'cc6m96ttdbtpok2dan7kh',
                  toolId: 'nny9fps6tsscpphwutqzp',
                },
              ],
            },
          },
          externalAgents: {
            DBDeFYIGS6UYcmDltDpzT: {
              id: 'DBDeFYIGS6UYcmDltDpzT',
              name: 'test',
              baseUrl: 'https://test.com',
            },
          },
          functionTools: {
            nny9fps6tsscpphwutqzp: {
              id: 'nny9fps6tsscpphwutqzp',
              name: 'hello',
              functionId: 'nny9fps6tsscpphwutqzp',
            },
          },
          functions: {
            nny9fps6tsscpphwutqzp: {
              id: 'nny9fps6tsscpphwutqzp',
              executeCode: 'async function hello() {\n  return true\n}',
            },
          },
        },
      },
      tools: {
        '708x7fahp5rxe4fzwy1fy': {
          id: '708x7fahp5rxe4fzwy1fy',
          name: 'Atlassian',
          config: {
            mcp: {
              server: { url: 'https://mcp.atlassian.com/v1/sse' },
            },
            type: 'mcp',
          },
        },
      },
      functions: {
        nny9fps6tsscpphwutqzp: {
          id: 'nny9fps6tsscpphwutqzp',
          inputSchema: {},
          executeCode: 'async function hello() {\n  return true\n}',
        },
      },
      externalAgents: {
        DBDeFYIGS6UYcmDltDpzT: {
          id: 'DBDeFYIGS6UYcmDltDpzT',
          name: 'test',
          baseUrl: 'https://test.com',
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const toolPath = path.join(projectPaths.toolsDir, 'hello.ts');
    expect(fs.existsSync(toolPath)).toBe(true);

    const indexFilePath = path.join(testDir, 'index.ts');
    const { default: indexFile } = await import(`${indexFilePath}?raw`);

    // No function tool in tools list
    expect(indexFile).toContain("import { atlassianTool } from './tools/atlassian';");
    expect(indexFile).not.toContain("from './tools/hello';");
    expect(indexFile).toContain('tools: () => [atlassianTool],');
    // External agents
    expect(indexFile).toContain("import { testAgent } from './external-agents/test';");
    expect(indexFile).toContain('externalAgents: () => [testAgent],');
    expect(fs.existsSync(path.join(projectPaths.externalAgentsDir, 'test.ts'))).toBe(true);

    const { default: toolFile } = await import(`${toolPath}?raw`);
    expect(toolFile).toContain('export const helloTool = functionTool({');

    const subAgentPath = path.join(
      projectPaths.agentsDir,
      'sub-agents',
      'nfbsyhwenholyhw1l4fdq.ts'
    );
    const { default: subAgentFile } = await import(`${subAgentPath}?raw`);
    expect(subAgentFile).toContain("import { testAgent } from '../../external-agents/test';");
    expect(subAgentFile).toContain('canDelegateTo: () => [testAgent],');
  });
  it('should handle name collision with sdk', async () => {
    const project: FullProjectDefinition = {
      id: 'dima',
      name: 'dima',
      description: '',
      models: {
        base: { model: 'anthropic/claude-sonnet-4-5' },
        summarizer: { model: 'anthropic/claude-sonnet-4-5' },
        structuredOutput: { model: 'anthropic/claude-sonnet-4-5' },
      },
      stopWhen: {},
      agents: {
        test: {
          id: 'test',
          name: 'test',
          description: '',
          defaultSubAgentId: 'nfbsyhwenholyhw1l4fdq',
          subAgents: {
            nfbsyhwenholyhw1l4fdq: {
              id: 'nfbsyhwenholyhw1l4fdq',
              name: '',
              description: '',
              prompt: '',
              models: { base: { model: 'openai/gpt-5.2' } },
              stopWhen: null,
              canTransferTo: [],
              canDelegateTo: [
                {
                  externalAgentId: 'DBDeFYIGS6UYcmDltDpzT',
                  subAgentExternalAgentRelationId: 'jMzpC4kjQSt6uzhUNvFYX',
                  headers: null,
                },
              ],
              skills: [],
              dataComponents: [],
              artifactComponents: [],
              canUse: [
                {
                  agentToolRelationId: 'cc6m96ttdbtpok2dan7kh',
                  toolId: 'nny9fps6tsscpphwutqzp',
                  toolSelection: null,
                  headers: null,
                  toolPolicies: { '*': { needsApproval: true } },
                },
              ],
            },
          },
          createdAt: '2026-02-24T13:11:26.802Z',
          updatedAt: '2026-03-03T13:50:45.247Z',
          externalAgents: {
            DBDeFYIGS6UYcmDltDpzT: {
              id: 'DBDeFYIGS6UYcmDltDpzT',
              name: 'test',
              description: '',
              baseUrl: 'https://test.com',
              credentialReferenceId: null,
              type: 'external',
            },
          },
          models: { base: { model: 'openai/gpt-5.2' } },
          stopWhen: { transferCountIs: 10 },
          contextConfig: {
            id: '4gfukvxnsg68w1fnurt21',
            headersSchema: null,
            contextVariables: { hello: 222 },
          },
          tools: {},
          functionTools: {
            nny9fps6tsscpphwutqzp: {
              id: 'nny9fps6tsscpphwutqzp',
              name: 'Function Tool',
              description: '',
              functionId: 'nny9fps6tsscpphwutqzp',
            },
          },
          functions: {
            nny9fps6tsscpphwutqzp: {
              id: 'nny9fps6tsscpphwutqzp',
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
              executeCode: 'async function hello() {\n  return true\n}',
              dependencies: {},
            },
          },
        },
      },
      tools: {
        '708x7fahp5rxe4fzwy1fy': {
          tenantId: 'default',
          id: '708x7fahp5rxe4fzwy1fy',
          projectId: 'dima',
          name: 'Atlassian',
          description: null,
          config: {
            mcp: {
              server: { url: 'https://mcp.atlassian.com/v1/sse' },
              transport: { type: 'sse' },
            },
            type: 'mcp',
          },
          credentialReferenceId: null,
          credentialScope: 'user',
          headers: null,
          imageUrl: null,
          capabilities: {},
          lastError:
            'Authentication required - OAuth login needed. SSE error: Non-200 status code (401)',
          isWorkApp: false,
          createdAt: '2026-03-02 15:19:43.186',
          updatedAt: '2026-03-03 07:55:01.843',
        },
      },
      functions: {
        nny9fps6tsscpphwutqzp: {
          tenantId: 'default',
          id: 'nny9fps6tsscpphwutqzp',
          projectId: 'dima',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          executeCode: 'async function hello() {\n  return true\n}',
          dependencies: {},
          createdAt: '2026-02-25 21:25:57.161',
          updatedAt: '2026-03-03 13:50:45.128',
        },
      },
      externalAgents: {
        DBDeFYIGS6UYcmDltDpzT: {
          tenantId: 'default',
          id: 'DBDeFYIGS6UYcmDltDpzT',
          projectId: 'dima',
          name: 'test',
          description: '',
          baseUrl: 'https://test.com',
          credentialReferenceId: null,
          createdAt: '2026-03-03 13:50:23.783452',
          updatedAt: '2026-03-03 13:50:23.783452',
        },
      },
      dataComponents: null,
      artifactComponents: null,
      credentialReferences: {
        m8qdvl093wgdj3qggcw64: {
          tenantId: 'default',
          id: 'm8qdvl093wgdj3qggcw64',
          projectId: 'dima',
          name: 'Atlassian',
          type: 'nango',
          credentialStoreId: 'nango-default',
          retrievalParams: {
            authMode: 'OAUTH2',
            provider: 'mcp-generic',
            connectionId: 'b39c1a51-d967-4e26-a6a2-c03fc0d9fc99',
            providerConfigKey: 'atlassian_708x',
          },
          toolId: '708x7fahp5rxe4fzwy1fy',
          userId: 'jdDroHFmaXZtD5kz8pGpGiRKYR5TsSFF',
          createdBy: 'bryan@inkeep.com',
          createdAt: '2026-03-02 15:19:56',
          updatedAt: '2026-03-02 15:19:56',
        },
      },
      statusUpdates: null,
      functionTools: null,
      createdAt: '2026-02-24 13:11:19.958',
      updatedAt: '2026-02-24 13:11:19.958',
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const toolPath = path.join(projectPaths.toolsDir, 'function-tool.ts');
    expect(fs.existsSync(toolPath)).toBe(true);

    const subAgentFilePath = path.join(testDir, 'agents/sub-agents/nfbsyhwenholyhw1l4fdq.ts');
    const { default: subAgentFile } = await import(`${subAgentFilePath}?raw`);
    expect(subAgentFile).toContain("import { functionTool } from '../../tools/function-tool'");
    expect(subAgentFile).toContain(
      "canUse: () => [functionTool.with({ toolPolicies: { '*': { needsApproval: true } } })],"
    );

    const { default: toolFile } = await import(`${toolPath}?raw`);
    expect(toolFile).toContain('const functionTool1 = functionTool({');
    expect(toolFile).toContain('export { functionTool1 as functionTool }');
  });
});
