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

const isSentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/baggage-span-processor',
    '@opentelemetry/context-async-hooks',
    '@opentelemetry/core',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-node',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/semantic-conventions',
  ],
  env: {
    NEXT_PUBLIC_CI: process.env.CI,
  },
  output: 'standalone',
  reactCompiler: {
    compilationMode: 'annotation',
    // Fail the build on any compiler diagnostic
    panicThreshold: 'all_errors',
  },
  redirects() {
    return [
      {
        source: '/:tenantId/projects/:projectId',
        destination: '/:tenantId/projects/:projectId/agents',
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      './**/icons/*.svg': {
        loaders: [
          {
            loader: '@svgr/webpack',
            options: {
              svgoConfig: {
                plugins: ['removeXMLNS'],
              },
            },
          },
        ],
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

const config = isSentryEnabled
  ? withSentryConfig(
      nextConfig,
      // For all available options, see:
      // https://npmjs.com/package/@sentry/webpack-plugin#options
      {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Only print logs for uploading source maps in CI
        silent: !process.env.CI,

        // For all available options, see:
        // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

        // Upload a larger set of source maps for prettier stack traces (increases build time)
        widenClientFileUpload: true,
        // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
        // This can increase your server load as well as your hosting bill.
        // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of
        // client-side errors will fail.
        tunnelRoute: '/monitoring',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
        reactComponentAnnotation: {
          enabled: true,
        },
      }
    )
  : nextConfig;

export default config;
