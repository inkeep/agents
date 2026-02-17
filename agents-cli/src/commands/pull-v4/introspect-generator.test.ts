import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { introspectGenerate, type ProjectPaths } from './introspect-generator';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `introspect-v4-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });

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
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('generates supported v4 components', async () => {
    const project = createProjectFixture();

    await introspectGenerate(project, projectPaths, 'development', false);

    const generatedTsFiles = collectTypeScriptFiles(testDir);
    await expect(generatedTsFiles.join('\n')).toMatchFileSnapshot(
      '__snapshots__/introspect/generates-supported-v4-components/structure.txt'
    );

    for (const filePath of generatedTsFiles) {
      await expect(readFileSync(join(testDir, filePath), 'utf-8')).toMatchFileSnapshot(
        `__snapshots__/introspect/generates-supported-v4-components/${filePath}.txt`
      );
    }
  });

  it('merges generated code with existing files by default', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    mkdirSync(join(testDir, 'credentials'), { recursive: true });
    writeFileSync(
      credentialFile,
      [
        "import { credential } from '@inkeep/agents-sdk';",
        '',
        "const keepMe = () => 'keep-me';",
        '',
        'export const apiCredentials = credential({',
        "  id: 'api-credentials',",
        "  name: 'Old API Credentials',",
        "  type: 'bearer',",
        "  credentialStoreId: 'main-store'",
        '});',
        '',
      ].join('\n'),
      'utf-8'
    );

    await introspectGenerate(project, projectPaths, 'development', false, { writeMode: 'merge' });

    const credentialContent = readFileSync(credentialFile, 'utf-8');
    expect(credentialContent).toContain("const keepMe = () => 'keep-me';");
    expect(credentialContent).toContain("name: 'API Credentials'");
    expect(credentialContent).toContain('retrievalParams: {');
    expect(credentialContent).not.toContain("name: 'Old API Credentials'");
  });

  it('overwrites existing files when writeMode is overwrite', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    mkdirSync(join(testDir, 'credentials'), { recursive: true });
    writeFileSync(
      credentialFile,
      [
        "import { credential } from '@inkeep/agents-sdk';",
        '',
        "const keepMe = () => 'keep-me';",
        '',
        'export const apiCredentials = credential({',
        "  id: 'api-credentials',",
        "  name: 'Old API Credentials',",
        "  type: 'bearer',",
        "  credentialStoreId: 'main-store'",
        '});',
        '',
      ].join('\n'),
      'utf-8'
    );

    await introspectGenerate(project, projectPaths, 'development', false, {
      writeMode: 'overwrite',
    });

    const credentialContent = readFileSync(credentialFile, 'utf-8');
    expect(credentialContent).not.toContain("const keepMe = () => 'keep-me';");
    expect(credentialContent).toContain("name: 'API Credentials'");
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
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
