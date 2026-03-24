import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectStructure } from './index';

describe('pull-v4 project paths', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `pull-v4-index-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates the project root without pre-creating component directories', () => {
    const paths = createProjectStructure(testDir);

    expect(fs.existsSync(paths.projectRoot)).toBe(true);
    expect(fs.existsSync(paths.agentsDir)).toBe(false);
    expect(fs.existsSync(paths.toolsDir)).toBe(false);
    expect(fs.existsSync(paths.dataComponentsDir)).toBe(false);
    expect(fs.existsSync(paths.artifactComponentsDir)).toBe(false);
    expect(fs.existsSync(paths.statusComponentsDir)).toBe(false);
    expect(fs.existsSync(paths.environmentsDir)).toBe(false);
    expect(fs.existsSync(paths.credentialsDir)).toBe(false);
    expect(fs.existsSync(paths.contextConfigsDir)).toBe(false);
    expect(fs.existsSync(paths.externalAgentsDir)).toBe(false);
    expect(fs.existsSync(paths.skillsDir)).toBe(false);
  });
});
