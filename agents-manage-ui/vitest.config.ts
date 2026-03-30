import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import pixelmatch from 'pixelmatch';
import { defaultExclude, defineConfig } from 'vitest/config';
import type { ToMatchScreenshotOptions } from 'vitest/node';
import pkgJson from './package.json' with { type: 'json' };

declare module 'vitest/browser' {
  interface ScreenshotComparatorRegistry {
    tolerantPixelmatch: {
      threshold?: number;
      maxDimensionDiff?: number;
      allowedMismatchedPixelRatio?: number;
    };
  }
}

function cropRgba(
  data: ArrayLike<number>,
  srcWidth: number,
  targetWidth: number,
  targetHeight: number
): Uint8Array {
  const rowBytes = targetWidth * 4;
  if (srcWidth === targetWidth) {
    return new Uint8Array(
      (data as Uint8Array).buffer,
      (data as Uint8Array).byteOffset,
      rowBytes * targetHeight
    );
  }
  const out = new Uint8Array(rowBytes * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const srcOffset = y * srcWidth * 4;
    const dstOffset = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      out[dstOffset + i] = (data[srcOffset + i] as number) ?? 0;
    }
  }
  return out;
}

const BROWSER_TESTS_PATTERN = '**/*.browser.test.tsx';

const resolveScreenshotPath: ToMatchScreenshotOptions['resolveScreenshotPath'] = ({
  root,
  screenshotDirectory,
  arg,
  browserName,
  ext,
}) => {
  return [root, 'src', screenshotDirectory, `${arg}-${browserName}${ext}`].join('/');
};

export default defineConfig({
  test: {
    name: pkgJson.name,
    globals: true,
    onUnhandledError(error) {
      const message =
        (error as { message?: string })?.message ?? (typeof error === 'string' ? error : '');
      if (message.includes('Closing rpc while')) {
        return false;
      }
      if (message.includes('Cannot use import statement outside a module')) {
        return false;
      }
      if (
        message.includes('is not a valid name') ||
        (error as { name?: string })?.name === 'InvalidCharacterError'
      ) {
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
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                args: ['--font-render-hinting=none'],
              },
            }),
            instances: [{ browser: 'chromium' }],
            expect: {
              toMatchScreenshot: {
                timeout: 20_000,
                resolveScreenshotPath,
                resolveDiffPath: resolveScreenshotPath,
                comparatorName: 'tolerantPixelmatch',
                comparators: {
                  tolerantPixelmatch: (reference, actual, options) => {
                    const {
                      createDiff,
                      threshold = 0.1,
                      maxDimensionDiff = 4,
                      allowedMismatchedPixelRatio = 0.02,
                    } = options;

                    const rW = reference.metadata.width;
                    const rH = reference.metadata.height;
                    const aW = actual.metadata.width;
                    const aH = actual.metadata.height;

                    if (
                      Math.abs(rW - aW) > maxDimensionDiff ||
                      Math.abs(rH - aH) > maxDimensionDiff
                    ) {
                      return {
                        pass: false,
                        diff: null,
                        message: `Dimensions differ by more than ${maxDimensionDiff}px: ${rW}×${rH} vs ${aW}×${aH}`,
                      };
                    }

                    const w = Math.min(rW, aW);
                    const h = Math.min(rH, aH);

                    const refData =
                      rW === w && rH === h
                        ? (reference.data as Uint8Array)
                        : cropRgba(reference.data, rW, w, h);
                    const actData =
                      aW === w && aH === h
                        ? (actual.data as Uint8Array)
                        : cropRgba(actual.data, aW, w, h);

                    const diffBuf = createDiff ? new Uint8Array(w * h * 4) : undefined;
                    const mismatched = pixelmatch(refData, actData, diffBuf, w, h, { threshold });

                    const total = w * h;
                    const ratio = mismatched / total;

                    return {
                      pass: ratio <= allowedMismatchedPixelRatio,
                      diff: diffBuf ?? null,
                      message:
                        ratio > allowedMismatchedPixelRatio
                          ? `${mismatched} pixels (${(ratio * 100).toFixed(2)}%) mismatched, allowed: ${(allowedMismatchedPixelRatio * 100).toFixed(2)}%`
                          : null,
                    };
                  },
                },
                comparatorOptions: {
                  threshold: 0.1,
                  maxDimensionDiff: 4,
                  allowedMismatchedPixelRatio: 0.02,
                },
              },
            },
          },
        },
        define: {
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
