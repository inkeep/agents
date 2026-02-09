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
  env: {
    NEXT_PUBLIC_CI: process.env.CI,
  },
  output: 'standalone',
  reactCompiler: {
    compilationMode: 'annotation',
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
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

const config = isSentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      reactComponentAnnotation: {
        enabled: true,
      },
    })
  : nextConfig;

export default config;
