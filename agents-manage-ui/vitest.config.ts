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
                // Increase timeout because the default `5s` is insufficient on CI
                timeout: 15_000,
                resolveScreenshotPath,
                resolveDiffPath: resolveScreenshotPath,
                comparatorOptions: {
                  // 1% of the pixels are allowed to mismatch between macOS and Linux
                  allowedMismatchedPixelRatio: 0.01,
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
