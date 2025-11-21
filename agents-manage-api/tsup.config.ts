import { defineConfig } from 'tsup';
import rootConfig from '../tsup.config';

export default defineConfig({
  ...rootConfig,
  format: ['esm'],
  external: ['keytar'],
  async onSuccess() {},
});
