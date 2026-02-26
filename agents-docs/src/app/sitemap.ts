import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

const BASE_URL = 'https://docs.inkeep.com';
const buildDate = new Date();

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => {
    const segments = page.url.split('/').filter(Boolean);
    const depth = segments.length;
    const isOverviewPage = page.url === '/overview';
    const parsedModified = page.data.dateModified ? new Date(page.data.dateModified) : null;
    const lastModified =
      parsedModified && !Number.isNaN(parsedModified.valueOf()) ? parsedModified : buildDate;

    return {
      url: `${BASE_URL}${page.url}`,
      lastModified,
      changeFrequency: isOverviewPage || depth <= 1 ? 'daily' : depth <= 2 ? 'weekly' : 'monthly',
      priority: isOverviewPage ? 1 : depth <= 1 ? 0.8 : depth <= 2 ? 0.6 : 0.5,
    };
  });
}
