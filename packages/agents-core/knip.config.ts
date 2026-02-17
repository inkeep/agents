import type { KnipConfig } from 'knip';

export default {
  ignoreDependencies: [
    // Dynamically imported at runtime from the host application's node_modules
    // (agents-api). Not a direct dependency of agents-core by design.
    '@vercel/functions',
  ],
} satisfies KnipConfig;
