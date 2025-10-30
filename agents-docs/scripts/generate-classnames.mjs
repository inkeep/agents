import {
  // aiSearchComponentIds,
  aiChatComponentIds,
  markDownComponentIds,
  SearchBarComponentIds,
  modalComponentIds,
  chatButtonComponentIds,
  miscellanousComponentIds,
  toKebabCase,
} from '@inkeep/agents-ui';

import fs from 'node:fs';
import path from 'node:path';

const categories = [
  // {
  //   name: 'Search Components',
  //   ids: aiSearchComponentIds,
  // },
  {
    name: 'Chat Components',
    ids: aiChatComponentIds,
  },
  {
    name: 'Markdown Components',
    ids: markDownComponentIds,
  },
  {
    name: 'Search Bar Components',
    ids: SearchBarComponentIds,
  },
  {
    name: 'Modal Components',
    ids: modalComponentIds,
  },
  {
    name: 'Chat Button Components',
    ids: chatButtonComponentIds,
  },
  {
    name: 'Miscellaneous Components',
    ids: miscellanousComponentIds,
  },
];

export async function generateClassNamesDocs() {
  const markdown = generateMarkdown();
  const outputPath = path.join(process.cwd(), '_snippets/generated/style-classnames.mdx');
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, markdown);
  console.log('Widget Classnames documentation generated successfully!');
}

function generateMarkdown() {
  let markdown = '';

  for (const category of categories) {
    markdown += `### ${category.name}\n\n`;
    markdown += '```css\n';

    for (const id of Object.keys(category.ids)) {
      const prefixedClassName = `ikp-${toKebabCase(id)}`;
      markdown += `${prefixedClassName}\n`;
    }
    markdown += '```\n\n';
  }

  return markdown;
}

async function main() {
  generateClassNamesDocs();
}

main().catch(console.error);
