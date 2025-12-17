import { defineConfig } from 'tsup';
import rootConfig from '../tsup.config';

export default defineConfig({
  ...rootConfig,
  entry: ['src/index.ts', 'src/instrumentation.ts'],
  external: ['keytar'],
  // Don't externalize workflow packages - they need to be bundled
  // because they use dynamic imports that Vercel NFT can't trace
  noExternal: ['workflow', '@workflow/world-postgres', '@workflow/world-vercel', /^@workflow\/.*/],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.xml': 'text',
    };
  },
  async onSuccess() {},
});
