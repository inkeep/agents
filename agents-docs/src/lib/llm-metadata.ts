export interface LLMSection {
  title: string;
  anchor: string;
  level: number;
}

interface LLMMetadataInput {
  baseUrl: string;
  canonicalPath: string;
  title: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  type?: string;
}

export interface TocEntry {
  title?: unknown;
  url?: string;
  depth?: number;
  children?: TocEntry[];
}

export interface LLMMetadataHeader {
  canonical: string;
  title: string;
  description?: string;
  datePublished?: string;
  dateModified?: string;
  type: string;
}

function normalizeAnchor(url: string) {
  if (url.includes('#')) {
    return url.slice(url.indexOf('#'));
  }

  return `#${url}`;
}

export function normalizeTitle(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return `${value}`;
  }

  return '';
}

export function buildLLMMetadataHeader({
  baseUrl,
  canonicalPath,
  title,
  description,
  datePublished,
  dateModified,
  type = 'docs-page',
}: LLMMetadataInput) {
  const metadata: LLMMetadataHeader = {
    canonical: `${baseUrl}${canonicalPath}`,
    title,
    type,
  };

  if (description) {
    metadata.description = description;
  }

  if (datePublished) {
    metadata.datePublished = datePublished;
  }

  if (dateModified) {
    metadata.dateModified = dateModified;
  }

  return `<!-- LLM_METADATA ${JSON.stringify(metadata)} -->`;
}

export function extractSectionMap(toc: readonly TocEntry[] | undefined) {
  if (!toc || toc.length === 0) {
    return [];
  }

  const sections: LLMSection[] = [];

  const walk = (nodes: readonly TocEntry[] = [], level = 1) => {
    for (const node of nodes) {
      const title = normalizeTitle(node.title);
      const anchor = node.url ? normalizeAnchor(node.url) : '';

      if (title) {
        sections.push({
          title,
          anchor,
          level: node.depth ?? level,
        });
      }

      if (node.children && node.children.length > 0) {
        walk(node.children, level + 1);
      }
    }
  };

  walk(toc, 1);

  return sections;
}

export function buildLLMSectionMap(sections: LLMSection[]) {
  return `<!-- LLM_SECTIONS ${JSON.stringify(sections)} -->`;
}

export function buildLLMSectionLineMap(sections: LLMSection[]) {
  return sections
    .map((section) => `${section.level}|${section.anchor}|${section.title}`)
    .join('\n');
}
