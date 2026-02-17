import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSkills } from '../skill-loader';

const createdDirs: string[] = [];

async function createSkill({
  dirName,
  content,
}: {
  dirName: string;
  content: string;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-loader-'));
  const skillDir = path.join(root, dirName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf8');
  createdDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(createdDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  createdDirs.length = 0;
});

describe('skill-loader', () => {
  it('loads a skill with required fields', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `---
name: pdf-processing
description: Extracts PDFs.
---`,
    });
    const [skill] = loadSkills(root);
    expect(skill).toEqual({
      id: 'pdf-processing',
      name: 'pdf-processing',
      description: 'Extracts PDFs.',
      metadata: null,
      content: '',
    });
  });

  /**
   * @see https://agentskills.io/specification#name-field
   */
  describe('name', () => {
    it('rejects uppercase characters', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: PDF-Processing
description: x
---`,
      });
      expect(() => loadSkills(root)).toThrow(
        'May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)'
      );
    });

    it('rejects value with consecutive hyphens', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: pdf--processing
description: x
---`,
      });
      expect(() => loadSkills(root)).toThrow('Must not contain consecutive hyphens (--)');
    });

    it('rejects value longer than 64 characters', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: ${'a'.repeat(65)}
description: x
---`,
      });
      expect(() => loadSkills(root)).toThrow('Too big: expected string to have <=64 characters');
    });

    it('rejects value that do not match the directory', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: y
description: x
---`,
      });
      expect(() => loadSkills(root)).toThrow('Skill name "y" does not match directory "x"');
    });
  });

  /**
   * @see https://agentskills.io/specification#description-field
   */
  describe('description', () => {
    it('rejects empty value', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: x
description: " "
---`,
      });
      expect(() => loadSkills(root)).toThrow('Too small: expected string to have >=1 characters');
    });

    it('rejects value longer than 1024 characters', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: x
description: ${'a'.repeat(1025)}
---`,
      });
      expect(() => loadSkills(root)).toThrow('Too big: expected string to have <=1024 characters');
    });
  });

  /**
   * @see https://agentskills.io/specification#metadata-field
   */
  describe('metadata', () => {
    it('rejects with non-string values', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: x
description: x
metadata:
  author: 0
---`,
      });
      expect(() => loadSkills(root)).toThrow('All object values must be strings');
    });

    it('accepts with string values', async () => {
      const root = await createSkill({
        dirName: 'x',
        content: `---
name: x
description: x
metadata:
  author: " example-org "
  version: 1.0.0
---`,
      });
      const [skill] = loadSkills(root);
      expect(skill.metadata).toEqual({
        // We don't trim `metadata` values
        author: ' example-org ',
        version: '1.0.0',
      });
    });
  });
});
