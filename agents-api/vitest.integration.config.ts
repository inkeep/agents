import fs from 'node:fs/promises';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [
    {
      name: 'xml-as-string',
      enforce: 'pre',
      async load(id) {
        if (id.endsWith('.xml') || id.endsWith('.md')) {
          const code = await fs.readFile(id, 'utf8');
          return `export default ${JSON.stringify(code)};`;
        }
      },
    },
  ],
  test: {
    name: 'agents-api-integration',
    globals: true,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for database operations
    hookTimeout: 60000, // 60 seconds for setup/teardown hooks
    include: ['src/__tests__/manage/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Disable parallelism for integration tests to avoid conflicts with shared Doltgres instance
    fileParallelism: false,
    isolate: true,
    poolOptions: {
      threads: {
        maxThreads: 1, // Run integration tests serially
        minThreads: 1,
      },
    },
    env: {
      // DO NOT set ENVIRONMENT: 'test' here - we need to use actual INKEEP_AGENTS_MANAGE_DATABASE_URL and INKEEP_AGENTS_RUN_DATABASE_URL for Doltgres and Postgres
      LOG_LEVEL: 'error',
      TENANT_ID: 'test-tenant',
      // Required by env.ts validation even though integration tests don't use these APIs
      ANTHROPIC_API_KEY: 'test-api-key',
      OPENAI_API_KEY: 'test-openai-key',
      // Bypass secret for authentication in integration tests
      INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET: 'integration-test-bypass-secret',
    },
  },
});
