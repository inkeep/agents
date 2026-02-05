import fs from 'node:fs/promises';
import { defineConfig } from 'cypress';

process.loadEnvFile('../../.env');

export default defineConfig({
  // Fix: We detected that the Chrome Renderer process just crashed.
  experimentalFastVisibility: true,
  numTestsKeptInMemory: 40,
  // Default is Electron, we choose Chrome instead
  defaultBrowser: 'chrome',
  env: {
    TEST_USER_EMAIL: process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME,
    TEST_USER_PASSWORD: process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD,
  },
  e2e: {
    video: true,
    baseUrl: 'http://localhost:3000',
    // Increase default viewport, we choose use MacBook 15 viewport size
    viewportWidth: 1_440,
    viewportHeight: 900,
    setupNodeEvents(on, _config) {
      /**
       * Only keep failed videos
       * @see https://docs.cypress.io/app/guides/screenshots-and-videos#Delete-videos-for-specs-without-failing-or-retried-tests
       */
      on('after:spec', async (_spec, results) => {
        if (!results.video) {
          return;
        }
        // Do we have failures for any retry attempts?
        const failures = results.tests.some((test) =>
          test.attempts.some((attempt) => attempt.state === 'failed')
        );
        if (failures) {
          return;
        }
        // delete the video if the spec passed and no tests retried
        await fs.unlink(results.video);
        await fs.unlink(results.video.replace('.mp4', '-compressed.mp4'));
      });
    },
  },
});
