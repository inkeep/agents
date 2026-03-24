import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

const BASE_URL = 'https://docs.inkeep.com';

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${BASE_URL}${page.url}`,
    changeFrequency: 'weekly',
  }));
}
