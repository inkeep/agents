import { fileURLToPath } from 'node:url';
import { defineConfig, defaultExclude } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import pkgJson from './package.json' with { type: 'json' };

const NODE_TESTS_PATTERN = '**/*.node.test.ts'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/node`,
          setupFiles: './setup-files',
          include: [NODE_TESTS_PATTERN],
        }
      },
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/browser`,
          exclude: [...defaultExclude, NODE_TESTS_PATTERN],
          browser: {
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
            enabled: true,
            headless: true,
            expect: {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
              },
            },
          },
        }
      },
    ],
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
});
