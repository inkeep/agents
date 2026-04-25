import fs from 'node:fs';
import path from 'node:path';
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

// In the outer monorepo (agents-private) we want `@inkeep/agents-ui` edits to
// appear in manage-ui dev without a build step. The package is installed
// normally (published version) via the nested `public/agents/` lockfile, so
// Vercel/public-mirror builds are unaffected. When the `private/agents-ui`
// source tree is present on disk AND we're in dev, we layer a bundler-level
// redirect on top pointing the package specifier at that source directory.
//
// Two gates:
// - `existsSync`: after Copybara mirrors next.config.ts to `inkeep/agents`,
//   the alias silently no-ops (private tree isn't there).
// - `NODE_ENV !== 'production'`: Vercel previews on agents-private DO have
//   `private/` checked out, but they run prod builds with React Compiler
//   `panicThreshold: 'all_errors'`. agents-ui source carries pre-existing
//   memoization warnings that would block the prod build, and prod builds
//   don't need source linking anyway — they pull the published package.
const agentsUiSourceDir = path.resolve(__dirname, '../../../private/agents-ui/packages/agents-ui');
const useAgentsUiSource =
  process.env.NODE_ENV !== 'production' &&
  fs.existsSync(path.join(agentsUiSourceDir, 'package.json'));
// Turbopack resolveAlias values must be relative (absolute OS paths get
// mis-interpreted as server-relative URLs). Compute paths relative to this
// config file's directory.
const rel = (p: string) => {
  const r = path.relative(__dirname, p);
  return r.startsWith('.') ? r : `./${r}`;
};
const agentsUiSourceAlias: Record<string, string> = useAgentsUiSource
  ? {
      '@inkeep/agents-ui': rel(path.join(agentsUiSourceDir, 'src/index.ts')),
      '@inkeep/agents-ui/types': rel(path.join(agentsUiSourceDir, 'src/types/index.ts')),
      '@inkeep/agents-ui/inkeep.css': rel(path.join(agentsUiSourceDir, 'src/styled/inkeep.css')),
    }
  : {};

const nextConfig: NextConfig = {
  // Transpile @inkeep/agents-ui. In the outer monorepo the turbopack
  // `resolveAlias` below redirects this package to `private/agents-ui` source
  // (TypeScript, no build step). On Vercel / public-mirror builds the alias
  // is a no-op and Next installs the published npm version, so this flag is
  // harmless there.
  transpilePackages: ['@inkeep/agents-ui'],
  experimental: {
    turbopackFileSystemCacheForBuild: true,
    serverComponentsHmrCache: true,
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
    // Production: fail on any compiler diagnostic (strict).
    // Dev: skip components that can't be compiled cleanly instead of failing —
    // when the turbopack alias redirects @inkeep/agents-ui to its private
    // source tree, pre-existing memoization issues in that package would
    // otherwise block manage-ui's dev server. Prod builds install the
    // compiled package from npm, so this relaxation never applies there.
    // Note: React Compiler's config does not expose a per-path `sources`
    // filter (Next.js 16's ReactCompilerOptions is {compilationMode,
    // panicThreshold} only), so path-based exclusion isn't possible today.
    panicThreshold: process.env.NODE_ENV === 'production' ? 'all_errors' : 'none',
  },
  turbopack: {
    resolveAlias: {
      ...agentsUiSourceAlias,
    },
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
      // agents-ui's Shadow component does `import styles from '../inkeep.css?raw'`
      // (a Vite convention). When we alias @inkeep/agents-ui to source, this
      // import goes through Turbopack — which does not natively understand the
      // `?raw` query suffix. Without this loader, `styles` ends up empty and
      // the Shadow DOM's <style> tag is blank, producing the unstyled chat.
      // Published builds bake the CSS string into the compiled JS so this rule
      // only matters in dev with the source alias active.
      '**/inkeep.css': {
        loaders: ['raw-loader'],
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
