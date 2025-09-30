import fs from 'node:fs';
import path from 'node:path';

import { createMDX } from 'fumadocs-mdx/next';
import { fetchCloudRedirects } from './src/lib/redirects';

const withMDX = createMDX();

const isProd = process.env.NODE_ENV === 'production';
const redirectsPath = path.join(process.cwd(), 'redirects.json');

// Read static redirects
const staticRedirects = JSON.parse(fs.readFileSync(redirectsPath, 'utf8'));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Enable Turbopack for faster builds
  turbopack: {},
  // Increase timeout for static page generation in CI environments
  staticPageGenerationTimeout: 180, // 3 minutes instead of default 60 seconds
  async redirects() {
    const cloudRedirects = await fetchCloudRedirects();

    return [
      ...staticRedirects.map((item) => ({ ...item, permanent: isProd })),
      ...cloudRedirects.map((item) => ({ ...item, permanent: isProd })),
      {
        source: '/cloud',
        destination: '/cloud/overview/ai-for-customers',
        permanent: true,
      },
    ];
  },
  async rewrites() {
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
};

export default withMDX(config);
