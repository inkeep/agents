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
});
