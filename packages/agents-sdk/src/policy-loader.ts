import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import type { PolicyDefinition } from './types';

const frontmatterSchema = z.object({
  name: z.string().nonempty('name is required'),
  description: z.string().nonempty('description is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function walkMarkdownFiles(dir: string, root: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const entryStat = statSync(fullPath);

    if (entryStat.isDirectory()) {
      const nested = walkMarkdownFiles(fullPath, root);
      files.push(...nested);
    } else {
      const ext = extname(entry).toLowerCase();
      if (ext === '.md' || ext === '.markdown' || ext === '.mdx') {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toPolicyId(root: string, filePath: string): string {
  const relativePath = relative(root, filePath);
  const withoutExt = relativePath.replace(extname(relativePath), '');
  return withoutExt.split(sep).filter(Boolean).join('-');
}

export function loadPolicies(directoryPath: string): PolicyDefinition[] {
  const files = walkMarkdownFiles(directoryPath, directoryPath);
  const policies: PolicyDefinition[] = [];

  for (const filePath of files) {
    const fileContent = readFileSync(filePath, 'utf8');
    const parsed = matter(fileContent);
    const frontmatter = frontmatterSchema.parse(parsed.data ?? {});

    policies.push({
      id: toPolicyId(directoryPath, filePath),
      name: frontmatter.name,
      description: frontmatter.description,
      content: parsed.content.trim(),
      metadata: frontmatter.metadata ?? null,
    });
  }

  return policies;
}
