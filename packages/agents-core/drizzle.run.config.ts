import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

/**
 * Drizzle config for the Runtime database (Postgres - unversioned)
 * Contains: conversations, messages, tasks, apiKeys, Better Auth tables, etc.
 */
export default defineConfig({
  out: './drizzle/runtime',
  schema: './src/db/runtime/runtime-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.INKEEP_AGENTS_RUN_DATABASE_URL,
  },
});

