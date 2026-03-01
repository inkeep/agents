import path from 'node:path';
import html from '@shikijs/langs/html';
import { remarkMermaid } from '@theguild/remark-mermaid';
import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import emoji from 'remark-emoji';
import { mdxSnippet } from 'remark-mdx-snippets';
import { remarkSourceCode } from 'remark-source-code';
import { z } from 'zod';
import { formatFreshnessDate } from './src/lib/freshness';

// You can customise Zod schemas for frontmatter here
// see https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
  dir: 'content',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
    // Dates should be valid ISO date strings when provided.
    // If only one of datePublished/dateModified is present, SEO checks report it for review.
    schema: frontmatterSchema.extend({
      sidebarTitle: z.string().optional(),
      keywords: z.union([z.string(), z.array(z.string())]).optional(),
      datePublished: z
        .string()
        .trim()
        .optional()
        .refine(
          (value) => !value || Boolean(formatFreshnessDate(value)),
          'datePublished must be a valid ISO date.'
        ),
      dateModified: z
        .string()
        .trim()
        .optional()
        .refine(
          (value) => !value || Boolean(formatFreshnessDate(value)),
          'dateModified must be a valid ISO date.'
        ),
      skills: z.array(z.string()).optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: (v) => [
      remarkMermaid,
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
