import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreIssues: {
    'source.config.ts': ['exports'],
  },
} satisfies KnipConfig;
