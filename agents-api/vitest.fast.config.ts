import { defineProject } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineProject({
  test: {
    name: `${packageJson.name}:fast`,
    setupFiles: './src/__tests__/setup.ts',
    globals: true,
    environment: 'node',
    testTimeout: 5000, // 5 seconds for fast tests
    hookTimeout: 5000,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'node_modules',
      'dist',
      '**/*.slow.test.ts',
      '**/*.integration.test.ts',
      'src/__tests__/manage/integration/**/*.test.ts',
      'src/domains/run/services/__tests__/ArtifactService.test.ts',
    ],
    fileParallelism: true,
    isolate: true,
    poolOptions: {
      threads: {
        maxThreads: 10,
        minThreads: 4,
      },
    },
    env: {
      ENVIRONMENT: 'test',
      ANTHROPIC_API_KEY: 'test-api-key',
      OPENAI_API_KEY: 'test-openai-key',
      LOG_LEVEL: 'error',
      AGENTS_COMPRESSION_ENABLED: 'false',
    },
  },
});
