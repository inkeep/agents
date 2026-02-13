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

function textNode(value: string): any {
  return { type: 'text', value };
}

function linkNode(anchor: string, display: string): any {
  return {
    type: 'element',
    tagName: 'a',
    properties: { href: '#' + anchor },
    children: [textNode(display)],
  };
}

function buildTypePattern(typeLinks: Map<string, string>): RegExp {
  const escaped = [...typeLinks.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${escaped.join('|')})(\\[\\])?`, 'g');
}

function linkifyTypesInHast(node: any, typeLinks: Map<string, string>): any | any[] {
  if (typeLinks.size === 0) return node;

  if (node.type === 'text') {
    const pattern = buildTypePattern(typeLinks);
    const value = node.value;
    const parts: any[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(value)) !== null) {
      if (m.index > lastEnd) parts.push(textNode(value.slice(lastEnd, m.index)));
      const name = m[1];
      const display = name + (m[2] ?? '');
      const anchor = typeLinks.get(name) ?? name.toLowerCase();
      parts.push(linkNode(anchor, display));
      lastEnd = m.index + m[0].length;
    }
    if (parts.length === 0) return node;
    if (lastEnd < value.length) parts.push(textNode(value.slice(lastEnd)));
    return parts.length === 1 ? parts[0] : parts;
  }

  if ((node.type === 'element' || node.type === 'root') && Array.isArray(node.children)) {
    const children = (node.children as any[]).flatMap((c: any) => {
      const r = linkifyTypesInHast(c, typeLinks);
      return Array.isArray(r) ? r : [r];
    });
    return { ...node, children };
  }

  return node;
}

export async function renderTypeToHast(
  type: string,
  typeLinks: Map<string, string> = new Map()
): Promise<any> {
  const nodes = await highlightHast(type, {
    ...shikiOptions,
    lang: 'ts',
    structure: 'inline',
  });

  const linkified = linkifyTypesInHast(nodes, typeLinks);
  let innerChildren: any[] =
    linkified?.type === 'element' || linkified?.type === 'root'
      ? ((linkified.children as any[]) ?? [])
      : [linkified];
  if (
    innerChildren.length === 1 &&
    innerChildren[0]?.type === 'element' &&
    Array.isArray(innerChildren[0].children)
  ) {
    innerChildren = innerChildren[0].children;
  }

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
        children: innerChildren,
      },
    ],
  };
}

export async function renderMarkdownToHast(md: string): Promise<any> {
  md = md.replace(/{@link (?<link>[^}]*)}/g, '$1'); // replace jsdoc links

  return processor.run(processor.parse(md));
}
