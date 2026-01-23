import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@inkeep/agents-core'],
  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  compress: true, // Enable gzip compression
  // Ensure API routes use Node.js runtime
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
