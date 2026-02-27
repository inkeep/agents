import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';

const CONTENT_DIR = path.resolve(import.meta.dirname, '../content');
const TITLE_TEMPLATE_SUFFIX = ' - Inkeep Open Source Docs';
const MAX_RENDERED_TITLE_LENGTH = 70;

interface Issue {
  file: string;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

async function validateSeo() {
  const mdxFiles = await glob('**/*.mdx', { cwd: CONTENT_DIR, absolute: true });

  const issues: Issue[] = [];
  const titleMap = new Map<string, string>();
  const descriptionMap = new Map<string, string>();

  for (const filePath of mdxFiles) {
    const relativePath = path.relative(CONTENT_DIR, filePath);

    // Skip openapi-generated files
    if (relativePath.includes('(openapi)')) continue;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);

    const title = frontmatter.title as string | undefined;
    const description = frontmatter.description as string | undefined;

    // 1. missing-description
    if (!description) {
      issues.push({
        file: relativePath,
        rule: 'missing-description',
        severity: 'error',
        message: 'Frontmatter is missing a "description" field.',
      });
    }

    // 2. duplicate-title
    if (title) {
      const normalizedTitle = title.toLowerCase().trim();
      const existing = titleMap.get(normalizedTitle);
      if (existing) {
        issues.push({
          file: relativePath,
          rule: 'duplicate-title',
          severity: 'error',
          message: `Duplicate title "${title}" (also in ${existing}).`,
        });
      } else {
        titleMap.set(normalizedTitle, relativePath);
      }
    }

    // 3. duplicate-description
    if (description) {
      const normalizedDesc = description.toLowerCase().trim();
      const existing = descriptionMap.get(normalizedDesc);
      if (existing) {
        issues.push({
          file: relativePath,
          rule: 'duplicate-description',
          severity: 'error',
          message: `Duplicate description (also in ${existing}).`,
        });
      } else {
        descriptionMap.set(normalizedDesc, relativePath);
      }
    }

    // 4. title-too-long
    if (title) {
      const renderedLength = (title + TITLE_TEMPLATE_SUFFIX).length;
      if (renderedLength > MAX_RENDERED_TITLE_LENGTH) {
        issues.push({
          file: relativePath,
          rule: 'title-too-long',
          severity: 'warning',
          message: `Rendered title is ${renderedLength} chars (max ${MAX_RENDERED_TITLE_LENGTH}): "${title + TITLE_TEMPLATE_SUFFIX}"`,
        });
      }
    }

    // 5. body-h1 — check for # headings in body (skip content inside code fences)
    const bodyWithoutCodeFences = content.replace(/```[\s\S]*?```/g, '');
    const h1Regex = /^#\s+/m;
    if (h1Regex.test(bodyWithoutCodeFences)) {
      issues.push({
        file: relativePath,
        rule: 'body-h1',
        severity: 'error',
        message:
          'Body contains a markdown h1 (# Heading). Use ## or lower — the frontmatter title is already rendered as h1.',
      });
    }
  }

  // Print results
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`\n⚠  ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${w.file} [${w.rule}] ${w.message}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n✖  ${errors.length} error(s):`);
    for (const e of errors) {
      console.log(`  ${e.file} [${e.rule}] ${e.message}`);
    }
    console.log('');
    process.exit(1);
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log('✔  SEO validation passed — no issues found.');
  } else {
    console.log('\n✔  SEO validation passed (warnings only).');
  }
}

void validateSeo();
