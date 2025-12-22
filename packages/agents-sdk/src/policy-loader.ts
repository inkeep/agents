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

function toPolicyId(root: string, filePath: string): string {
  const relativePath = path.relative(root, filePath);
  const withoutExt = relativePath.replace(path.extname(relativePath), '');
  return withoutExt.split(path.sep).filter(Boolean).join('-');
}

export function loadPolicies(directoryPath: string): PolicyDefinition[] {
  const files = fs.globSync('**/*.{md,mdx}', {
    cwd: directoryPath,
  });
  return files.map((filePath) => {
    const fileContent = fs.readFileSync(path.join(directoryPath, filePath), 'utf8');
    const parsed = matter(fileContent);
    console.log({ parsed });
    const frontmatter = frontmatterSchema.parse(parsed.data);
    console.log({ frontmatter });
    return {
      id: toPolicyId(directoryPath, filePath),
      name: frontmatter.name,
      description: frontmatter.description,
      content: parsed.content.trim(),
      metadata: frontmatter.metadata ?? null,
    };
  });
}
