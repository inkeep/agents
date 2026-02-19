import fs from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
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

    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);

    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
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
    expect(mergedAgentFile).toContain('const tierOneCustom = subAgent({');
    expect(mergedAgentFile).not.toContain('export const tierOneCustom = subAgent({');
    expect(mergedAgentFile).toContain("id: 'tier-one',");
    expect(mergedAgentFile).toContain("name: 'Tier One'");
    expect(mergedAgentFile).toContain('defaultSubAgent: tierOneCustom,');
    expect(mergedAgentFile).toContain('subAgents: () => [tierOneCustom],');

    const credentialDiff = await createUnifiedDiff(
      'credentials/api-credentials.ts',
      before,
      mergedAgentFile
    );
    await expect(credentialDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });
});
