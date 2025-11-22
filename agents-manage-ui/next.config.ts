import type { NextConfig } from 'next';

// Load environment files from project root during development
// This allows the Next.js app to read .env files from the workspace root in development
if (process.env.NODE_ENV !== 'production') {
  try {
    const { loadEnvironmentFiles } = require('@inkeep/agents-core');
    loadEnvironmentFiles();
    console.log('✅ Loaded environment files from project root');
  } catch (error) {
    console.warn('Could not load environment files:', error);
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CI: process.env.CI,
    // Expose environment variables to Server Components
    // This allows PUBLIC_* naming conventions to work
    PUBLIC_INKEEP_AGENTS_MANAGE_API_URL: process.env.PUBLIC_INKEEP_AGENTS_MANAGE_API_URL,
    PUBLIC_INKEEP_AGENTS_RUN_API_URL: process.env.PUBLIC_INKEEP_AGENTS_RUN_API_URL,
    PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET: process.env.PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET,
    PUBLIC_SIGNOZ_URL: process.env.PUBLIC_SIGNOZ_URL,
    PUBLIC_NANGO_SERVER_URL: process.env.PUBLIC_NANGO_SERVER_URL,
    PUBLIC_NANGO_CONNECT_BASE_URL: process.env.PUBLIC_NANGO_CONNECT_BASE_URL,
    PUBLIC_AUTH0_DOMAIN: process.env.PUBLIC_AUTH0_DOMAIN,
    PUBLIC_GOOGLE_CLIENT_ID: process.env.PUBLIC_GOOGLE_CLIENT_ID,
  },
  output: 'standalone',
  turbopack: {
    rules: {
      './**/icons/*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  webpack(config) {
    const { test: _test, ...imageLoaderOptions } = config.module.rules.find(
      // @ts-expect-error -- fixme
      (rule) => rule.test?.test?.('.svg')
    );
    config.module.rules.push({
      test: /\.svg$/,
      oneOf: [
        {
          // to avoid conflicts with default Next.js svg loader we only match images with resourceQuery ?svgr
          resourceQuery: /svgr/,
          use: ['@svgr/webpack'],
        },
        imageLoaderOptions,
      ],
    });
    return config;
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXTJS_IGNORE_TYPECHECK === 'true',
  },
  images: {
    // Allow all external image domains since users can provide any URL
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
