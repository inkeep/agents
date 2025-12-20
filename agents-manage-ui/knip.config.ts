import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    '@svgr/webpack', // Set as turbopack loader in `next.config.ts`
    'postcss', // Bundled in Next.js
    'pino-pretty', // Set the transport target in `agents-manage-ui/src/lib/logger.ts`
  ],
  ignoreIssues: {
    'agents-manage-ui/src/components/ui/*': ['exports'],
    'agents-manage-ui/src/components/agent/configuration/model-options.tsx': ['exports'],
  },
} satisfies KnipConfig;
