import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: packageJson.name,
    setupFiles: './src/__tests__/setup.ts',
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    exclude: [
      'node_modules',
      'dist',
      'src/__tests__/manage/integration/**/*.test.ts',
      'src/domains/run/services/__tests__/ArtifactService.test.ts',
    ],
    fileParallelism: true,
    isolate: true,
    poolOptions: {
      threads: {
        maxThreads: 8,
        minThreads: 2,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      ANTHROPIC_API_KEY: 'test-api-key',
      OPENAI_API_KEY: 'test-openai-key',
      LOG_LEVEL: 'error',
      AGENTS_COMPRESSION_ENABLED: 'false',
      INKEEP_AGENTS_RUN_API_BYPASS_SECRET: 'test-bypass-secret',
    },
  },
});
