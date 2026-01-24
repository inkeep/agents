import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import { mdxSnippet } from 'remark-mdx-snippets';
import { z } from 'zod';

const CONTENT_DIR = path.join(process.cwd(), 'content');
const SKILLS_DIR = path.join(process.cwd(), 'skills-collections');
const TEMPLATES_DIR = path.join(SKILLS_DIR, '_templates');
const SKILL_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'skills');
const GENERATED_DIR = path.join(SKILLS_DIR, '.generated');
const SNIPPETS_DIR = path.join(process.cwd(), '_snippets');

/**
 * Resolve filename conflicts by prefixing with parent folder names.
 * Only applies prefixes to files that have conflicts.
 */
function resolveFilenameConflicts(pages: CollectionPage[]): Map<string, string> {
  const slugToFilename = new Map<string, string>();

  // Group pages by their base filename
  const filenameGroups = new Map<string, CollectionPage[]>();
  for (const page of pages) {
    const parts = page.slugPath.split('/');
    const baseName = parts[parts.length - 1] || page.slugPath;
    if (!filenameGroups.has(baseName)) {
      filenameGroups.set(baseName, []);
    }
    filenameGroups.get(baseName)?.push(page);
  }

  // Process each group
  for (const [baseName, group] of filenameGroups) {
    if (group.length === 1) {
      // No conflict - use base name
      slugToFilename.set(group[0].slugPath, baseName);
    } else {
      // Conflict - resolve by adding parent prefixes
      const resolved = resolveConflictGroup(group);
      for (const [slugPath, filename] of resolved) {
        slugToFilename.set(slugPath, filename);
      }
    }
  }

  return slugToFilename;
}

/**
 * Resolve a group of pages with the same base filename.
 * Adds parent folder prefixes until all names are unique.
 */
function resolveConflictGroup(pages: CollectionPage[]): Map<string, string> {
  const result = new Map<string, string>();

  // Start with depth 1 (base name), increase until unique
  let depth = 1;
  const maxDepth = 10; // Safety limit

  while (depth <= maxDepth) {
    const candidateNames = new Map<string, string[]>();

    for (const page of pages) {
      const parts = page.slugPath.split('/');
      // Take last `depth` parts and join with hyphen
      const nameParts = parts.slice(-depth);
      const candidate = nameParts.join('-');

      if (!candidateNames.has(candidate)) {
        candidateNames.set(candidate, []);
      }
      candidateNames.get(candidate)?.push(page.slugPath);
    }

    // Check if all names are unique
    let allUnique = true;
    for (const slugPaths of candidateNames.values()) {
      if (slugPaths.length > 1) {
        allUnique = false;
        break;
      }
    }

    if (allUnique) {
      // Found unique names at this depth
      for (const [candidate, slugPaths] of candidateNames) {
        result.set(slugPaths[0], candidate);
      }
      return result;
    }

    depth++;
  }

  // Fallback: use full slug path with hyphens
  for (const page of pages) {
    result.set(page.slugPath, page.slugPath.replace(/\//g, '-'));
  }
  return result;
}

/**
 * Get the topic path from a slug path.
 * E.g., "typescript-sdk/credentials/overview" -> "typescript-sdk/credentials"
 */
function getTopicPath(slugPath: string): string {
  const parts = slugPath.split('/');
  if (parts.length <= 1) {
    return slugPath;
  }
  return parts.slice(0, -1).join('/');
}

/**
 * Agent Skills Specification Schema
 * @see https://agentskills.io/specification
 */
const skillMetadataSchema = z.object({
  // Required: 1-64 chars, lowercase alphanumeric + hyphens, no start/end hyphen, no consecutive hyphens
  name: z
    .string()
    .min(1, 'name must be at least 1 character')
    .max(64, 'name must be at most 64 characters')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'name must be lowercase letters, numbers, and single hyphens (no start/end/consecutive hyphens)'
    ),
  // Required: 1-1024 chars, describes what skill does and when to use it
  description: z
    .string()
    .min(1, 'description must be at least 1 character')
    .max(1024, 'description must be at most 1024 characters'),
  // Optional: license name or reference to bundled license file
  license: z.string().optional(),
  // Optional: 1-500 chars, environment requirements
  compatibility: z
    .string()
    .min(1, 'compatibility must be at least 1 character if provided')
    .max(500, 'compatibility must be at most 500 characters')
    .optional(),
  // Optional: arbitrary key-value metadata
  metadata: z.record(z.string(), z.string()).optional(),
  // Optional: space-delimited list of pre-approved tools (experimental)
  'allowed-tools': z.string().optional(),
});

type SkillMetadata = z.infer<typeof skillMetadataSchema>;

interface CollectionPage {
  title: string;
  description: string;
  url: string;
  slugPath: string;
  rawContent: string;
}

interface TemplateData {
  skillMetadata: SkillMetadata | null;
  content: string;
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

function generateTable(pages: CollectionPage[], filenameMap: Map<string, string>): string {
  const header = '| Title | Description |\n| --- | --- |';
  const rows = pages.map((page) => {
    const title = escapeTableCell(page.title);
    const description = escapeTableCell(page.description || '');
    const filename = filenameMap.get(page.slugPath) || page.slugPath.replace(/\//g, '-');
    const link = `[${title}](./rules/${filename}.md)`;
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

async function loadTemplate(collectionName: string): Promise<TemplateData> {
  const collectionTemplatePath = path.join(SKILL_TEMPLATES_DIR, collectionName, 'SKILL.mdx');

  if (!fs.existsSync(collectionTemplatePath)) {
    throw new Error(
      `Missing template for skill "${collectionName}". ` +
        `Create a template at: _templates/skills/${collectionName}/SKILL.mdx`
    );
  }

  const templateContent = await fs.promises.readFile(collectionTemplatePath, 'utf-8');
  const templatePath = collectionTemplatePath;

  const { data: frontmatter, content } = matter(templateContent);

  // Check if frontmatter has skill metadata fields
  if (frontmatter.name || frontmatter.description) {
    // Validate against Agent Skills spec
    const result = skillMetadataSchema.safeParse(frontmatter);
    if (!result.success) {
      const errors = result.error.issues
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`Invalid skill metadata in ${templatePath}:\n${errors}`);
    }

    // Validate that name matches collection name
    if (result.data.name !== collectionName) {
      throw new Error(
        `Skill name "${result.data.name}" in ${templatePath} must match collection name "${collectionName}"`
      );
    }

    return {
      skillMetadata: result.data,
      content,
    };
  }

  return {
    skillMetadata: null,
    content: templateContent,
  };
}

function dedent(text: string): string {
  const lines = text.split('\n');
  // Find minimum indentation (ignoring empty lines)
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^(\s*)/)?.[1].length ?? 0);
  const minIndent = Math.min(...indents, Infinity);
  if (minIndent === 0 || minIndent === Infinity) return text;
  // Remove that indentation from all lines
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

async function loadAndProcessFile(relativePath: string): Promise<string> {
  // Load a content file by path (relative to content dir) and return processed markdown
  const filePath = path.join(CONTENT_DIR, relativePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Include file not found: ${relativePath}`);
  }

  const fileContent = await fs.promises.readFile(filePath, 'utf-8');
  const { content } = matter(fileContent);

  // Process the content to expand snippets, then dedent
  const processed = await processMarkdown(content);
  return dedent(processed);
}

async function applyTemplate(
  template: string,
  collectionName: string,
  table: string,
  rulesCount: number
): Promise<string> {
  // First apply simple replacements
  let result = template
    .replace(/\{\{COLLECTION_NAME\}\}/g, toTitleCase(collectionName))
    .replace(/\{\{RULES_TABLE\}\}/g, table)
    .replace(/\{\{RULES_COUNT\}\}/g, String(rulesCount));

  // Process {{INCLUDE:path}} placeholders
  const includePattern = /\{\{INCLUDE:([^}]+)\}\}/g;
  const matches = [...result.matchAll(includePattern)];

  for (const match of matches) {
    const [placeholder, includePath] = match;
    try {
      const includedContent = await loadAndProcessFile(includePath.trim());
      result = result.replace(placeholder, includedContent);
      console.log(`    Included: ${includePath}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`    Warning: Could not include ${includePath}: ${errorMsg}`);
      result = result.replace(placeholder, `<!-- Include failed: ${includePath} -->`);
    }
  }

  return result;
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
  // Process with remark + gfm (for tables) + mdx-snippets to expand snippets
  const processor = remark()
    .use(remarkGfm)
    .use(remarkMdx)
    .use(mdxSnippet, { snippetsDir: SNIPPETS_DIR });

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

  // Create skills subdirectory
  const skillsDir = path.join(GENERATED_DIR, 'skills');
  await fs.promises.mkdir(skillsDir, { recursive: true });

  // Generate root README from template
  // Build a table of skills with name/description from their templates
  const skillsTableRows: string[] = [];
  for (const collectionName of collections.keys()) {
    try {
      const templateData = await loadTemplate(collectionName);
      if (templateData.skillMetadata) {
        const name = templateData.skillMetadata.name;
        const description = escapeTableCell(templateData.skillMetadata.description);
        skillsTableRows.push(`| [${name}](./skills/${name}/SKILL.md) | ${description} |`);
      } else {
        skillsTableRows.push(
          `| [${collectionName}](./skills/${collectionName}/SKILL.md) | *No description* |`
        );
      }
    } catch {
      skillsTableRows.push(
        `| [${collectionName}](./skills/${collectionName}/SKILL.md) | *Template missing* |`
      );
    }
  }
  const collectionsList =
    skillsTableRows.length > 0
      ? `| Skill | Description |\n| --- | --- |\n${skillsTableRows.join('\n')}`
      : '*No skills available*';

  const readmeTemplatePath = path.join(TEMPLATES_DIR, 'README.mdx');
  let rootReadme: string;
  if (fs.existsSync(readmeTemplatePath)) {
    const readmeTemplate = await fs.promises.readFile(readmeTemplatePath, 'utf-8');
    rootReadme = readmeTemplate.replace(/\{\{COLLECTIONS_LIST\}\}/g, collectionsList);
  } else {
    // Fallback if template doesn't exist
    rootReadme = `# Inkeep Skills\n\n## Available Collections\n\n${collectionsList}\n`;
  }
  await fs.promises.writeFile(path.join(GENERATED_DIR, 'README.md'), rootReadme);

  for (const [collectionName, collectionPages] of collections) {
    const collectionDir = path.join(skillsDir, collectionName);
    const rulesDir = path.join(collectionDir, 'rules');

    await fs.promises.mkdir(rulesDir, { recursive: true });

    // Resolve filename conflicts for this collection
    const filenameMap = resolveFilenameConflicts(collectionPages);

    // Load and validate template
    const templateData = await loadTemplate(collectionName);
    const table = generateTable(collectionPages, filenameMap);
    const bodyContent = await applyTemplate(
      templateData.content,
      collectionName,
      table,
      collectionPages.length
    );

    // Generate SKILL.md with proper frontmatter per Agent Skills spec
    let skillMd: string;
    if (templateData.skillMetadata) {
      // Build frontmatter from validated metadata
      const frontmatterLines = ['---'];
      frontmatterLines.push(`name: ${templateData.skillMetadata.name}`);
      frontmatterLines.push(`description: ${templateData.skillMetadata.description}`);
      if (templateData.skillMetadata.license) {
        frontmatterLines.push(`license: ${templateData.skillMetadata.license}`);
      }
      if (templateData.skillMetadata.compatibility) {
        frontmatterLines.push(`compatibility: ${templateData.skillMetadata.compatibility}`);
      }
      if (templateData.skillMetadata.metadata) {
        frontmatterLines.push('metadata:');
        for (const [key, value] of Object.entries(templateData.skillMetadata.metadata)) {
          frontmatterLines.push(`  ${key}: "${value}"`);
        }
      }
      if (templateData.skillMetadata['allowed-tools']) {
        frontmatterLines.push(`allowed-tools: ${templateData.skillMetadata['allowed-tools']}`);
      }
      frontmatterLines.push('---');
      skillMd = `${frontmatterLines.join('\n')}\n\n${bodyContent}`;
    } else {
      // No skill metadata - warn and generate without frontmatter
      console.warn(
        `  Warning: No skill metadata in template for "${collectionName}". SKILL.md will lack required frontmatter.`
      );
      skillMd = bodyContent;
    }

    await fs.promises.writeFile(path.join(collectionDir, 'SKILL.md'), skillMd);
    console.log(`  Created ${collectionName}/SKILL.md`);

    // Generate individual rule files (flattened into rules/ directory)
    for (const page of collectionPages) {
      const filename = filenameMap.get(page.slugPath) || page.slugPath.replace(/\//g, '-');
      const ruleFilePath = path.join(rulesDir, `${filename}.md`);

      // Process markdown to expand snippets
      let processedContent: string;
      try {
        processedContent = await processMarkdown(page.rawContent);
      } catch (_err) {
        console.warn(`  Warning: Could not process ${page.url}, using raw content`);
        processedContent = stripFrontmatter(page.rawContent);
      }

      // Build frontmatter for rule file
      const topicPath = getTopicPath(page.slugPath);
      const ruleFrontmatter = [
        '---',
        `title: "${page.title.replace(/"/g, '\\"')}"`,
        page.description ? `description: "${page.description.replace(/"/g, '\\"')}"` : null,
        `topic-path: "${topicPath}"`,
        '---',
      ]
        .filter(Boolean)
        .join('\n');

      const header = `# ${page.title}\n\n`;
      await fs.promises.writeFile(
        ruleFilePath,
        `${ruleFrontmatter}\n\n${header}${processedContent}`
      );
    }
    console.log(`  Created ${collectionPages.length} rule file(s) in ${collectionName}/rules/`);
  }

  console.log('Skill collections generated successfully!');
}

main().catch((err) => {
  console.error('Error generating skill collections:', err);
  process.exit(1);
});
