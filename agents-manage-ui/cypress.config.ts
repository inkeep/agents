import { defineConfig } from 'cypress';

export default defineConfig({
  // Default is Electron, we choose Chrome instead
  defaultBrowser: 'chrome',
  e2e: {
    video: process.env.CI === 'true',
    baseUrl: 'http://localhost:3000',
    // Increase default viewport, we choose use MacBook 15 viewport size
    viewportWidth: 1_440,
    viewportHeight: 900,
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
    defaultCommandTimeout: 8_000,
  },
});
