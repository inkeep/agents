import fs from 'node:fs';
import { join } from 'node:path';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import {
  cleanupTestEnvironment,
  createProjectFixture,
  createTestEnvironment,
  createUnifiedDiff,
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

    await expect(mergedAgentFile).toMatchFileSnapshot(
      '../__snapshots__/introspect/preserves-existing-tool-reference-names-when-merging-sub-agents-in-an-agent-file.ts'
    );

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(
      '../__snapshots__/introspect/preserves-existing-tool-reference-names-when-merging-sub-agents-in-an-agent-file.diff'
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
      `../__snapshots__/introspect/${expect.getState().currentTestName}.ts`
    );

    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(
      `../__snapshots__/introspect/${expect.getState().currentTestName}.diff`
    );
  });
});
