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

    await introspectGenerate({ project, paths: projectPaths });

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

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

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

  it('preserves leading block comment when merging existing statements', async () => {
    const project = createProjectFixture();
    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';

/**
 * Keeps routing instructions for tier one support.
 */
const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Legacy Tier One'
});

/**
 * Keeps top-level documentation for this agent.
 */
export const supportAgent = agent({
  id: 'support-agent',
  name: 'Legacy Support Agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom]
});
`;
    fs.writeFileSync(agentFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    expect(mergedAgentFile).toContain('/**');
    expect(mergedAgentFile).toContain('Keeps routing instructions for tier one support.');
    expect(mergedAgentFile).toContain('Keeps top-level documentation for this agent.');
    expect(mergedAgentFile).toContain('export const tierOneCustom = subAgent({');

    await expect(mergedAgentFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('preserves existing tool reference names when merging sub-agents in an agent file', async () => {
    const project = createProjectFixture();
    const supportAgent = project.agents?.['support-agent'];
    if (!supportAgent) {
      throw new Error('Expected support-agent fixture to exist');
    }

    supportAgent.defaultSubAgentId = 'weather-forecaster';
    supportAgent.subAgents = {
      'weather-forecaster': {
        id: 'weather-forecaster',
        name: 'Weather forecaster',
        canUse: [{ toolId: 'weather-mcp', toolSelection: ['get_weather_forecast'] }],
      },
    };

    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    fs.mkdirSync(join(testDir, 'tools'), { recursive: true });

    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';
import { weatherMcpTool } from '../tools/weather-mcp';

const weatherForecasterCustom = subAgent({
  id: 'weather-forecaster',
  name: 'Legacy weather forecaster',
  canUse: () => [weatherMcpTool.with({ selectedTools: ['get_weather_forecast'] })]
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Legacy support agent',
  defaultSubAgent: weatherForecasterCustom,
  subAgents: () => [weatherForecasterCustom]
});
`;
    fs.writeFileSync(agentFilePath, before);

    const weatherToolFilePath = join(testDir, 'tools', 'weather-mcp.ts');
    fs.writeFileSync(
      weatherToolFilePath,
      `import { mcpTool } from '@inkeep/agents-sdk';

export const weatherMcpTool = mcpTool({
  id: 'weather-mcp',
  name: 'Weather MCP'
});
`
    );

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);

    expect(mergedAgentFile).toContain("import { weatherMcpTool } from '../tools/weather-mcp';");
    expect(mergedAgentFile).toContain(
      "canUse: () => [weatherMcpTool.with({ selectedTools: ['get_weather_forecast'] })]"
    );
    expect(mergedAgentFile).not.toContain('weatherMcp.with');

    await expect(mergedAgentFile).toMatchFileSnapshot(
      '__snapshots__/introspect/preserves-existing-tool-reference-names-when-merging-sub-agents-in-an-agent-file.ts'
    );

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(
      '__snapshots__/introspect/preserves-existing-tool-reference-names-when-merging-sub-agents-in-an-agent-file.diff'
    );
  });

  it('preserves existing tool reference names in project index', async () => {
    const project = createProjectFixture();
    project.tools = {
      'weather-mcp': {
        id: 'weather-mcp',
      },
      'exa-mcp': {
        id: 'exa-mcp',
      },
    };

    fs.mkdirSync(join(testDir, 'tools'), { recursive: true });

    const indexFilePath = join(testDir, 'index.ts');
    const before = `import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { weatherMcpTool } from './tools/weather-mcp';
import { exaMcpTool } from './tools/exa-mcp';

export const supportProject = project({
  id: 'support-project',
  name: 'Legacy support project',
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [supportAgent],
  tools: () => [weatherMcpTool, exaMcpTool]
});
`;
    fs.writeFileSync(indexFilePath, before);

    fs.writeFileSync(
      join(testDir, 'tools', 'weather-mcp.ts'),
      `import { mcpTool } from '@inkeep/agents-sdk';

export const weatherMcpTool = mcpTool({
  id: 'weather-mcp',
  name: 'Weather MCP'
});
`
    );
    fs.writeFileSync(
      join(testDir, 'tools', 'exa-mcp.ts'),
      `import { mcpTool } from '@inkeep/agents-sdk';

export const exaMcpTool = mcpTool({
  id: 'exa-mcp',
  name: 'Exa MCP'
});
`
    );

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedIndexFile } = await import(`${indexFilePath}?raw`);
    expect(mergedIndexFile).toContain("import { weatherMcpTool } from './tools/weather-mcp';");
    expect(mergedIndexFile).toContain("import { exaMcpTool } from './tools/exa-mcp';");
    expect(mergedIndexFile).toContain('tools: () => [weatherMcpTool, exaMcpTool]');
    expect(mergedIndexFile).not.toContain('tools: () => [weather-mcp');
    expect(mergedIndexFile).not.toContain('tools: () => [exa-mcp');

    await expect(mergedIndexFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('preserves existing object key and array order when merging sub-agent', async () => {
    const project: FullProjectDefinition = {
      id: 'order-project',
      name: 'Order Project',
      description: 'Project used for order-preservation regression coverage',
      models: {
        base: {
          model: 'gpt-4o-mini',
        },
      },
      agents: {
        'support-agent': {
          id: 'support-agent',
          name: 'Support Agent',
          defaultSubAgentId: 'planner',
          subAgents: {
            planner: {
              id: 'planner',
              description: 'Routes requests',
              prompt: 'Delegate to helper agents.',
              name: 'Planner',
              canDelegateTo: [
                { subAgentId: 'websearch' },
                { subAgentId: 'weather' },
                { subAgentId: 'coordinates' },
              ],
            },
            weather: {
              id: 'weather',
              name: 'Weather',
            },
            coordinates: {
              id: 'coordinates',
              name: 'Coordinates',
            },
            websearch: {
              id: 'websearch',
              name: 'Websearch',
            },
          },
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';

export const planner = subAgent({
  id: 'planner',
  name: 'Planner',
  description: 'Legacy planner description',
  prompt: 'Legacy planner prompt.',
  canDelegateTo: () => [weather, coordinates, websearch]
});

export const weather = subAgent({
  id: 'weather',
  name: 'Weather'
});

export const coordinates = subAgent({
  id: 'coordinates',
  name: 'Coordinates'
});

export const websearch = subAgent({
  id: 'websearch',
  name: 'Websearch'
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: planner,
  subAgents: () => [planner, weather, coordinates, websearch]
});
`;
    fs.writeFileSync(agentFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    expect(mergedAgentFile).toContain('canDelegateTo: () => [weather, coordinates, websearch]');

    const plannerSectionStart = mergedAgentFile.indexOf('export const planner = subAgent({');
    const plannerSectionEnd = mergedAgentFile.indexOf('export const weather = subAgent({');
    const plannerSection = mergedAgentFile.slice(plannerSectionStart, plannerSectionEnd);
    expect(plannerSection.indexOf("id: 'planner'")).toBeLessThan(
      plannerSection.indexOf("name: 'Planner'")
    );
    expect(plannerSection.indexOf("name: 'Planner'")).toBeLessThan(
      plannerSection.indexOf("description: 'Routes requests'")
    );
    expect(plannerSection.indexOf("description: 'Routes requests'")).toBeLessThan(
      plannerSection.indexOf("prompt: 'Delegate to helper agents.'")
    );
    expect(plannerSection.indexOf("prompt: 'Delegate to helper agents.'")).toBeLessThan(
      plannerSection.indexOf('canDelegateTo: () => [weather, coordinates, websearch]')
    );

    await expect(mergedAgentFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('reuses existing file when sub-agent already exists in the agent file', async () => {
    const project = createProjectFixture();
    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';

const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Legacy Tier One'
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Legacy Support Agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom]
});
`;
    fs.writeFileSync(agentFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    expect(fs.existsSync(join(testDir, 'agents', 'sub-agents', 'tier-one.ts'))).toBe(false);

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    expect(mergedAgentFile).toContain("import { agent, subAgent } from '@inkeep/agents-sdk';");
    expect(mergedAgentFile).not.toContain(" from './sub-agents/tier-one';");
    expect(mergedAgentFile).toContain('export const tierOneCustom = subAgent({');
    expect(mergedAgentFile).toContain("id: 'tier-one',");
    expect(mergedAgentFile).toContain("name: 'Tier One'");
    expect(mergedAgentFile).toContain('defaultSubAgent: tierOneCustom,');
    expect(mergedAgentFile).toContain('subAgents: () => [tierOneCustom],');

    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      before,
      mergedAgentFile
    );
    await expect(credentialDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('preserves comment indentation above object field across repeated merges', async () => {
    const project = createProjectFixture();
    const indexFilePath = join(testDir, 'index.ts');
    const before = `import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';

export const supportProject = project({
  id: 'support-project',
  name: 'Legacy support project',
  models: {
    /**
     * Keep this comment above the base model field.
     */
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [supportAgent]
});
`;
    fs.writeFileSync(indexFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });
    const firstMergedIndexFile = fs.readFileSync(indexFilePath, 'utf8');

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });
    const secondMergedIndexFile = fs.readFileSync(indexFilePath, 'utf8');

    expect(secondMergedIndexFile).toBe(firstMergedIndexFile);
    expect(secondMergedIndexFile).toContain(`models: {
    /**
     * Keep this comment above the base model field.
     */
    base: {`);

    await expect(secondMergedIndexFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );
  });

  it('preserves comment above object field', async () => {
    const project = createProjectFixture();
    const indexFilePath = join(testDir, 'index.ts');
    const before = `import { project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';

export const supportProject = project({
  id: 'support-project',
  name: 'Legacy support project',
  models: {
    /**
     * Keep this comment above the base model field.
     */
    base: {
      model: 'gpt-4o-mini'
    }
  },
  agents: () => [supportAgent]
});
`;
    fs.writeFileSync(indexFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedIndexFile } = await import(`${indexFilePath}?raw`);
    expect(mergedIndexFile).toContain('Keep this comment above the base model field.');
    expect(mergedIndexFile).toContain('/**');
    expect(mergedIndexFile).toContain('base: {');

    await expect(mergedIndexFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('preserve single line comment when merging existing statements', async () => {
    const project = createProjectFixture();
    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';

const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Legacy Tier One'
});

// Agent
export const supportAgent = agent({
  id: 'support-agent',
  name: 'Legacy Support Agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom]
});
`;
    fs.writeFileSync(agentFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });
    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    const singleLineCommentMatches = mergedAgentFile.match(/\/\/ Agent/g) ?? [];
    expect(singleLineCommentMatches).toHaveLength(1);

    await expect(mergedAgentFile).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(
      `__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });

  it('overwrites existing files when writeMode is overwrite', async () => {
    const project = createProjectFixture();
    const credentialFile = join(testDir, 'credentials', 'api-credentials.ts');
    fs.mkdirSync(join(testDir, 'credentials'), { recursive: true });
    fs.writeFileSync(credentialFile, beforeCredentialContent);

    await introspectGenerate({
      project,
      paths: projectPaths,
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

  it('aliases sub-agent imports when agent and sub-agent ids collide', async () => {
    const project = createProjectFixture();
    const supportAgent = project.agents?.['support-agent'];
    if (!supportAgent.subAgents) {
      throw new Error('Expected support-agent fixture to include sub-agents');
    }

    supportAgent.defaultSubAgentId = 'support-agent';
    supportAgent.subAgents = {
      'support-agent': {
        id: 'support-agent',
        name: 'Support Router',
      },
      ...supportAgent.subAgents,
    };

    await introspectGenerate({ project, paths: projectPaths });

    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    const { default: agentContent } = await import(`${agentFilePath}?raw`);

    expect(agentContent).toContain(
      "import { supportAgent as supportAgentSubAgent } from './sub-agents/support-agent';"
    );
    expect(agentContent).toContain('export const supportAgent = agent({');
    expect(agentContent).toContain('defaultSubAgent: supportAgentSubAgent');
    expect(agentContent).toContain('subAgents: () => [supportAgentSubAgent, tierOne]');

    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'support-agent.ts');
    const { default: subAgentContent } = await import(`${subAgentFilePath}?raw`);
    expect(subAgentContent).toContain('export const supportAgent = subAgent({');
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
