import fs from 'node:fs';
import path from 'node:path';

import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const isProd = process.env.NODE_ENV === 'production';
const redirectsPath = path.join(process.cwd(), 'redirects.json');
const redirects = JSON.parse(fs.readFileSync(redirectsPath, 'utf8'));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Enable Turbopack for faster builds
  turbopack: {},
  // Increase timeout for static page generation in CI environments
  staticPageGenerationTimeout: 180, // 3 minutes instead of default 60 seconds
  async redirects() {
    return redirects.map((item) => ({ ...item, permanent: isProd }));
  },
  async rewrites() {
    return [
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
