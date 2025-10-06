import { defineConfig } from 'cypress';

export default defineConfig({
  defaultBrowser: 'chrome',
  e2e: {
    baseUrl: 'http://localhost:3000',
    // MacBook 15 viewport
    viewportWidth: 1440,
    viewportHeight: 900,
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
  },
});
