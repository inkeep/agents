import fs from 'node:fs';
import { join } from 'node:path';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import {
  cleanupTestEnvironment,
  createProjectFixture,
  createTestEnvironment,
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

  it('generates supported v4 components', async () => {
    const project = createProjectFixture();

    await introspectGenerate({ project, paths: projectPaths });

    const generatedTsFiles = fs.globSync('**/*.ts', { cwd: testDir });

    await expect(generatedTsFiles.sort().join('\n')).toMatchFileSnapshot(
      `${getTestPath()}/structure.md`
    );

    for (const filePath of generatedTsFiles) {
      const { default: fileContent } = await import(`${testDir}/${filePath}?raw`);
      await expect(fileContent).toMatchFileSnapshot(`${getTestPath()}/${filePath}`);
    }
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
