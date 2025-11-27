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
  serverExternalPackages: [
    // Fixes
    // ./node_modules/.pnpm/thread-stream@3.1.0/node_modules/thread-stream/bench.js:3:15
    // Module not found: Can't resolve 'fastbench'
    'pino',
  ],
  images: {
    // Allow all external image domains since users can provide any URL
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
