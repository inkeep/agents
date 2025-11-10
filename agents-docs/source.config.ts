import path from 'node:path';
import html from '@shikijs/langs/html';
import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import emoji from 'remark-emoji';
import { mdxSnippet } from 'remark-mdx-snippets';
import { remarkSourceCode } from 'remark-source-code';
import { z } from 'zod';

// You can customise Zod schemas for frontmatter here
// see https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      sidebarTitle: z.string().optional(),
      keywords: z.string().optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (v) => [
      [remarkSourceCode, { baseDir: '..' }],
      [mdxSnippet, { snippetsDir: path.resolve(process.cwd(), '_snippets') }],
      [emoji, { accessible: true }],
      ...v,
    ],
    rehypeCodeOptions: {
      inline: 'tailing-curly-colon',
      themes: {
        dark: 'houston',
        light: 'slack-ochin',
      },
      langs: [html],
    },
  },
});
