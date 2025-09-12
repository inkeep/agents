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
  if (envUrl.startsWith('http') || path.isAbsolute(envUrl.replace('file:', ''))) {
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
    return `file:${path.resolve(projectRoot, dbPath)}`;
  }
};

const dbUrl = getDatabaseUrl();

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbUrl,
  },
});
