import type { KnipConfig } from 'knip';

export default {
  ignoreIssues: {
    'agents-manage-ui/cypress/env.d.ts': ['files'],
    'agents-manage-ui/cypress/cypress.config.ts': ['files'],
    'agents-cookbook/**': ['files'],
    'create-agents-template/**': ['files'],
    'agents-docs/_snippets/**': ['files'],
    'agents-docs/skills-collections/_templates/**': ['files'],
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
    'agents-api/knip.config.ts': ['files'],
    // tsdown configs
    'agents-api/tsdown.config.ts': ['files'],
    'packages/ai-sdk-provider/tsdown.config.ts': ['files'],
    'packages/agents-sdk/tsdown.config.ts': ['files'],
    'packages/agents-manage-mcp/tsdown.config.ts': ['files'],
    'packages/agents-core/tsdown.config.ts': ['files'],
    'agents-cli/tsdown.config.ts': ['files'],
    'tsdown.config.ts': ['files'],
    // Specified scripts/README-MCP-GENERATOR.md
    'scripts/generate-mcp-package.mjs': ['files'],
    // Specified in package.json
    'agents-api/vitest.integration.config.ts': ['files'],
    'packages/agents-core/vitest.integration.config.ts': ['files'],
    'packages/agents-core/drizzle.run.config.ts': ['files'],
    'packages/agents-core/drizzle.manage.config.ts': ['files'],
    // Specified in packages/agents-manage-mcp/scripts/generate.mjs
    'packages/agents-manage-mcp/scripts/fetch-openapi.mjs': ['files'],
    // these are being disabled for now
    'agents-api/src/domains/manage/routes/evals/datasetRunConfigs.ts': ['files'],
    'agents-api/src/domains/manage/routes/evals/datasetRuns.ts': ['files'],
    // used in agents-api/src/domains/evals/workflow/routes.ts
    'agents-api/src/domains/evals/api/.well-known/workflow/v1/flow.ts': ['files'],
    'agents-api/src/domains/evals/api/.well-known/workflow/v1/step.ts': ['files'],
  },
  // Disable the tsdown plugin because Knip treats its `entry` as a usage signal,
  // causing all files in the `src` directory to be marked as used.
  tsdown: false,
} satisfies KnipConfig;
