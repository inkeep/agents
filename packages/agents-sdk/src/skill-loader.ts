import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { SkillDefinition } from './types';

const frontmatterSchema = z.object({
  name: z.string().trim().nonempty(),
  description: z.string().trim().nonempty(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  license: z.string().trim().optional(),
  compatibility: z.string().trim().optional(),
  allowedTools: z.union([z.string(), z.array(z.string())]).optional(),
  scripts: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  assets: z.array(z.string()).optional(),
});

function toSkillId(filePath: string): string {
  const { dir, name } = path.parse(filePath);
  const withoutExt = path.join(dir, name);

  return withoutExt.replaceAll(path.sep, '-');
}

function normalizeStringList(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : value.split(/\s+/).filter(Boolean);
}

export function loadSkills(directoryPath: string): SkillDefinition[] {
  const files = fs.globSync('**/*.{md,mdx}', {
    cwd: directoryPath,
  });
  return files.map((filePath) => {
    const resolvedPath = path.join(directoryPath, filePath);
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const { data, content } = matter(fileContent);
    const {
      name,
      description,
      metadata,
      license,
      compatibility,
      allowedTools,
      scripts,
      references,
      assets,
    } = frontmatterSchema.parse(data);
    const id = toSkillId(filePath);

    return {
      id,
      name,
      description,
      metadata,
      license,
      compatibility,
      allowedTools: normalizeStringList(allowedTools),
      scripts,
      references,
      assets,
      content: content.trim(),
    };
  });
}
