import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';
import staticRedirects from './redirects.json' with { type: 'json' };
import { fetchCloudRedirects } from './fetch-cloud-redirects';

const withMDX = createMDX();

const isProd = process.env.NODE_ENV === 'production';

const config: NextConfig = {
  reactStrictMode: true,
  // Increase timeout for static page generation in CI environments
  staticPageGenerationTimeout: 180, // 3 minutes instead of default 60 seconds
  async redirects() {
    const cloudRedirects = await fetchCloudRedirects();

    return [
      ...staticRedirects,
      ...cloudRedirects,
      {
        source: '/cloud',
        destination: '/cloud/overview/ai-for-customers',
      },
    ].map((item) => ({ ...item, permanent: isProd }));
  },
  rewrites() {
    return [
      {
        source: '/cloud/:path*',
        destination: 'https://rag-docs.inkeep.com/cloud/:path*',
      },
      {
        source: '/:path*.mdx',
        destination: '/llms.mdx/:path*',
      },
      {
        source: '/:path*.md',
        destination: '/llms.mdx/:path*',
      },
    ];
  },
  // Fix build warning
  // Package ts-morph can't be external
  // The request ts-morph matches serverExternalPackages (or the default list).
  transpilePackages: ['prettier', 'ts-morph'],
};

export default withMDX(config);
