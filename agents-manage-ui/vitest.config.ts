import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defaultExclude, defineConfig } from 'vitest/config';
import pkgJson from './package.json' with { type: 'json' };

const NODE_TESTS_PATTERN = '**/*.node.test.ts';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/node`,
          setupFiles: './setup-files',
          include: [NODE_TESTS_PATTERN],
        },
      },
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/browser`,
          exclude: [NODE_TESTS_PATTERN, ...defaultExclude],
          browser: {
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
            enabled: true,
            headless: true,
            expect: {
              toMatchScreenshot: {
                // Increase timeout because the default `5s` is insufficient on CI
                timeout: 10_000,
                resolveScreenshotPath: ({ root, screenshotDirectory, arg, browserName, ext }) =>
                  [
                    root,
                    'src',
                    screenshotDirectory,
                    // Omit the platform suffix before extension
                    // `linux` on CI and `darwin` for example in macOS
                    `${arg}-${browserName}${ext}`,
                  ].join('/'),
              },
            },
          },
        },
        define: {
          // Fix error from next/image - ReferenceError: process is not defined
          'process.env.NODE_ENV': '"test"',
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
});
