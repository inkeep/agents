import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';


export const configDbConfig = defineConfig({
  out: './drizzle/config',
  schema: './src/db/config-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.AGENTS_MANAGE_DATABASE_URL,
  },
});

export const runtimeDbConfig = defineConfig({
  out: './drizzle/runtime',
  schema: './src/db/runtime-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.AGENTS_RUN_DATABASE_URL,
  },
});
