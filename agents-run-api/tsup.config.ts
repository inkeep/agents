import { defineConfig } from 'tsup';
import { createRequire } from 'node:module';
import rootConfig from '../tsup.config';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/instrumentation.ts'],
  external: ['keytar'],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.xml': 'text',
    };
  },
  async onSuccess() {},
});
