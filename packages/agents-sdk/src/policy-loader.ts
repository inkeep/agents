import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { PolicyDefinition } from './types';

const frontmatterSchema = z.object({
  name: z.string().nonempty('name is required'),
  description: z.string().nonempty('description is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function toPolicyId(filePath: string): string {
  const { dir, name } = path.parse(filePath);
  const withoutExt = path.join(dir, name);

  return withoutExt.replaceAll(path.sep, '-');
}

export function loadPolicies(directoryPath: string): PolicyDefinition[] {
  const files = fs.globSync('**/*.{md,mdx}', {
    cwd: directoryPath,
  });
  return files.map((filePath) => {
    const resolvedPath = path.join(directoryPath, filePath);
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const { data, content } = matter(fileContent);
    const frontmatter = frontmatterSchema.parse(data);
    const id = toPolicyId(filePath);

    return {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      content: content.trim(),
      metadata: frontmatter.metadata ?? null,
    };
  });
}
