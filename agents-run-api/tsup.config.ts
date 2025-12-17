import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';
import rootConfig from '../tsup.config';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/instrumentation.ts'],
  external: [
    'keytar',
    // Externalize eval-api to prevent bundling its workflow bootstrap code
    // run-api should use the built version, not bundle the source
    '@inkeep/agents-eval-api',
  ],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.xml': 'text',
    };
  },
  async onSuccess() {},
});
