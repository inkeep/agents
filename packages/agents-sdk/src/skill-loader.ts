import fs from 'node:fs';
import path from 'node:path';
import { simplematter } from 'simplematter';
import { z } from 'zod';
import type { SkillDefinition } from './types';

export const frontmatterSchema = z.object({
  name: z
    .string()
    .trim()
    .nonempty()
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)')
    // must not start or end with hyphen
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Must not start or end with a hyphen (-)')
    // no consecutive hyphens
    .refine((v) => !v.includes('--'), 'Must not contain consecutive hyphens (--)'),
  description: z.string().trim().nonempty().max(1024),
  metadata: z.record(z.string(), z.string()).nullable().optional().default(null),
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
