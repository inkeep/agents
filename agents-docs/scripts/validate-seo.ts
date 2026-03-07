import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
// @ts-expect-error -- must specify ts extension for node --experimental-strip-types
import { parseFreshnessMetadata } from '../src/lib/freshness.ts';

const CONTENT_DIR = path.resolve(import.meta.dirname, '../content');
const TITLE_TEMPLATE_SUFFIX = ' - Inkeep Open Source Docs';
const MAX_RENDERED_TITLE_LENGTH = 70;
const MIN_DESCRIPTION_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 160;

interface Issue {
  file: string;
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

function analyzeImageAlt(contentWithoutCodeFences: string) {
  let missingAlt = 0;
  let genericAlt = 0;

  const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of contentWithoutCodeFences.matchAll(markdownImagePattern)) {
    const altText = match[1]?.trim();
    if (!altText) {
      missingAlt += 1;
      continue;
    }

    if (altText.toLowerCase() === 'image') {
      genericAlt += 1;
    }
  }

  const jsxImagePattern = /<(img|Image)\b[^>]*>/g;
  for (const match of contentWithoutCodeFences.matchAll(jsxImagePattern)) {
    const tag = match[0];
    if (!/\balt\s*=/.test(tag)) {
      missingAlt += 1;
      continue;
    }

    const stringAltMatch = tag.match(/\balt\s*=\s*(["'])(.*?)\1/);
    const wrappedStringAltMatch = tag.match(/\balt\s*=\s*\{(["'])(.*?)\1\}/);
    const altText = stringAltMatch?.[2] ?? wrappedStringAltMatch?.[2];

    if (altText?.trim().toLowerCase() === 'image') {
      genericAlt += 1;
    }
  }

  return { missingAlt, genericAlt };
}

async function validateSeo() {
  const mdxFiles = await glob('**/*.mdx', { cwd: CONTENT_DIR, absolute: true });

  const issues: Issue[] = [];
  const titleMap = new Map<string, string>();
  const descriptionMap = new Map<string, string>();

  for (const filePath of mdxFiles) {
    const relativePath = path.relative(CONTENT_DIR, filePath);
    if (relativePath.includes('(openapi)')) continue;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);
    const contentWithoutCodeFences = content.replace(/```[\s\S]*?```/g, '');

    const title = frontmatter.title as string | undefined;
    const description = frontmatter.description as string | undefined;
    const datePublished = frontmatter.datePublished as string | undefined;
    const dateModified = frontmatter.dateModified as string | undefined;
    const freshness = parseFreshnessMetadata(datePublished, dateModified);

    if (!description) {
      issues.push({
        file: relativePath,
        rule: 'missing-description',
        severity: 'error',
        message: 'Frontmatter is missing a "description" field.',
      });
    }

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

      if (description.length < MIN_DESCRIPTION_LENGTH) {
        issues.push({
          file: relativePath,
          rule: 'description-too-short',
          severity: 'warning',
          message: `Description is ${description.length} chars (recommended: >= ${MIN_DESCRIPTION_LENGTH}).`,
        });
      }

      if (description.length > MAX_DESCRIPTION_LENGTH) {
        issues.push({
          file: relativePath,
          rule: 'description-too-long',
          severity: 'warning',
          message: `Description is ${description.length} chars (recommended: <= ${MAX_DESCRIPTION_LENGTH}).`,
        });
      }
    }

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

    if ((datePublished && !dateModified) || (!datePublished && dateModified)) {
      issues.push({
        file: relativePath,
        rule: 'date-pair-missing',
        severity: 'warning',
        message:
          'Use both datePublished and dateModified together when setting freshness metadata.',
      });
    }

    if (datePublished && !freshness.datePublished) {
      issues.push({
        file: relativePath,
        rule: 'invalid-date-published',
        severity: 'warning',
        message: `datePublished is not a valid date string: "${datePublished}".`,
      });
    }

    if (dateModified && !freshness.dateModified) {
      issues.push({
        file: relativePath,
        rule: 'invalid-date-modified',
        severity: 'warning',
        message: `dateModified is not a valid date string: "${dateModified}".`,
      });
    }

    if (freshness.datePublished && freshness.dateModified && !freshness.isChronologicallyValid) {
      issues.push({
        file: relativePath,
        rule: 'freshness-order',
        severity: 'warning',
        message: 'dateModified should be greater than or equal to datePublished.',
      });
    }

    const h1Regex = /^#\s+/m;
    if (h1Regex.test(contentWithoutCodeFences)) {
      issues.push({
        file: relativePath,
        rule: 'body-h1',
        severity: 'error',
        message:
          'Body contains a markdown h1 (# Heading). Use ## or lower - the frontmatter title is already rendered as h1.',
      });
    }

    const { missingAlt, genericAlt } = analyzeImageAlt(contentWithoutCodeFences);
    if (missingAlt > 0) {
      issues.push({
        file: relativePath,
        rule: 'image-alt-missing',
        severity: 'warning',
        message: `${missingAlt} image(s) are missing alt text.`,
      });
    }

    if (genericAlt > 0) {
      issues.push({
        file: relativePath,
        rule: 'image-alt-generic',
        severity: 'warning',
        message: `${genericAlt} image(s) use generic alt text "Image".`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`\n⚠  ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      console.log(`  ${warning.file} [${warning.rule}] ${warning.message}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n✖  ${errors.length} error(s):`);
    for (const error of errors) {
      console.log(`  ${error.file} [${error.rule}] ${error.message}`);
    }
    console.log('');
    process.exit(1);
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log('✔  SEO validation passed - no issues found.');
  } else {
    console.log('\n✔  SEO validation passed (warnings only).');
  }
}

void validateSeo();
