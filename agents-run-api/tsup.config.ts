import { defineConfig } from 'tsup';
import rootConfig from '../tsup.config';

export default defineConfig({
  ...rootConfig,
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.xml': 'text',
    };
  },
  async onSuccess() {},
});
