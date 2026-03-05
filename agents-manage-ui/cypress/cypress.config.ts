import fs from 'node:fs/promises';
import { defineConfig } from 'cypress';

try {
  process.loadEnvFile('../../.env');
} catch {
  // In CI, setup-dev generates .env and exports values to $GITHUB_ENV
}

export default defineConfig({
  experimentalFastVisibility: true,
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 0,
  defaultBrowser: 'chrome',
  waitForAnimations: false,
  retries: {
    runMode: 2,
    openMode: 0,
  },
  env: {
    TEST_USER_EMAIL: process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME,
    TEST_USER_PASSWORD: process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD,
  },
  e2e: {
    video: true,
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1_440,
    viewportHeight: 900,
    defaultCommandTimeout: 15_000,
    setupNodeEvents(on, _config) {
      on('task', {
        log(message: string) {
          console.log(message);
          return null;
        },
      });

      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'chromium' && browser.isHeadless) {
          launchOptions.args.push(
            '--no-sandbox',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-extensions',
            '--disable-translate',
            '--mute-audio'
          );
        }
        return launchOptions;
      });

      /**
       * Only keep failed videos
       * @see https://docs.cypress.io/app/guides/screenshots-and-videos#Delete-videos-for-specs-without-failing-or-retried-tests
       */
      on('after:spec', async (_spec, results) => {
        if (!results?.video) {
          return;
        }
        const failures = results.tests?.some((test) =>
          test.attempts?.some((attempt) => attempt.state === 'failed')
        );
        if (failures) {
          return;
        }
        await fs.rm(results.video, { force: true });
      });
    },
  },
});
