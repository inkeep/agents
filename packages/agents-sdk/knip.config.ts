import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    // Optional runtime check via require.resolve() in telemetry-provider.ts.
    // Declared as optional peerDependency in package.json but knip's
    // --dependencies mode still flags referenced optional peers.
    '@opentelemetry/api',
  ],
} satisfies KnipConfig;
