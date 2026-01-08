import fs from 'node:fs';
import path from 'node:path';
import { simplematter } from 'simplematter';
import { z } from 'zod';
import type { SkillDefinition } from './types';

const frontmatterSchema = z.object({
  name: z.string().trim().nonempty(),
  description: z.string().trim().nonempty(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
});

function toSkillId(filePath: string): string {
  const { dir, name } = path.parse(filePath);
  const withoutExt = path.join(dir, name);

  return withoutExt.replaceAll(path.sep, '-');
}

export function loadSkills(directoryPath: string): SkillDefinition[] {
  const files = fs.globSync('*/SKILL.md', {
    cwd: directoryPath,
  });

  return files.map((filePath) => {
    const resolvedPath = path.join(directoryPath, filePath);
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const [frontmatter, document] = simplematter(fileContent);
    const { name, description, metadata } = frontmatterSchema.parse(frontmatter);
    const id = toSkillId(filePath);

    return {
      id,
      name,
      description,
      metadata,
      content: document.trim(),
    };
  });
}
