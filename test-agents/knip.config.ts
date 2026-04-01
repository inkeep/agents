import type { KnipConfig } from 'knip';

export default {
  ignoreDependencies: [
    '@inkeep/agents-cli', // Used in `inkeep.config.ts`
  ],
} satisfies KnipConfig;
