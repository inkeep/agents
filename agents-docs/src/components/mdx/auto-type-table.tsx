import defaultMdxComponents from 'fumadocs-ui/mdx';
import { type Jsx, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import * as runtime from 'react/jsx-runtime';
import { type ParameterNode, type TypeNode, TypeTable } from '@/components/mdx/type-table';
import { renderMarkdownToHast, renderTypeToHast } from '@/lib/markdown';
import 'server-only';
import type { ReactNode } from 'react';
import { parseTags } from '@/lib/parse-tags';

export type TypeLinksInput = string[] | Record<string, string>;

function normalizeTypeLinks(input?: TypeLinksInput): Map<string, string> {
  if (!input) return new Map();
  if (Array.isArray(input)) {
    return new Map(input.map((name) => [name, name.toLowerCase()]));
  }
  return new Map(Object.entries(input));
}

export async function AutoTypeTable({
  generator,
  options = {},
  defaultTypeLinks,
  typeLinks: typeLinksInput,
  renderType,
  renderMarkdown = renderMarkdownDefault,
  ...props
}: {
  generator: any;
  renderMarkdown?: typeof renderMarkdownDefault;
  renderType?: (type: string) => Promise<ReactNode>;
  defaultTypeLinks?: TypeLinksInput;
  typeLinks?: TypeLinksInput;
  options?: any;
}) {
  const typeLinksMap = new Map([
    ...normalizeTypeLinks(defaultTypeLinks),
    ...normalizeTypeLinks(typeLinksInput),
  ]);
  if (!renderType) {
    renderType = (type: string) => renderTypeWithLinks(type, typeLinksMap);
  }
  const output: any[] = await generator.generateTypeTable(props, options);

  return output.map(async (item) => {
    const entries = item.entries.map(async (entry: any) => {
      const tags = parseTags(entry.tags);
      const paramNodes: ParameterNode[] = [];

      for (const param of tags.params ?? []) {
        paramNodes.push({
          name: param.name,
          description: param.description ? await renderMarkdown(param.description) : undefined,
        });
      }

      return [
        entry.name,
        {
          type: await renderType(entry.simplifiedType),
          typeDescription: await renderType(entry.type),
          description: await renderMarkdown(entry.description),
          default: tags.default ? await renderType(tags.default) : undefined,
          parameters: paramNodes,
          required: entry.required,
          deprecated: entry.deprecated,
          returns: tags.returns ? await renderMarkdown(tags.returns) : undefined,
        } as TypeNode,
      ];
    });

    return <TypeTable key={item.name} type={Object.fromEntries(await Promise.all(entries))} />;
  });
}

function toJsx(hast: any) {
  return toJsxRuntime(hast, {
    Fragment: runtime.Fragment,
    jsx: runtime.jsx as Jsx,
    jsxs: runtime.jsxs as Jsx,
    components: { ...defaultMdxComponents, img: undefined },
  });
}

async function renderTypeWithLinks(
  type: string,
  typeLinks: Map<string, string> = new Map()
): Promise<ReactNode> {
  return toJsx(await renderTypeToHast(type, typeLinks));
}

async function renderMarkdownDefault(md: string): Promise<ReactNode> {
  return toJsx(await renderMarkdownToHast(md));
}
