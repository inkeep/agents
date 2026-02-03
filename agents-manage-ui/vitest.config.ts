import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defaultExclude, defineConfig } from 'vitest/config';
import type { ToMatchScreenshotOptions } from 'vitest/node';
import pkgJson from './package.json' with { type: 'json' };

const BROWSER_TESTS_PATTERN = '**/*.browser.test.tsx';

const resolveScreenshotPath: ToMatchScreenshotOptions['resolveScreenshotPath'] = ({
  root,
  screenshotDirectory,
  arg,
  browserName,
  ext,
}) => {
  return [
    root,
    'src',
    screenshotDirectory,
    // Omit the platform suffix before extension
    // `linux` on CI and `darwin` for example in macOS
    `${arg}-${browserName}${ext}`,
  ].join('/');
};

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/browser`,
          include: [BROWSER_TESTS_PATTERN],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            expect: {
              toMatchScreenshot: {
                // Increase timeout because the default `5s` is insufficient on CI
                timeout: 15_000,
                resolveScreenshotPath,
                resolveDiffPath: resolveScreenshotPath,
              },
            },
          },
        },
        define: {
          // Fix error from next/image - ReferenceError: process is not defined
          'process.env.NODE_ENV': '"test"',
        },
      },
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/node`,
          setupFiles: './setup-files',
          exclude: [BROWSER_TESTS_PATTERN, ...defaultExclude],
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
