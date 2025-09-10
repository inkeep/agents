import { defineConfig } from 'tsup';
import rootConfig from '../../tsup.config';

export default defineConfig({
  ...rootConfig,

  entry: [
    'src/index.ts',
    'src/db/schema.ts',
    'src/types/index.ts',
    'src/validation/index.ts',
    'src/client-exports.ts',
  ],
  async onSuccess() {},
});
