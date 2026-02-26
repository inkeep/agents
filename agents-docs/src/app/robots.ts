import type { MetadataRoute } from 'next';

const BASE_URL = 'https://docs.inkeep.com';
const machineRoutes = ['/llms.txt', '/llms-full.txt', '/llms.mdx/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/*.md$', '/*.mdx$'],
      },
      {
        userAgent: 'GPTBot',
        allow: machineRoutes,
        disallow: ['/api/'],
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: machineRoutes,
        disallow: ['/api/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: machineRoutes,
        disallow: ['/api/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
