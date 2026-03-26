import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import {
  cleanupTestEnvironment,
  createProjectFixture,
  createTestEnvironment,
  getTestPath,
} from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    ({ testDir, projectPaths } = createTestEnvironment());
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('should export headers and add contextConfig.id', async () => {
    const project: FullProjectDefinition = {
      id: 'cegsoft',
      name: 'CEGsoft Pilot Dev',
      models: {
        base: {},
        summarizer: {},
        structuredOutput: {},
      },
      agents: {
        'tax-tools-mcp-test-agent': {
          id: 'tax-tools-mcp-test-agent',
          name: 'TaxesAI Pilot Agent',
          defaultSubAgentId: 'tax-tools-mcp-smoke-test-agent',
          subAgents: {
            'tax-tools-mcp-smoke-test-agent': {
              id: 'tax-tools-mcp-smoke-test-agent',
              name: 'Tax Tools Agent',
              canUse: [],
            },
          },
          contextConfig: {
            id: 'lv3l5skz8rddjqmagl939',
            headersSchema: {
              type: 'object',
              required: ['jwt-authentication-token', 'x-api-key'],
              properties: {
                'return-id': { type: 'string' },
                'x-api-key': { type: 'string' },
                'jwt-authentication-token': { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const contextConfigFilePath = join(testDir, 'context-configs', 'lv3l5skz8rddjqmagl939.ts');

    const { default: contextConfigFile } = await import(`${contextConfigFilePath}?raw`);

    expect(contextConfigFile).toContain('export const lv3l5skz8rddjqmagl939Headers = headers({');
    expect(contextConfigFile).toContain("contextConfig({\n  id: 'lv3l5skz8rddjqmagl939'");
    await expect(contextConfigFile).toMatchFileSnapshot(`${getTestPath()}-context-config.ts`);
  });

  it('should not leak normalized fields and should preserve code references in generated context configs', async () => {
    const project = createProjectFixture();
    project.credentialReferences = {
      'inkeep-api-key': {
        id: 'inkeep-api-key',
        name: 'Inkeep API Key',
        type: 'memory',
        credentialStoreId: 'main-store',
      },
    };

    const supportAgent = project.agents?.['support-agent'];
    const supportContext =
      supportAgent?.contextConfig && typeof supportAgent.contextConfig === 'object'
        ? supportAgent.contextConfig
        : undefined;
    const userInfo =
      supportContext?.contextVariables && typeof supportContext.contextVariables === 'object'
        ? (supportContext.contextVariables.userInfo as Record<string, unknown>)
        : undefined;

    if (supportContext) {
      supportContext.headers = 'supportContextHeaders';
      supportContext.headersSchema = {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          api_key: { type: 'string' },
        },
        required: ['user_id', 'api_key'],
      };
    }

    if (userInfo?.fetchConfig && typeof userInfo.fetchConfig === 'object') {
      userInfo.credentialReferenceId = 'inkeep-api-key';
      userInfo.fetchConfig = {
        ...userInfo.fetchConfig,
        headers: {
          Authorization: 'Bearer {{headers.api_key}}',
        },
        fallbackUrls: ['https://backup.example.com/users/{{headers.user_id}}'],
      };
    }

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const contextConfigFilePath = join(testDir, 'context-configs', 'support-context.ts');
    const { default: contextConfigFile } = await import(`${contextConfigFilePath}?raw`);

    expect(contextConfigFile).toContain(
      "import { inkeepApiKeyCredential } from '../credentials/inkeep-api-key';"
    );
    expect(contextConfigFile).toContain('credentialReference: inkeepApiKeyCredential');
    expect(contextConfigFile).toContain('headers: supportcontextheaders,');
    expect(contextConfigFile).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test assert
      'Authorization: `Bearer ${supportcontextheaders.toTemplate("api_key")}`'
    );
    expect(contextConfigFile).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test assert
      '`https://backup.example.com/users/${supportcontextheaders.toTemplate("user_id")}`'
    );
    expect(contextConfigFile).not.toContain('normalizedContextVariables');
    expect(contextConfigFile).not.toContain('normalizedHeadersReference');
  });
});
