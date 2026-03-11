import fs from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { ProjectPaths } from '../introspect-generator';
import { introspectGenerate } from '../introspect-generator';
import { demoProject } from './demo-project';
import { cleanupTestEnvironment, createTestEnvironment } from './test-helpers';

describe('pull-v4 introspect generator', () => {
  let testDir: string;
  let projectPaths: ProjectPaths;
  let salesIntelligenceAgentFile: string;
  let notionWriterSubAgentFile: string;
  let meetingCoordinatorSubAgentFile: string;
  let indexFile: string;

  beforeEach(async () => {
    ({ testDir, projectPaths } = createTestEnvironment());
    const project = structuredClone(demoProject) as FullProjectDefinition;
    await introspectGenerate({ project, paths: projectPaths, writeMode: 'overwrite' });

    const salesIntelligenceAgentPath = join(projectPaths.agentsDir, 'sales-intelligence-agent.ts');
    ({ default: salesIntelligenceAgentFile } = await import(`${salesIntelligenceAgentPath}?raw`));

    const notionWriterSubAgentPath = join(
      projectPaths.agentsDir,
      'sub-agents',
      'notion-writer-sub-agent-ppiw40a8.ts'
    );
    ({ default: notionWriterSubAgentFile } = await import(`${notionWriterSubAgentPath}?raw`));

    const meetingCoordinatorSubAgentPath = join(
      projectPaths.agentsDir,
      'sub-agents',
      'meeting-coordinator.ts'
    );
    ({ default: meetingCoordinatorSubAgentFile } = await import(
      `${meetingCoordinatorSubAgentPath}?raw`
    ));

    const indexFilePath = join(testDir, 'index.ts');
    ({ default: indexFile } = await import(`${indexFilePath}?raw`));
  });

  afterEach(() => {
    cleanupTestEnvironment(testDir);
  });

  it('uses generated sub-agent file name in sales-intelligence-agent imports', () => {
    expect(salesIntelligenceAgentFile).toContain(
      "import { notionWriterSubagent } from './sub-agents/notion-writer-sub-agent-ppiw40a8';"
    );
    expect(salesIntelligenceAgentFile).not.toContain(
      "import { _4cp6qs8le8zq4ppiw40a8 } from './sub-agents/4cp6qs8le8zq4ppiw40a8';"
    );
    expect(salesIntelligenceAgentFile).toContain(
      "from './sub-agents/notion-writer-sub-agent-ppiw40a8';"
    );
    expect(salesIntelligenceAgentFile).not.toContain("from './sub-agents/4cp6qs8le8zq4ppiw40a8';");
  });

  it('exports sub-agent variable from sub-agent name when available', () => {
    expect(notionWriterSubAgentFile).toContain('export const notionWriterSubagent = subAgent({');
    expect(notionWriterSubAgentFile).not.toContain(
      'export const _4cp6qs8le8zq4ppiw40a8 = subAgent({'
    );
  });

  it('uses generated agent file name in demo-project index imports', () => {
    expect(indexFile).toContain("from './agents/meeting-prep-agen-kevin-mira-evinmira';");
    expect(indexFile).not.toContain("from './agents/meetingprepagenkevinmira';");
  });

  it('generates referenced data-component files used by sub-agents', () => {
    expect(meetingCoordinatorSubAgentFile).toContain(
      "import { meetingTipsCard } from '../../data-components/meeting-tips-card';"
    );

    const meetingTipsCardPath = join(projectPaths.dataComponentsDir, 'meeting-tips-card.ts');
    expect(fs.existsSync(meetingTipsCardPath)).toBe(true);
  });
});
