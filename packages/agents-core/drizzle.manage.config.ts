import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

/**
 * Drizzle config for the Manage database (Doltgres - versioned)
 * Contains: projects, agents, tools, contextConfigs, etc.
 */
export default defineConfig({
  out: './drizzle/manage',
  schema: './src/db/manage/manage-schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.INKEEP_AGENTS_MANAGE_DATABASE_URL,
  },
});
