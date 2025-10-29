import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateFiles } from 'fumadocs-openapi';

const OUTPUT_DIR = './content/docs/api-reference';
const DEFAULT_ICON = 'LuDatabaseZap';

async function addIconToFrontmatter(filePath) {
  const content = await readFile(filePath, 'utf-8');

  // Check if file has frontmatter
  if (!content.startsWith('---')) {
    return;
  }

  // Check if icon already exists
  if (content.includes('icon:')) {
    return;
  }

  // Split content into frontmatter and body
  const parts = content.split('---');
  if (parts.length < 3) {
    return;
  }

  const frontmatter = parts[1];
  const body = parts.slice(2).join('---');

  // Add icon to frontmatter
  const updatedFrontmatter = `${frontmatter.trimEnd()}\nicon: ${DEFAULT_ICON}\n`;
  const updatedContent = `---${updatedFrontmatter}---${body}`;

  await writeFile(filePath, updatedContent, 'utf-8');
  console.log(`Added icon to: ${filePath}`);
}

async function processDirectory(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      await addIconToFrontmatter(fullPath);
    }
  }
}

async function main() {
  console.log('Generating OpenAPI documentation...');

  await generateFiles({
    input: './src/lib/index.json',
    output: OUTPUT_DIR,
    per: 'file',
    includeDescription: true,
  });

  console.log('\nAdding icons to generated files...');
  await processDirectory(OUTPUT_DIR);

  console.log('\nDone!');
}

main().catch(console.error);
