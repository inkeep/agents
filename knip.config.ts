import type { KnipConfig } from 'knip';

export default {
  ignoreIssues: {
    'agents-manage-ui/cypress/env.d.ts': ['files'],
    'agents-manage-ui/cypress/cypress.config.ts': ['files'],
    'agents-cookbook/**': ['files'],
    'create-agents-template/**': ['files'],
    'agents-docs/_snippets/**': ['files'],
    'agents-docs/skills-collections/_templates/**': ['files'],
    'agents-docs/content/**': ['files'],
    'packages/agents-manage-mcp/src/**': ['files'],
    'packages/agents-mcp/src/**': ['files'],
    'agents-cli/vitest.setup.ts': ['files'],
    // Inkeep configs
    'agents-cli/inkeep.config.ts': ['files'],
    'test-agents/inkeep.config.ts': ['files'],
    // Knip configs
    'agents-manage-ui/knip.config.ts': ['files'],
    'agents-docs/knip.config.ts': ['files'],
    'packages/agents-sdk/knip.config.ts': ['files'],
    // Specified scripts/README-MCP-GENERATOR.md
    'scripts/generate-mcp-package.mjs': ['files'],
    // Specified in package.json
    'agents-api/vitest.integration.config.ts': ['files'],
    'packages/agents-core/vitest.integration.config.ts': ['files'],
    'packages/agents-core/drizzle.run.config.ts': ['files'],
    'packages/agents-core/drizzle.manage.config.ts': ['files'],
    // Specified in packages/agents-manage-mcp/scripts/generate.mjs
    'packages/agents-manage-mcp/scripts/fetch-openapi.mjs': ['files'],
  },
} satisfies KnipConfig;
