import { parseFreshnessMetadata } from '@/lib/freshness';
import { getLLMText } from '@/lib/get-llm-text';
import {
  buildLLMMetadataHeader,
  buildLLMSectionLineMap,
  extractSectionMap,
} from '@/lib/llm-metadata';
import { source } from '@/lib/source';

const BASE_URL = 'https://docs.inkeep.com';

export const revalidate = false;

export async function GET() {
  const scan = source.getPages().map(async (page) => {
    const sections = extractSectionMap(page.data.toc);
    const freshness = parseFreshnessMetadata(page.data.datePublished, page.data.dateModified);
    const header = buildLLMMetadataHeader({
      baseUrl: BASE_URL,
      canonicalPath: page.url,
      title: page.data.title,
      description: page.data.description,
      datePublished: freshness.datePublished?.value,
      dateModified: freshness.dateModified?.value,
    });
    const sectionMap = sections.length > 0 ? buildLLMSectionLineMap(sections) : '';
    const sectionBlock = sectionMap.length > 0 ? `\nSections:\n${sectionMap}` : '';
    return `<!-- LLM_PAGE_START ${page.url} -->\n${header}${sectionBlock}\n${await getLLMText(page)}\n<!-- LLM_PAGE_END -->`;
  });
  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
