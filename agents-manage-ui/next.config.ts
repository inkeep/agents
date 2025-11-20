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
    // Exclude native Node.js modules from bundling
    // keytar is a native module that cannot be bundled by webpack
    if (isServer) {
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals)
          ? originalExternals
          : originalExternals
            ? [originalExternals]
            : []),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          // Mark keytar as external - it will be required at runtime, not bundled
          if (request === 'keytar') {
            return callback(null, `commonjs ${request}`);
          }
          // Handle original externals if it was a function
          if (typeof originalExternals === 'function') {
            return originalExternals({ request }, callback);
          }
          callback();
        },
      ];
    }

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
