import path from 'node:path';
import type { InferPageType } from 'fumadocs-core/source';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import { mdxSnippet } from 'remark-mdx-snippets';
import { remarkSourceCode } from 'remark-source-code';
import type { source } from '@/lib/source';

const processor = remark()
  .use(remarkMdx)
  .use(mdxSnippet, { snippetsDir: path.resolve(process.cwd(), '_snippets') })
  .use(remarkSourceCode)
  .use(remarkGfm);

export async function getMarkdown(page: InferPageType<typeof source>): Promise<string> {
  const processed = await processor.process({
    value: await page.data.getText('raw'),
  });

  return String(processed.value);
}
