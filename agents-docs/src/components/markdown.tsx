/**
 * This is just for any custom sprinkles of markdown needed in layout, fumadocs handles content markdown
 */

import {
  type RehypeCodeOptions,
  rehypeCode,
  remarkGfm,
  remarkImage,
} from 'fumadocs-core/mdx-plugins';
import { type Jsx, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { MDXComponents } from 'mdx/types';
import type { ReactElement } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';
import { getMDXComponents } from '@/mdx-components';

const processor = remark()
  .use(remarkGfm)
  .use(remarkImage, { useImport: false })
  .use(remarkRehype)
  .use(rehypeCode, {
    langs: [],
    lazy: true,
  } satisfies Partial<RehypeCodeOptions>);

export async function Markdown(props: {
  text: string;
  components?: MDXComponents;
}): Promise<ReactElement> {
  const nodes = processor.parse({ value: props.text });
  const hast = await processor.run(nodes);

  const components = getMDXComponents(props.components);

  return toJsxRuntime(hast, {
    development: false,
    jsx: jsx as Jsx,
    jsxs: jsxs as Jsx,
    Fragment,
    components,
  });
}
