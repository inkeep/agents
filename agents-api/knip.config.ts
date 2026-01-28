import type { KnipConfig } from 'knip';

export default {
  // Disable the tsdown plugin because Knip treats its `entry` as a usage signal,
  // causing all files in the `src` directory to be marked as used.
  tsdown: false,
} satisfies KnipConfig;
