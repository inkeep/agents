import { defineConfig } from 'tsup';
import rootConfig from '../../tsup.config';

export default defineConfig({
  ...rootConfig,
  format: ['esm'],

  entry: [
    'src/index.ts',
    'src/db/schema.ts',
    'src/types/index.ts',
    'src/validation/index.ts',
    'src/client-exports.ts',
    'src/constants/models.ts',
    'src/constants/schema-validation/index.ts',
    'src/utils/schema-conversion.ts',
    'src/auth/auth.ts',
    'src/auth/auth-schema.ts',
    'src/auth/auth-validation-schemas.ts',
    'src/auth/permissions.ts',
    'src/credential-stores/index.ts',
    'src/db/test-client.ts',
  ],
  external: ['keytar', 'zod', '@hono/zod-openapi', 'drizzle-zod'],
  async onSuccess() {},
});
