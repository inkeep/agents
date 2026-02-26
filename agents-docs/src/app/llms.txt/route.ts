import { BASE_URL } from '@/lib/constants';
import { parseFreshnessMetadata } from '@/lib/freshness';
import { buildLLMMetadataHeader, extractSectionMap } from '@/lib/llm-metadata';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map((page) => {
    const sectionCount = extractSectionMap(page.data.toc).length;
    const freshness = parseFreshnessMetadata(page.data.datePublished, page.data.dateModified);
    const metadata = buildLLMMetadataHeader({
      baseUrl: BASE_URL,
      canonicalPath: page.url,
      title: page.data.title,
      description: page.data.description,
      datePublished: freshness.datePublished?.value,
      dateModified: freshness.dateModified?.value,
    });
    const freshnessLabel = freshness.lastModified ?? 'missing';
    return `- ${metadata.replace('<!-- ', '').replace(' -->', '')}\n  - [${page.data.title}](${BASE_URL}${page.url})\n  - fresh=${freshnessLabel}\n  - sections=${sectionCount}`;
  });
  const scanned = scan;
  const heading = `# Inkeep \n\n## Docs`;
  return new Response(`${heading}\n\n${scanned.join('\n\n')}`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
