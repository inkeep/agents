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
  output: 'standalone',
  eslint: {
    // Disable ESLint during builds on Vercel to avoid deployment failures
    ignoreDuringBuilds: true,
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
