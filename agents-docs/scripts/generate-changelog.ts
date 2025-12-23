import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ChangelogConfig {
  source: string;
  output: string;
  title: string;
  description: string;
}

const CHANGELOGS: ChangelogConfig[] = [
  {
    source: '../../agents-run-api/CHANGELOG.md',
    output: '../content/docs/changelog/run-api.mdx',
    title: 'Agents Run API',
    description: 'All changes to the Inkeep Agents Run API',
  },
  {
    source: '../../agents-manage-api/CHANGELOG.md',
    output: '../content/docs/changelog/manage-api.mdx',
    title: 'Agents Manage API',
    description: 'All changes to the Inkeep Agents Manage API',
  },
  {
    source: '../../agents-manage-ui/CHANGELOG.md',
    output: '../content/docs/changelog/manage-ui.mdx',
    title: 'Agents Manage UI',
    description: 'All changes to the Inkeep Agents Manage UI',
  },
  {
    source: '../../agents-cli/CHANGELOG.md',
    output: '../content/docs/changelog/cli.mdx',
    title: 'Agents CLI',
    description: 'All changes to the Inkeep Agents CLI',
  },
  {
    source: '../../packages/agents-sdk/CHANGELOG.md',
    output: '../content/docs/changelog/agents-sdk.mdx',
    title: 'Agents SDK',
    description: 'All changes to the Inkeep Agents SDK',
  },
  {
    source: '../../packages/agents-core/CHANGELOG.md',
    output: '../content/docs/changelog/agents-core.mdx',
    title: 'Agents Core',
    description: 'All changes to the Inkeep Agents Core package',
  },
  {
    source: '../../packages/create-agents/CHANGELOG.md',
    output: '../content/docs/changelog/create-agents.mdx',
    title: 'Create Agents',
    description: 'All changes to the Inkeep Create Agents CLI',
  },
  {
    source: '../../packages/ai-sdk-provider/CHANGELOG.md',
    output: '../content/docs/changelog/ai-sdk-provider.mdx',
    title: 'AI SDK Provider',
    description: 'All changes to the Inkeep AI SDK Provider',
  },
];

const ICON = 'LuFileText';

function generateChangelogMdx(config: ChangelogConfig): void {
  const sourcePath = resolve(__dirname, config.source);
  const outputPath = resolve(__dirname, config.output);

  // Read the changelog
  const changelog = readFileSync(sourcePath, 'utf-8');

  // Remove the first line (package name header) and trim
  const lines = changelog.split('\n');
  const contentWithoutTitle = lines.slice(2).join('\n').trim();

  // Generate MDX with frontmatter
  const mdx = `---
title: ${config.title}
description: ${config.description}
icon: ${ICON}
---

${contentWithoutTitle}
`;

  writeFileSync(outputPath, mdx);
  console.log(`Generated changelog at ${outputPath}`);
}

function main(): void {
  console.log('Generating changelog documentation...');
  console.time('Done in');

  for (const config of CHANGELOGS) {
    generateChangelogMdx(config);
  }

  console.timeEnd('Done in');
}

main();