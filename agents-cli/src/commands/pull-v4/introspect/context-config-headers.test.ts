import fs from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import {
  cleanupTestEnvironment,
  createTestEnvironment,
  createUnifiedDiff,
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

  it('preserves existing headers variable reference when merging context config', async () => {
    const project: FullProjectDefinition = {
      id: 'headers-project',
      name: 'Headers Project',
      description: 'Project used for context headers merge regression coverage',
      models: {
        base: {
          model: 'gpt-4o-mini',
        },
      },
      agents: {
        'support-agent': {
          id: 'support-agent',
          name: 'Support Agent',
          defaultSubAgentId: 'tier-one',
          contextConfig: {
            id: 'support-context',
            headersSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                },
              },
            },
            contextVariables: {
              userInfo: {
                id: 'user-info',
                name: 'User Information',
                trigger: 'initialization',
                fetchConfig: {
                  // biome-ignore lint/suspicious/noTemplateCurlyInString: snapshot should produce template string
                  url: 'https://api.example.com/users/${headersSchema.toTemplate("user_id")}',
                  method: 'GET',
                },
                defaultValue: 'Unable to fetch user information',
                responseSchema: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          subAgents: {
            'tier-one': {
              id: 'tier-one',
              name: 'Tier One',
            },
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    fs.mkdirSync(join(testDir, 'context-configs'), { recursive: true });
    const contextConfigFilePath = join(testDir, 'context-configs', 'support-context.ts');
    const before = `import { contextConfig, fetchDefinition, headers } from '@inkeep/agents-core';
import { z } from 'zod';

const headersSchema = headers({
  schema: z.object({
    user_id: z.string().optional()
  })
});

const userInfo = fetchDefinition({
  id: 'user-info',
  name: 'User Information',
  trigger: 'initialization',
  fetchConfig: {
    url: \`https://api.example.com/users/\${headersSchema.toTemplate("user_id")}\`,
    method: 'GET'
  },
  defaultValue: 'Unable to fetch user information',
  responseSchema: z.object({
    name: z.string().optional()
  })
});

const _supportContext = contextConfig({
  id: 'support-context',
  headers: headersSchema,
  contextVariables: {
    userInfo
  }
});
`;
    fs.writeFileSync(contextConfigFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedContextConfigFile } = await import(`${contextConfigFilePath}?raw`);
    expect(mergedContextConfigFile).toContain('headers: headersSchema,');
    expect(mergedContextConfigFile).not.toContain('supportContextHeaders');
    expect(mergedContextConfigFile).toContain('const headersSchema = headers({');
    expect(mergedContextConfigFile).not.toContain('userInfo: userInfo');

    await expect(mergedContextConfigFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const contextConfigDiff = await createUnifiedDiff(
      'context-configs/support-context.ts',
      before,
      mergedContextConfigFile
    );
    await expect(contextConfigDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });

  it('injects headers schema when fetch config uses headers template variables', async () => {
    const project: FullProjectDefinition = {
      id: 'headers-template-project',
      name: 'Headers Template Project',
      description: 'Project used for headers template variable coverage',
      models: {
        base: {
          model: 'gpt-4o-mini',
        },
      },
      agents: {
        'support-agent': {
          id: 'support-agent',
          name: 'Support Agent',
          defaultSubAgentId: 'tier-one',
          contextConfig: {
            id: 'support-context',
            contextVariables: {
              timeInfo: {
                id: 'time-info',
                name: 'Time Information',
                trigger: 'invocation',
                fetchConfig: {
                  url: 'https://world-time-api3.p.rapidapi.com/timezone/{{headers.tz}}',
                  method: 'GET',
                },
                defaultValue: 'Unable to fetch timezone information',
              },
            },
          },
          subAgents: {
            'tier-one': {
              id: 'tier-one',
              name: 'Tier One',
            },
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const contextConfigFilePath = join(testDir, 'context-configs', 'support-context.ts');
    const { default: generatedContextConfigFile } = await import(`${contextConfigFilePath}?raw`);
    expect(generatedContextConfigFile).toContain(
      'import { headers, fetchDefinition, contextConfig }'
    );
    expect(generatedContextConfigFile).toContain('const supportContextHeaders = headers({');
    expect(generatedContextConfigFile).toContain('schema: z.object({ "tz": z.string() }).strict()');
    expect(generatedContextConfigFile).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test assert
      'url: `https://world-time-api3.p.rapidapi.com/timezone/${supportContextHeaders.toTemplate("tz")}`'
    );
    expect(generatedContextConfigFile).toContain('headers: supportContextHeaders');

    await expect(generatedContextConfigFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
  });
});
