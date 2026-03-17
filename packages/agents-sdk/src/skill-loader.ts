import fs from 'node:fs';
import path from 'node:path';
import { parseSkillMarkdown, SkillFrontmatterSchema } from '@inkeep/agents-core';
import type { SkillDefinition } from './types';

function getParentDirName(filePath: string): string {
  return path.basename(path.dirname(filePath));
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function loadSkillFiles(skillDir: string) {
  return fs
    .globSync('**/*', {
      cwd: skillDir,
    })
    .filter((filePath) => fs.statSync(path.join(skillDir, filePath)).isFile())
    .map((filePath) => ({
      filePath: toPosixPath(filePath),
      content: fs.readFileSync(path.join(skillDir, filePath), 'utf8'),
    }));
}

export function loadSkills(directoryPath: string): SkillDefinition[] {
  const files = fs.globSync('*/SKILL.md', {
    cwd: directoryPath,
  });

  const result = files.map((filePath) => {
    const skillDir = path.join(directoryPath, path.dirname(filePath));
    const skillFiles = loadSkillFiles(skillDir);
    const skillFile = skillFiles.find((file) => file.filePath === 'SKILL.md');

    if (!skillFile) {
      throw new Error('Skill directory must include SKILL.md');
    }

    const { frontmatter, content } = parseSkillMarkdown(skillFile.content);
    const { name, description, metadata } = SkillFrontmatterSchema.parse(frontmatter);

    const id = getParentDirName(filePath);
    if (name !== id) {
      throw new Error(`Skill name "${name}" does not match directory "${id}"`);
    }

    return {
      id,
      name,
      description,
      metadata,
      content: document.trim(),
    };
  });
}
