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
    name: pkgJson.name,
    globals: true,
    onUnhandledError(error) {
      // Extract message from Error instances or serialized browser errors.
      // Browser-originated errors may lose their prototype chain during
      // serialization, so we check .message directly without instanceof.
      const message =
        (error as { message?: string })?.message ?? (typeof error === 'string' ? error : '');
      // Suppress known Vitest worker RPC shutdown race condition.
      // Next.js triggers background dynamic imports that can outlive test execution;
      // when the worker shuts down, these pending imports cause an unhandled rejection.
      // See: https://github.com/vitest-dev/vitest/issues/9458
      if (message.includes('Closing rpc while')) {
        return false;
      }
      // Suppress Monaco editor web worker initialization errors in browser tests.
      // Monaco falls back to main-thread execution when workers fail to load,
      // which does not affect test correctness.
      if (message.includes('Cannot use import statement outside a module')) {
        return false;
      }
    },
    projects: [
      {
        extends: true,
        test: {
          name: `${pkgJson.name}/browser`,
          include: [BROWSER_TESTS_PATTERN],
          browser: {
            // Vitest defaults to a 414x896 viewport, which causes the test iframe to be scaled.
            // Set a larger viewport to avoid downscaling.
            // viewport: { width: 2560, height: 1440 },
            enabled: true,
            headless: true,
            provider: playwright({
              // With the larger viewport, we use DPR=2 so screenshots match CSS pixel sizes.
              // contextOptions: { viewport: { width: 2560, height: 1440 } },
              launchOptions: {
                // Applying the `antialiased` class to <body> and enabling this option
                // significantly reduces pixel mismatches (<1%) between macOS and Linux.
                args: ['--font-render-hinting=none'],
              },
            }),
            instances: [{ browser: 'chromium' }],
            expect: {
              toMatchScreenshot: {
                // Increase timeout because the default `5s` is insufficient on CI.
                // Monaco editor requires extra time to stabilize (dynamic imports,
                // syntax highlighting, height recalculation).
                timeout: 20_000,
                resolveScreenshotPath,
                resolveDiffPath: resolveScreenshotPath,
                comparatorOptions: {
                  // 2% of the pixels are allowed to mismatch between macOS and Linux
                  allowedMismatchedPixelRatio: 0.02,
                },
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
