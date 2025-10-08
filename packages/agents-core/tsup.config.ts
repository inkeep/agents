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
    'src/utils/schema-conversion.ts',
  ],
  external: ['keytar'],
  async onSuccess() {},
});
