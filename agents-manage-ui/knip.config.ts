import type { KnipConfig } from 'knip';

export default {
  tags: ['-lintignore'],
  ignoreDependencies: [
    '@svgr/webpack', // Set as turbopack loader in `next.config.ts`
    'postcss', // Bundled in Next.js
    'pino-pretty', // Set the transport target in `agents-manage-ui/src/lib/logger.ts`
    'jsdom', // We use `@testing-library/jest-dom`
  ],
  ignoreIssues: {
    'agents-manage-ui/src/components/ui/*': ['exports'],
    'agents-manage-ui/src/components/agent/configuration/model-options.tsx': ['exports'],
    'agents-manage-ui/cypress/env.d.ts': ['files'],
    'agents-manage-ui/cypress/cypress.config.ts': ['files'],
    'agents-manage-ui/src/components/form/generic-prompt-editor.tsx': ['files'],
    'agents-manage-ui/src/components/form/generic-json-editor.tsx': ['files'],
  },
} satisfies KnipConfig;
