import fs from 'node:fs';
import path from 'node:path';
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
    let dbFilePath = env.DB_FILE_NAME;
    if (dbFilePath.startsWith('file:')) {
      dbFilePath = dbFilePath.replace('file:', '');
    }

    // Resolve the path relative to the current working directory
    const resolvedPath = path.resolve(process.cwd(), dbFilePath);

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
