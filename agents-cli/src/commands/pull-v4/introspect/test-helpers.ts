import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { createTwoFilesPatch } from 'diff';
import type { ProjectPaths } from '../introspect-generator';

export const beforeCredentialContent = `import { credential } from '@inkeep/agents-sdk';

const keepMe = () => 'keep-me';

export const apiCredentials = credential({
  id: 'api-credentials',
  name: 'Old API Credentials',
  type: 'bearer',
  credentialStoreId: 'main-store'
});
`.trimStart();

export function createTestEnvironment(): { testDir: string; projectPaths: ProjectPaths } {
  const testDir = join(
    tmpdir(),
    `introspect-v4-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
  fs.mkdirSync(testDir, { recursive: true });

  return {
    testDir,
    projectPaths: {
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
    },
  };
}

export function cleanupTestEnvironment(testDir: string): void {
  fs.rmSync(testDir, { recursive: true, force: true });
}

export function getTestPath(): string {
  return `../__snapshots__/introspect/${expect.getState().currentTestName?.split('>').at(-1)}`;
}

export function createProjectFixture(): FullProjectDefinition {
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
    dataComponents: {
      'customer-profile': {
        id: 'customer-profile',
        name: 'Customer Profile',
        description: 'Customer profile data component',
        props: {
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            avatarUrl: { type: 'string' },
          },
        },
        render: {
          component: '<img src="{{avatarUrl}}" alt="{{fullName}}" />',
          mockData: {
            fullName: 'Ada Lovelace',
            avatarUrl: 'https://example.com/avatar.png',
          },
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
                url: 'https://api.example.com/users/${headersSchema.toTemplate("user_id")}',
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

export async function createUnifiedDiff(
  filePath: string,
  before: string,
  after: string
): Promise<string> {
  return createTwoFilesPatch(filePath, filePath, before, after, 'before', 'after', {
    context: 3,
  });
}
