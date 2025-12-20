import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: ['@svgr/webpack'],
  ignoreIssues: {
    'agents-manage-ui/src/components/ui/*': ['exports'],
    'agents-manage-ui/src/components/agent/configuration/model-options.tsx': ['exports'],
  },
} satisfies KnipConfig;
