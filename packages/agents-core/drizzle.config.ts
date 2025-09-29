import { defineConfig } from 'drizzle-kit';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Normalize database path to ensure consistency regardless of where commands are run from
const getDatabaseUrl = () => {
  const envUrl = process.env.DATABASE_URL || process.env.DB_FILE_NAME;
  
  if (!envUrl) {
    // Default fallback - put database in project root
    const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(currentFileDir, '../..'); // drizzle.config.ts is in agents-core root
    return `file:${path.join(projectRoot, 'local.db')}`;
  }
  
  // If URL is already provided, use as-is
  if (envUrl.startsWith('http') || envUrl.startsWith('libsql') || path.isAbsolute(envUrl.replace('file:', ''))) {
    return envUrl;
  }
  
  // Normalize relative paths to project root
  let dbPath = envUrl;
  if (dbPath.startsWith('file:')) {
    dbPath = dbPath.replace('file:', '');
  }
  
  // Calculate project root from this file's location
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentFileDir, '../..'); // drizzle.config.ts is in agents-core root
  
  // If the path is just "local.db" (from .env), put it in project root
  if (dbPath === 'local.db' || dbPath === './local.db') {
    return `file:${path.join(projectRoot, 'local.db')}`;
  } else {
    // Ensure path is relative to project root without backward navigation
    const normalizedPath = dbPath.replace(/\.\./g, '').replace(/^\//, '');
    return `file:${path.join(projectRoot, normalizedPath)}`;
  }
};


const getDbConfig = () => {
  // Prefer Turso if both URL + token are set
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  // Otherwise, fallback to file (must be explicitly set)
  return {
    url: getDatabaseUrl(),
  };
};

const dbConfig = getDbConfig()

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: dbConfig,
});
