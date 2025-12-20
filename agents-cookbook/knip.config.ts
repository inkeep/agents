import type { KnipConfig } from 'knip';

export default {
  workspaces: {
    'agents-cookbook': {
      entry: ['template-projects/**/*'],
    },
  },
} satisfies KnipConfig;
