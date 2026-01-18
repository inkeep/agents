import { highlightHast } from 'fumadocs-core/highlight';
import { type RehypeCodeOptions, rehypeCode, remarkGfm } from 'fumadocs-core/mdx-plugins';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';

const shikiOptions = {
  lazy: true,

  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
} satisfies RehypeCodeOptions;

const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypeCode, shikiOptions);

export async function renderTypeToHast(type: string): Promise<any> {
  const nodes = await highlightHast(type, {
    ...shikiOptions,
    lang: 'ts',
    structure: 'inline',
  });

  return {
    type: 'element',
    tagName: 'span',
    properties: {
      class: 'shiki',
    },
    children: [
      {
        type: 'element',
        tagName: 'code',
        properties: {},
        children: nodes.children as any[],
      },
    ],
  };
}

export async function renderMarkdownToHast(md: string): Promise<any> {
  md = md.replace(/{@link (?<link>[^}]*)}/g, '$1'); // replace jsdoc links

  return processor.run(processor.parse(md));
}
