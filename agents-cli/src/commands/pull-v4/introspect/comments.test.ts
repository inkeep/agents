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
    expect(mergedAgentFile).toContain('const tierOneCustom = subAgent({');

    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
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

    await expect(secondMergedIndexFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
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

    await expect(mergedIndexFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const indexDiff = await createUnifiedDiff('index.ts', before, mergedIndexFile);
    await expect(indexDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
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

    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    const agentDiff = await createUnifiedDiff('agents/support-agent.ts', before, mergedAgentFile);
    await expect(agentDiff).toMatchFileSnapshot(`${getTestPath()}.diff`);
  });

  it('preserves single line comment above sub-agent without adding export keyword', async () => {
    const project = createProjectFixture();
    const agentFilePath = join(testDir, 'agents', 'support-agent.ts');
    fs.mkdirSync(join(testDir, 'agents'), { recursive: true });
    const before = `import { agent, subAgent } from '@inkeep/agents-sdk';

/**
 * Tier-one routing helper.
 */
// Knowledge Base Q&A Agent
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

    const { default: mergedAgentFile } = await import(`${agentFilePath}?raw`);
    await expect(mergedAgentFile).toMatchFileSnapshot(`${getTestPath()}.ts`);
    expect(mergedAgentFile).toContain('// Knowledge Base Q&A Agent');
    expect(mergedAgentFile).toContain('const tierOneCustom = subAgent({');
    expect(mergedAgentFile).not.toContain('export const tierOneCustom = subAgent({');
  });
});
