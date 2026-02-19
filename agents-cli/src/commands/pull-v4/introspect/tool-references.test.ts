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

    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
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

    await expect(mergedIndexFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });

  it('preserves project skills loader when merging project index', async () => {
    const project = createProjectFixture();
    project.skills = {
      'weather-safety-guardrails': {
        id: 'weather-safety-guardrails',
        name: 'Weather Safety Guardrails',
        description: 'Safety guidance for weather planning',
        content: '# Weather safety guidance',
      },
    } as any;

    const indexFilePath = join(testDir, 'index.ts');
    const before = `import path from 'node:path';
import { loadSkills, project } from '@inkeep/agents-sdk';
import { supportAgent } from './agents/support-agent';
import { customerProfile } from './data-components/customer-profile';
import { ticketSummary } from './artifact-components/ticket-summary';
import { apiCredentials } from './credentials/api-credentials';

export const supportProject = project({
  id: 'support-project',
  name: 'Legacy support project',
  description: 'Support project for introspect v4 tests',
  agents: () => [supportAgent],
  skills: () => loadSkills(path.join('support-project', 'skills')),
  models: {
    base: {
      model: 'gpt-4o-mini'
    }
  },
  dataComponents: () => [customerProfile],
  artifactComponents: () => [ticketSummary],
  credentialReferences: () => [apiCredentials]
});
`;
    fs.writeFileSync(indexFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedIndexFile } = await import(`${indexFilePath}?raw`);
    expect(mergedIndexFile).toContain("import path from 'node:path';");
    expect(mergedIndexFile).toContain("import { loadSkills, project } from '@inkeep/agents-sdk';");
    expect(mergedIndexFile).toContain(
      "skills: () => loadSkills(path.join('support-project', 'skills'))"
    );

    await expect(mergedIndexFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });

  it('does not add context-config import when agent already has local context config', async () => {
    const project = createProjectFixture();

    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { contextConfig } from '@inkeep/agents-core';
import { agent, subAgent } from '@inkeep/agents-sdk';

const supportContextCustom = contextConfig({
  id: 'support-context'
});

const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Legacy tier one'
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Legacy support agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom],
  contextConfig: supportContextCustom
});
`;
    fs.writeFileSync(agentFilePath, before);

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    expect(mergedAgentFile).not.toContain("from '../context-configs/support-context';");
    expect(mergedAgentFile).toContain('contextConfig: supportContextCustom');
    expect(mergedAgentFile).not.toContain('supportContextCustomContextConfig');

    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });
});
