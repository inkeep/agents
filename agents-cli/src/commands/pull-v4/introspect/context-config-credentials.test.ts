import fs from 'node:fs';
import { join } from 'node:path';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import {
  cleanupTestEnvironment,
  createProjectFixture,
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

  it('preserves fetchDefinition credentialReference variable when credentialReferenceId is provided', async () => {
    const project = createProjectFixture();
    project.credentialReferences = {
      'inkeep-api-key': {
        id: 'inkeep-api-key',
        name: 'Inkeep API Key',
        type: 'bearer',
        credentialStoreId: 'main-store',
      },
    };

    const supportAgent = project.agents?.['support-agent'];
    const supportContext = supportAgent?.contextConfig;
    const contextVariables =
      supportContext && typeof supportContext === 'object'
        ? supportContext.contextVariables
        : undefined;
    const userInfo =
      contextVariables && typeof contextVariables === 'object'
        ? (contextVariables.userInfo as Record<string, unknown>)
        : undefined;
    if (userInfo) {
      userInfo.credentialReferenceId = 'inkeep-api-key';
    }

    fs.mkdirSync(join(testDir, 'context-configs'), { recursive: true });
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });

    const contextConfigFilePath = join(testDir, 'context-configs', 'support-context.ts');
    const before = `import { contextConfig, fetchDefinition } from '@inkeep/agents-core';
import { z } from 'zod';
import { inkeepApiKey } from '../credentials/inkeep-api-key';

const userInfo = fetchDefinition({
  id: 'user-info',
  name: 'User Information',
  trigger: 'initialization',
  fetchConfig: {
    url: 'https://api.example.com/users/{{headers.user_id}}',
    method: 'GET'
  },
  responseSchema: z.object({
    name: z.string()
  }),
  defaultValue: 'Unable to fetch user information',
  credentialReference: inkeepApiKey
});

export const supportContext = contextConfig({
  id: 'support-context',
  contextVariables: {
    userInfo
  }
});
`;
    fs.writeFileSync(contextConfigFilePath, before);

    fs.writeFileSync(
      join(testDir, 'credentials', 'inkeep-api-key.ts'),
      `import { credential } from '@inkeep/agents-sdk';

export const inkeepApiKey = credential({
  id: 'inkeep-api-key',
  name: 'Inkeep API Key',
  type: 'bearer',
  credentialStoreId: 'main-store'
});
`
    );

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedContextConfigFile } = await import(`${contextConfigFilePath}?raw`);
    expect(mergedContextConfigFile).toContain(
      "import { inkeepApiKey } from '../credentials/inkeep-api-key';"
    );
    expect(mergedContextConfigFile).toContain('credentialReference: inkeepApiKey');
    expect(mergedContextConfigFile).not.toContain("credentialReferenceId: 'inkeep-api-key'");
    expect(mergedContextConfigFile).toContain('headers: supportContextHeaders');
    expect(mergedContextConfigFile).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: test assert
      'url: `https://api.example.com/users/${supportContextHeaders.toTemplate("user_id")}`'
    );
    expect(mergedContextConfigFile).not.toContain('userInfo: userInfo');

    await expect(mergedContextConfigFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const contextConfigDiff = await createUnifiedDiff(
      'context-configs/support-context.ts',
      before,
      mergedContextConfigFile
    );
    await expect(contextConfigDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });
});
