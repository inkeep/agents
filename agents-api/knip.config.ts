import type { KnipConfig } from 'knip';

export default {
  ignoreIssues: {
    'agents-api/tsdown.config.ts': ['files'],
    // these are being disabled for now
    'agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts': ['files'],
    'agents-api/src/domains/manage/routes/evals/datasetRuns.ts': ['files'],
  },
  // Disable the tsdown plugin because Knip treats its `entry` as a usage signal,
  // causing all files in the `src` directory to be marked as used.
  tsdown: false,
} satisfies KnipConfig;
