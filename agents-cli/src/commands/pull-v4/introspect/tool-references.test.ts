import fs from 'node:fs';
import { join } from 'node:path';
import type { ProjectPaths } from '../generators/introspect-generator';
import { introspectGenerate } from '../generators/introspect-generator';
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

  it('generates MCP tool files and wires sub-agent tool imports for fresh projects', async () => {
    const project = createProjectFixture();
    project.id = 'docs-assistant';
    project.name = 'Docs Assistant';
    project.description = 'Docs assistant for introspect tool regression coverage';
    project.tools = {
      'inkeep-rag-mcp': {
        id: 'inkeep-rag-mcp',
        name: 'Inkeep RAG MCP',
        config: {
          mcp: {
            server: {
              url: 'https://mcp.inkeep.com',
            },
            transport: {
              type: 'streamable_http',
            },
          },
        },
      },
    };
    project.agents = {
      'docs-assistant': {
        id: 'docs-assistant',
        name: 'Docs Assistant',
        description: 'A sub-agent routed docs assistant',
        defaultSubAgentId: 'docs-assistant',
        subAgents: {
          'docs-assistant': {
            id: 'docs-assistant',
            description: 'Answers questions about docs',
            prompt: 'Use the Inkeep RAG MCP tool to find relevant information.',
            canUse: [{ toolId: 'inkeep-rag-mcp' }],
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const toolFilePath = join(testDir, 'tools', 'inkeep-rag-mcp.ts');
    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'docs-assistant.ts');
    const indexFilePath = join(testDir, 'index.ts');

    expect(fs.existsSync(toolFilePath)).toBe(true);
    expect(fs.existsSync(subAgentFilePath)).toBe(true);

    const { default: generatedToolFile } = await import(`${toolFilePath}?raw`);
    const { default: generatedSubAgentFile } = await import(`${subAgentFilePath}?raw`);
    const { default: generatedProjectFile } = await import(`${indexFilePath}?raw`);

    expect(generatedToolFile).toContain('export const inkeepRagMcp = mcpTool({');
    expect(generatedSubAgentFile).toContain(
      "import { inkeepRagMcp } from '../../tools/inkeep-rag-mcp';"
    );
    expect(generatedSubAgentFile).toContain('canUse: () => [inkeepRagMcp]');
    expect(generatedProjectFile).toContain(
      "import { inkeepRagMcp } from './tools/inkeep-rag-mcp';"
    );
    expect(generatedProjectFile).toContain('tools: () => [inkeepRagMcp],');
  });

  it('aliases agent import when project variable name collides with agent name', async () => {
    const project = createProjectFixture();
    project.id = 'docs-assistant';
    project.name = 'Docs Assistant';
    project.agents = {
      'docs-assistant': {
        id: 'docs-assistant',
        name: 'Docs Assistant Agent',
        defaultSubAgentId: 'docs-sub',
        subAgents: {
          'docs-sub': {
            id: 'docs-sub',
            name: 'Docs Sub',
          },
        },
      },
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const indexFilePath = join(testDir, 'index.ts');
    const { default: generatedProjectFile } = await import(`${indexFilePath}?raw`);

    expect(generatedProjectFile).toContain(
      "import { docsAssistant as docsAssistantAgent } from './agents/docs-assistant';"
    );
    expect(generatedProjectFile).toContain('export const docsAssistant = project({');
    expect(generatedProjectFile).toContain('agents: () => [docsAssistantAgent],');
    expect(generatedProjectFile).not.toContain('agents: () => [docsAssistant],');
  });

  it('generates sub-agent component imports for fresh projects', async () => {
    const project = createProjectFixture();
    const supportAgent = project.agents?.['support-agent'];
    if (!supportAgent?.subAgents?.['tier-one']) {
      throw new Error('Expected support-agent fixture to include tier-one sub-agent');
    }

    supportAgent.subAgents['tier-one'].dataComponents = ['customer-profile'];
    supportAgent.subAgents['tier-one'].artifactComponents = ['ticket-summary'];

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'tier-one.ts');
    const { default: generatedSubAgentFile } = await import(`${subAgentFilePath}?raw`);

    expect(generatedSubAgentFile).toContain(
      "import { customerProfile } from '../../data-components/customer-profile';"
    );
    expect(generatedSubAgentFile).toContain(
      "import { ticketSummary } from '../../artifact-components/ticket-summary';"
    );
    expect(generatedSubAgentFile).toContain('dataComponents: () => [customerProfile],');
    expect(generatedSubAgentFile).toContain('artifactComponents: () => [ticketSummary],');
  });

  it('generates canDelegateTo imports for sub-agent and agent targets', async () => {
    const project = createProjectFixture();
    project.agents = {
      ...project.agents,
      'router-agent': {
        id: 'router-agent',
        name: 'Router Agent',
        defaultSubAgentId: 'router-tier',
        subAgents: {
          'router-tier': {
            id: 'router-tier',
            name: 'Router Tier',
          },
        },
      },
    };

    const supportAgent = project.agents?.['support-agent'];
    if (!supportAgent?.subAgents?.['tier-one']) {
      throw new Error('Expected support-agent fixture to include tier-one sub-agent');
    }

    supportAgent.subAgents['tier-one'].canDelegateTo = [
      { subAgentId: 'tier-two' },
      { agentId: 'router-agent' },
    ];
    supportAgent.subAgents['tier-two'] = {
      id: 'tier-two',
      name: 'Tier Two',
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'tier-one.ts');
    const { default: generatedSubAgentFile } = await import(`${subAgentFilePath}?raw`);

    expect(generatedSubAgentFile).toContain("import { tierTwo } from './tier-two';");
    expect(generatedSubAgentFile).toContain("import { routerAgent } from '../router-agent';");
    expect(generatedSubAgentFile).toContain('canDelegateTo: () => [tierTwo, routerAgent],');
  });

  it('generates canTransferTo imports for sub-agent targets', async () => {
    const project = createProjectFixture();
    const supportAgent = project.agents?.['support-agent'];
    if (!supportAgent?.subAgents?.['tier-one']) {
      throw new Error('Expected support-agent fixture to include tier-one sub-agent');
    }

    supportAgent.subAgents['tier-one'].canTransferTo = ['tier-two'];
    supportAgent.subAgents['tier-two'] = {
      id: 'tier-two',
      name: 'Tier Two',
    };

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const subAgentFilePath = join(testDir, 'agents', 'sub-agents', 'tier-one.ts');
    const { default: generatedSubAgentFile } = await import(`${subAgentFilePath}?raw`);

    expect(generatedSubAgentFile).toContain("import { tierTwo } from './tier-two';");
    expect(generatedSubAgentFile).toContain('canTransferTo: () => [tierTwo],');
  });

  it('preserves existing tool reference names in project index', async () => {
    const project = createProjectFixture();
    project.tools = {
      'weather-mcp': {
        id: 'weather-mcp',
        name: 'foo',
        serverUrl: 'https://foo.com',
      },
      'exa-mcp': {
        id: 'exa-mcp',
        name: 'bar',
        serverUrl: 'https://bar.com',
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

  it('does not add duplicate tool import when matching variable already exists', async () => {
    const project = createProjectFixture();
    project.id = 'deep-research';
    project.name = 'Deep Research';
    project.description = 'Deep research project template';
    project.tools = {
      'ad1dRlGjxH7FgdTcRn-qr': {
        id: 'ad1dRlGjxH7FgdTcRn-qr',
        name: 'foo',
        serverUrl: 'https://foo.com',
      },
    };

    fs.mkdirSync(join(testDir, 'tools'), { recursive: true });

    const indexFilePath = join(testDir, 'index.ts');
    const before = `import { project } from '@inkeep/agents-sdk';
// biome-ignore lint/correctness/noUnusedImports: TODO: we can remove unused imports after code merging
import { deepResearchAgent } from './agents/deep-research';
import { firecrawlMcpTool } from './tools/firecrawl-mcp';

export const myProject = project({
  id: 'deep-research',
  name: 'Deep Research',
  description: 'Deep research project template',
  agents: () => [deepResearchAgent],
  tools: () => [firecrawlMcpTool],
  models: {
    base: {
      model: 'openai/gpt-4o-mini'
    }
  }
});
`;
    fs.writeFileSync(indexFilePath, before);

    fs.writeFileSync(
      join(testDir, 'tools', 'firecrawl-mcp.ts'),
      `import { mcpTool } from '@inkeep/agents-sdk';

export const firecrawlMcpTool = mcpTool({
  id: 'ad1dRlGjxH7FgdTcRn-qr',
  name: 'Firecrawl',
  serverUrl: 'https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp',
  transport: {
    type: 'streamable_http'
  }
});
`
    );

    await introspectGenerate({ project, paths: projectPaths, writeMode: 'merge' });

    const { default: mergedIndexFile } = await import(`${indexFilePath}?raw`);
    expect(mergedIndexFile).toContain("import { firecrawlMcpTool } from './tools/firecrawl-mcp';");
    expect(mergedIndexFile).not.toContain("from './tools/ad1dRlGjxH7FgdTcRn-qr';");
    expect(mergedIndexFile).toContain('tools: () => [firecrawlMcpTool],');
    const firecrawlImportCount =
      mergedIndexFile.match(/import \{ firecrawlMcpTool \} from/g)?.length ?? 0;
    expect(firecrawlImportCount).toBe(1);

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
