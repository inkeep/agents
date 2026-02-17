import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { createTwoFilesPatch } from 'diff';
import { introspectGenerate, type ProjectPaths } from './introspect-generator';

describe('pull-v4 introspect generator', () => {
  const beforeCredentialContent = `import { credential } from '@inkeep/agents-sdk';

const keepMe = () => 'keep-me';

export const apiCredentials = credential({
  id: 'api-credentials',
  name: 'Old API Credentials',
  type: 'bearer',
  credentialStoreId: 'main-store'
});
`.trimStart();
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `introspect-v4-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    fs.mkdirSync(testDir, { recursive: true });

    projectPaths = {
      projectRoot: testDir,
      agentsDir: join(testDir, 'agents'),
      toolsDir: join(testDir, 'tools'),
      dataComponentsDir: join(testDir, 'data-components'),
      artifactComponentsDir: join(testDir, 'artifact-components'),
      statusComponentsDir: join(testDir, 'status-components'),
      environmentsDir: join(testDir, 'environments'),
      credentialsDir: join(testDir, 'credentials'),
      contextConfigsDir: join(testDir, 'context-configs'),
      externalAgentsDir: join(testDir, 'external-agents'),
    };
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('generates supported v4 components', async () => {
    const project = createProjectFixture();

    await introspectGenerate(project, projectPaths, 'development', false);

    const generatedTsFiles = fs.globSync('**/*.ts', { cwd: testDir });

    await expect(generatedTsFiles.sort().join('\n')).toMatchFileSnapshot(
      '__snapshots__/introspect/generates-supported-v4-components/structure.md'
    );

    for (const filePath of generatedTsFiles) {
      const { default: fileContent } = await import(`${testDir}/${filePath}?raw`);
      await expect(fileContent).toMatchFileSnapshot(
        `__snapshots__/introspect/generates-supported-v4-components/${filePath}`
      );
    }
  });

  it('merges generated code with existing files by default', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });
    fs.writeFileSync(credentialFile, beforeCredentialContent);

    await introspectGenerate(project, projectPaths, 'development', false, { writeMode: 'merge' });

    const { default: afterCredentialContent } = await import(`${credentialFile}?raw`);
    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      beforeCredentialContent,
      afterCredentialContent
    );
    await expect(credentialDiff).toMatchFileSnapshot(
      '__snapshots__/introspect/merges-generated-code-with-existing-files-by-default-credential.diff'
    );
  });

  it('overwrites existing files when writeMode is overwrite', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });
    fs.writeFileSync(credentialFile, beforeCredentialContent);

    await introspectGenerate(project, projectPaths, 'development', false, {
      writeMode: 'overwrite',
    });

    const { default: afterCredentialContent } = await import(`${credentialFile}?raw`);
    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      beforeCredentialContent,
      afterCredentialContent
    );

    await expect(credentialDiff).toMatchFileSnapshot(
      '__snapshots__/introspect/overwrites-existing-files-when-writemode-is-overwrite-credential.diff'
    );
  });
});

function createProjectFixture(): FullProjectDefinition {
  return {
    id: 'support-project',
    name: 'Support Project',
    description: 'Support project for introspect v4 tests',
    models: {
      base: {
        model: 'gpt-4o-mini',
      },
    },
    credentialReferences: {
      'api-credentials': {
        id: 'api-credentials',
        name: 'API Credentials',
        type: 'bearer',
        credentialStoreId: 'main-store',
        retrievalParams: {
          key: 'token',
        },
      },
    },
    artifactComponents: {
      'ticket-summary': {
        id: 'ticket-summary',
        name: 'Ticket Summary',
        props: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
        },
      },
    },
    agents: {
      'support-agent': {
        id: 'support-agent',
        name: 'Support Agent',
        defaultSubAgentId: 'tier-one',
        subAgents: {
          'tier-one': {
            id: 'tier-one',
            name: 'Tier One',
          },
        },
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
                url: 'https://api.example.com/users/${headers.toTemplate("user_id")}',
                method: 'GET',
              },
              responseSchema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                  },
                },
              },
              defaultValue: 'Unable to fetch user information',
            },
          },
        },
        triggers: {
          'github-webhook': {
            id: 'github-webhook',
            name: 'GitHub Webhook',
            messageTemplate: 'New webhook event',
          },
        },
        statusUpdates: {
          numEvents: 1,
          statusComponents: [
            {
              id: 'tool-summary',
              type: 'tool_summary',
              description: 'Tool summary status component',
              detailsSchema: {
                type: 'object',
                properties: {
                  tool_name: {
                    type: 'string',
                  },
                },
              },
            },
          ],
        },
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function createUnifiedDiff(filePath: string, before: string, after: string): Promise<string> {
  return createTwoFilesPatch(filePath, filePath, before, after, 'before', 'after', { context: 3 });
}
