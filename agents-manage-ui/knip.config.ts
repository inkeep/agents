import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: ['@svgr/webpack'],
  ignoreIssues: {
    'src/components/ui/*': ['exports'],
    'src/components/agent/configuration/model-options.tsx': ['exports'],
  },
} satisfies KnipConfig;
