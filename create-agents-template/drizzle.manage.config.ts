import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle config for the Manage database (DoltgreSQL - versioned)
 * Contains: projects, agents, tools, contextConfigs, etc.
 */
export default defineConfig({
  schema: 'node_modules/@inkeep/agents-core/dist/db/manage/manage-schema.js',
  out: 'node_modules/@inkeep/agents-core/drizzle/manage',
  dbCredentials: {
    url: process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL ?? '',
  },
  dialect: 'postgresql',
});

