import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env';

/**
 * Deletes the database file from the filesystem
 * This removes the entire database file, not just the data
 */
export async function deleteDatabase() {
  console.log(`🗑️  Deleting database for environment: ${env.ENVIRONMENT}`);
  console.log(`📁 Database path: ${env.DB_FILE_NAME}`);
  console.log('---');

  try {
    // Extract the actual file path from the DB_FILE_NAME
    // Remove 'file:' prefix if present
    const initialDbPath = env.DB_FILE_NAME ?? 'local.db';
    const dbFilePath = initialDbPath.startsWith('file:')
      ? initialDbPath.replace('file:', '')
      : initialDbPath;

    // Normalize relative paths to always point to project root
    // This ensures consistent behavior regardless of where the command is run from
    let resolvedPath: string;
    if (path.isAbsolute(dbFilePath)) {
      resolvedPath = dbFilePath;
    } else {
      // Calculate project root from this file's location: agents-core/src/db -> project root
      const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
      const projectRoot = path.resolve(currentFileDir, '../../../../');

      // If the path is just "local.db" (from .env), put it in project root
      // Otherwise, resolve it relative to project root
      if (dbFilePath === 'local.db' || dbFilePath === './local.db') {
        resolvedPath = path.join(projectRoot, 'local.db');
      } else {
        resolvedPath = path.resolve(projectRoot, dbFilePath);
      }
    }

    console.log(`📍 Resolved path: ${resolvedPath}`);

    // Check if the database file exists
    if (!fs.existsSync(resolvedPath)) {
      console.log('⚠️  Database file does not exist, nothing to delete');
      return;
    }

    // Delete the database file
    fs.unlinkSync(resolvedPath);
    console.log('✅ Database file deleted successfully');

    console.log('---');
    console.log('🎉 Database deletion completed');
  } catch (error) {
    console.error('❌ Failed to delete database:', error);
    throw error;
  }
}

// Run the delete function if executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  deleteDatabase()
    .then(() => {
      console.log('Database deletion completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database deletion failed:', error);
      process.exit(1);
    });
}
