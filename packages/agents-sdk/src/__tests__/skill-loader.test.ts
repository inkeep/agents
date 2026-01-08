import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
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
  it.skip('loads a skill with required fields', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `
---
name: pdf-processing
description: Extracts PDFs.
---`,
    });

    const [skill] = loadSkills(root);
    expect(skill.id).toBe('pdf-processing');
    expect(skill.name).toBe('pdf-processing');
    expect(skill.description).toBe('Extracts PDFs.');
    expect(skill.metadata).toBeNull();
  });

  it.skip('accepts metadata with string values', async () => {
    const root = await createSkill({
      dirName: 'data-analysis',
      content: `
name: data-analysis
description: Analyzes datasets.
metadata:
  author: example-org
  version: 1.0
---`,
    });

    const [skill] = loadSkills(root);
    expect(skill.metadata).toEqual({ author: 'example-org', version: '1.0' });
  });

  it.skip('rejects uppercase names', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `
---
name: PDF-Processing
description: Extracts PDFs.
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it.skip('rejects names with consecutive hyphens', async () => {
    const root = await createSkill({
      dirName: 'pdf--processing',
      content: `
---
name: pdf--processing
description: Extracts PDFs.
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it.skip('rejects names longer than 64 characters', async () => {
    const name = 'a'.repeat(65);
    const root = await createSkill({
      dirName: name,
      content: `
---
name: ${name}
description: Extracts PDFs.
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it.skip('rejects names that do not match the directory', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `
name: data-analysis
description: Extracts PDFs.
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it.skip('rejects empty descriptions', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `
---
name: pdf-processing
description: "   "
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it.skip('rejects descriptions longer than 1024 characters', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      content: `
---
name: pdf-processing
description: ${'a'.repeat(1025)}
---`,
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects metadata with non-string values', async () => {
    const root = await createSkill({
      dirName: 'data-analysis',
      content: `---
name: X
description: X
metadata:
  author: 123
---`,
    });

    expect(() => loadSkills(root)).toThrow('Invalid input: expected string, received number');
  });
});
