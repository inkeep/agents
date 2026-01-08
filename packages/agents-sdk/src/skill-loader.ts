import fs from 'node:fs';
import path from 'node:path';
import { SkillFrontmatterSchema } from '@inkeep/agents-core/client-exports';
import { simplematter } from 'simplematter';
import type { SkillDefinition } from './types';

function getParentDirName(filePath: string): string {
  return path.basename(path.dirname(filePath));
}

export function loadSkills(directoryPath: string): SkillDefinition[] {
  const files = fs.globSync('*/SKILL.md', {
    cwd: directoryPath,
  });

  return files.map((filePath) => {
    const resolvedPath = path.join(directoryPath, filePath);
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const [frontmatter, document] = simplematter(fileContent);
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
