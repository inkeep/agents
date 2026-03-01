import type { MetadataRoute } from 'next';
import { BASE_URL } from '@/lib/constants';
import { parseFreshnessMetadata } from '@/lib/freshness';
import { source } from '@/lib/source';

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => {
    const segments = page.url.split('/').filter(Boolean);
    const depth = segments.length;
    const isOverviewPage = page.url === '/overview';
    const freshness = parseFreshnessMetadata(page.data.datePublished, page.data.dateModified);
    const lastModified = freshness.lastModified ? new Date(freshness.lastModified) : undefined;

    return {
      url: `${BASE_URL}${page.url}`,
      lastModified,
      changeFrequency: isOverviewPage || depth <= 1 ? 'daily' : depth <= 2 ? 'weekly' : 'monthly',
      priority: isOverviewPage ? 1 : depth <= 1 ? 0.8 : depth <= 2 ? 0.6 : 0.5,
    };
  });
}
