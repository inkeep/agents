import { notFound } from 'next/navigation';
import { type NextRequest, NextResponse } from 'next/server';
import { BASE_URL } from '@/lib/constants';
import { parseFreshnessMetadata } from '@/lib/freshness';
import { getLLMText } from '@/lib/get-llm-text';
import { buildLLMMetadataHeader, buildLLMSectionMap, extractSectionMap } from '@/lib/llm-metadata';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET(_req: NextRequest, { params }: RouteContext<'/llms.mdx/[[...slug]]'>) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const pageText = await getLLMText(page);
  const freshness = parseFreshnessMetadata(page.data.datePublished, page.data.dateModified);
  const sections = extractSectionMap(page.data.toc);
  const metadataHeader = buildLLMMetadataHeader({
    baseUrl: BASE_URL,
    canonicalPath: page.url,
    title: page.data.title,
    description: page.data.description,
    datePublished: freshness.datePublished?.value,
    dateModified: freshness.dateModified?.value,
  });
  const sectionHeader = sections.length > 0 ? `\n${buildLLMSectionMap(sections)}` : '';
  const payload = `${metadataHeader}\n${sectionHeader}\n\n${pageText}`;

  const headers: Record<string, string> = {
    'Content-Type': 'text/markdown; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    Link: `<${BASE_URL}${page.url}>; rel="canonical"`,
    'X-LLM-Canonical': `${BASE_URL}${page.url}`,
  };

  if (freshness.datePublished?.value) {
    headers['X-LLM-Date-Published'] = freshness.datePublished.value;
  }

  if (freshness.dateModified?.value) {
    headers['X-LLM-Last-Modified'] = freshness.dateModified.value;
  }

  return new NextResponse(payload, {
    headers: {
      ...headers,
    },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
