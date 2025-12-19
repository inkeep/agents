import { withSentryConfig } from '@sentry/nextjs';
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
  images: {
    // Allow all external image domains since users can provide any URL
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://npmjs.com/package/@sentry/webpack-plugin#options

  org: "inkeep",

  project: "pilot-inkeep-com",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
