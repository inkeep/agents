import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkMdx from 'remark-mdx';
import { mdxSnippet } from 'remark-mdx-snippets';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const SKILLS_DIR = path.join(process.cwd(), 'skills-collections');
const TEMPLATES_DIR = path.join(SKILLS_DIR, '_templates');
const GENERATED_DIR = path.join(SKILLS_DIR, '.generated');
const SNIPPETS_DIR = path.join(process.cwd(), '_snippets');

interface CollectionPage {
  title: string;
  description: string;
  url: string;
  slugPath: string;
  rawContent: string;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function filePathToUrl(filePath: string): string {
  const relativePath = path.relative(CONTENT_DIR, filePath);
  return (
    '/' +
    relativePath
      .replace(/\.mdx?$/, '')
      .replace(/\/index$/, '')
      .replace(/\(.*?\)\//g, '') // Remove route groups like (docker)/
  );
}

function urlToSlugPath(url: string): string {
  return url.replace(/^\//, '').replace(/\/$/, '') || 'index';
}

function generateTable(pages: CollectionPage[]): string {
  const header = '| Title | Description |\n| --- | --- |';
  const rows = pages.map((page) => {
    const title = escapeTableCell(page.title);
    const description = escapeTableCell(page.description || '');
    const link = `[${title}](./rules/${page.slugPath}.md)`;
    return `| ${link} | ${description} |`;
  });
  return [header, ...rows].join('\n');
}

function toTitleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function loadTemplate(collectionName: string): Promise<string> {
  const collectionTemplatePath = path.join(TEMPLATES_DIR, `${collectionName}.mdx`);
  const defaultTemplatePath = path.join(TEMPLATES_DIR, 'default.mdx');

  if (fs.existsSync(collectionTemplatePath)) {
    return fs.promises.readFile(collectionTemplatePath, 'utf-8');
  }
  if (fs.existsSync(defaultTemplatePath)) {
    return fs.promises.readFile(defaultTemplatePath, 'utf-8');
  }

  return `# {{COLLECTION_NAME}}\n\n## Rules\n\n{{RULES_TABLE}}`;
}

function applyTemplate(
  template: string,
  collectionName: string,
  table: string,
  rulesCount: number
): string {
  return template
    .replace(/\{\{COLLECTION_NAME\}\}/g, toTitleCase(collectionName))
    .replace(/\{\{RULES_TABLE\}\}/g, table)
    .replace(/\{\{RULES_COUNT\}\}/g, String(rulesCount));
}

function stripReactFragments(content: string): string {
  // Remove React fragment wrappers (<> and </>) that remark-mdx-snippets adds
  // when expanding snippets with multiple children
  return content
    .replace(/^<>\n/gm, '') // Opening fragment at start of line
    .replace(/\n<\/>$/gm, '') // Closing fragment at end of line
    .replace(/<>\n/g, '') // Opening fragment inline
    .replace(/\n<\/>/g, ''); // Closing fragment inline
}

async function processMarkdown(content: string): Promise<string> {
  // Process with remark + mdx-snippets to expand snippets
  const processor = remark().use(remarkMdx).use(mdxSnippet, { snippetsDir: SNIPPETS_DIR });

  const result = await processor.process(content);
  // Strip React fragments that remark-mdx-snippets adds for multi-child snippets
  return stripReactFragments(String(result));
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n/, '');
}

async function main() {
  console.log('Generating skill collections...');

  // Find all MDX files
  const mdxFiles = await glob('**/*.mdx', { cwd: CONTENT_DIR, absolute: true });
  console.log(`Found ${mdxFiles.length} MDX files`);

  const collections = new Map<string, CollectionPage[]>();

  for (const filePath of mdxFiles) {
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);

    const skillCollections = frontmatter.skillCollections as string[] | undefined;
    if (!skillCollections || skillCollections.length === 0) {
      continue;
    }

    const url = filePathToUrl(filePath);
    const title = (frontmatter.title as string) || path.basename(filePath, '.mdx');
    const description = (frontmatter.description as string) || '';

    for (const collectionName of skillCollections) {
      if (!collections.has(collectionName)) {
        collections.set(collectionName, []);
      }

      collections.get(collectionName)?.push({
        title,
        description,
        url,
        slugPath: urlToSlugPath(url),
        rawContent: content,
      });
    }
  }

  if (collections.size === 0) {
    console.log('No pages with skillCollections found. Skipping generation.');
    return;
  }

  console.log(`Found ${collections.size} skill collection(s):`);
  for (const [name, pages] of collections) {
    console.log(`  - ${name}: ${pages.length} rule(s)`);
  }

  // Clean and recreate generated directory
  await fs.promises.rm(GENERATED_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(GENERATED_DIR, { recursive: true });

  // Generate root README for the target repo
  const collectionsList = Array.from(collections.keys())
    .map((name) => `- [${toTitleCase(name)}](./${name}/skill.md)`)
    .join('\n');
  const rootReadme = `# Inkeep Skills

Generated skill collections from the [Inkeep Agent Framework](https://github.com/inkeep/agents) documentation.

## Available Collections

${collectionsList}

## About

These skill collections are curated sets of documentation rules designed for use with AI agents, LLMs, or any system that needs structured reference documentation.

Each collection contains:
- \`skill.md\` — Overview and table of contents
- \`rules/\` — Individual rule files with full content

---

*Auto-generated from [inkeep/agents](https://github.com/inkeep/agents). Do not edit directly.*
`;
  await fs.promises.writeFile(path.join(GENERATED_DIR, 'README.md'), rootReadme);

  for (const [collectionName, collectionPages] of collections) {
    const collectionDir = path.join(GENERATED_DIR, collectionName);
    const rulesDir = path.join(collectionDir, 'rules');

    await fs.promises.mkdir(rulesDir, { recursive: true });

    // Generate skill.md from template
    const template = await loadTemplate(collectionName);
    const table = generateTable(collectionPages);
    const skillMd = applyTemplate(template, collectionName, table, collectionPages.length);

    await fs.promises.writeFile(path.join(collectionDir, 'skill.md'), skillMd);
    console.log(`  Created ${collectionName}/skill.md`);

    // Generate individual rule files
    for (const page of collectionPages) {
      const ruleFilePath = path.join(rulesDir, `${page.slugPath}.md`);
      const ruleDir = path.dirname(ruleFilePath);
      await fs.promises.mkdir(ruleDir, { recursive: true });

      // Process markdown to expand snippets
      let processedContent: string;
      try {
        processedContent = await processMarkdown(page.rawContent);
      } catch (_err) {
        console.warn(`  Warning: Could not process ${page.url}, using raw content`);
        processedContent = stripFrontmatter(page.rawContent);
      }

      const header = `# ${page.title}\n\nURL: ${page.url}\n\n${page.description ? `${page.description}\n\n` : ''}`;
      await fs.promises.writeFile(ruleFilePath, header + processedContent);
    }
    console.log(`  Created ${collectionPages.length} rule file(s) in ${collectionName}/rules/`);
  }

  console.log('Skill collections generated successfully!');
}

main().catch((err) => {
  console.error('Error generating skill collections:', err);
  process.exit(1);
});
