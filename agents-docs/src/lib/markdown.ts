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

const PASCAL_CASE_IDENT = /([A-Z][a-zA-Z0-9]*)(\[\])?/g;

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

function linkifyPascalCaseInHast(node: any, typeLinks: Map<string, string>): any | any[] {
  if (typeLinks.size === 0) return node;

  if (node.type === 'text') {
    const value = node.value;
    const parts: string[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    PASCAL_CASE_IDENT.lastIndex = 0;
    while ((m = PASCAL_CASE_IDENT.exec(value)) !== null) {
      parts.push(value.slice(lastEnd, m.index));
      parts.push(m[1] + (m[2] ?? ''));
      lastEnd = m.index + m[0].length;
    }
    if (parts.length === 0) return node;
    parts.push(value.slice(lastEnd));
    const out: any[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const display = parts[i];
        const name = display.replace(/\[\]$/, '');
        const anchor = typeLinks.get(name);
        if (anchor) {
          out.push(linkNode(anchor, display));
        } else {
          out.push(textNode(display));
        }
      } else if (parts[i]) {
        out.push(textNode(parts[i]));
      }
    }
    return out.length === 1 ? out[0] : out;
  }
  if ((node.type === 'element' || node.type === 'root') && Array.isArray(node.children)) {
    const children = (node.children as any[]).flatMap((c: any) => {
      const r = linkifyPascalCaseInHast(c, typeLinks);
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

  const linkified = linkifyPascalCaseInHast(nodes, typeLinks);
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
