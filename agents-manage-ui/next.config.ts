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
  webpack(config, { isServer }) {
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

    // Exclude native modules from webpack bundling
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        keytar: false,
      };
    }

    // Mark keytar as external to prevent bundling
    config.externals = config.externals || [];
    if (Array.isArray(config.externals)) {
      config.externals.push('keytar');
    }

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
