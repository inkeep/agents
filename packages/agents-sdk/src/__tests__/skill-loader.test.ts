import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSkills } from '../skill-loader';

const createdDirs: string[] = [];

async function createSkill({
  dirName,
  frontmatter,
  body = 'Content',
}: {
  dirName: string;
  frontmatter: string;
  body?: string;
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-loader-'));
  const skillDir = path.join(root, dirName);
  await mkdir(skillDir, { recursive: true });
  const content = ['---', frontmatter.trim(), '---', '', body, ''].join('\n');
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
      frontmatter: ['name: pdf-processing', 'description: Extracts PDFs.'].join('\n'),
    });

    const [skill] = loadSkills(root);
    expect(skill.id).toBe('pdf-processing');
    expect(skill.name).toBe('pdf-processing');
    expect(skill.description).toBe('Extracts PDFs.');
    expect(skill.metadata).toBeNull();
  });

  it('accepts metadata with string values', async () => {
    const root = await createSkill({
      dirName: 'data-analysis',
      frontmatter: [
        'name: data-analysis',
        'description: Analyzes datasets.',
        'metadata:',
        '  author: example-org',
        '  version: "1.0"',
      ].join('\n'),
    });

    const [skill] = loadSkills(root);
    expect(skill.metadata).toEqual({ author: 'example-org', version: '1.0' });
  });

  it('rejects uppercase names', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      frontmatter: ['name: PDF-Processing', 'description: Extracts PDFs.'].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects names with consecutive hyphens', async () => {
    const root = await createSkill({
      dirName: 'pdf--processing',
      frontmatter: ['name: pdf--processing', 'description: Extracts PDFs.'].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects names longer than 64 characters', async () => {
    const name = 'a'.repeat(65);
    const root = await createSkill({
      dirName: name,
      frontmatter: [`name: ${name}`, 'description: Extracts PDFs.'].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects names that do not match the directory', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      frontmatter: ['name: data-analysis', 'description: Extracts PDFs.'].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects empty descriptions', async () => {
    const root = await createSkill({
      dirName: 'pdf-processing',
      frontmatter: ['name: pdf-processing', 'description: "   "'].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects descriptions longer than 1024 characters', async () => {
    const description = 'a'.repeat(1025);
    const root = await createSkill({
      dirName: 'pdf-processing',
      frontmatter: [`name: pdf-processing`, `description: ${description}`].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });

  it('rejects metadata with non-string values', async () => {
    const root = await createSkill({
      dirName: 'data-analysis',
      frontmatter: [
        'name: data-analysis',
        'description: Analyzes datasets.',
        'metadata:',
        '  author: 123',
      ].join('\n'),
    });

    expect(() => loadSkills(root)).toThrow();
  });
});
