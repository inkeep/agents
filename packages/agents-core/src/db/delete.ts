import { sql } from 'drizzle-orm';
import { env } from '../env';
import { createDatabaseClient } from './client';

/**
 * Drops all tables, sequences, types, and functions from the public schema
 * WARNING: This is destructive and cannot be undone!
 */
export async function deleteDatabase() {
  console.log(`🗑️  Deleting all database objects for environment: ${env.ENVIRONMENT}`);
  console.log('---');

  const dbClient = createDatabaseClient();

  try {
    // Drop the entire public schema and everything in it
    console.log('Dropping public schema and all objects...');
    await dbClient.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    console.log('✅ Public schema dropped');

    // Recreate the empty public schema
    console.log('Recreating public schema...');
    await dbClient.execute(sql`CREATE SCHEMA public`);
    console.log('✅ Public schema recreated');

    console.log('---');
    console.log('🎉 Database completely wiped - ready for fresh migrations');
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
