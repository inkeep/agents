import { sql } from 'drizzle-orm';
import { env } from '../env';
import { createAgentsManageDatabaseClient } from './manage/manage-client';
import { createAgentsRunDatabaseClient } from './runtime/runtime-client';

/**
 * Drops all tables, sequences, types, and functions from the public schema
 * WARNING: This is destructive and cannot be undone!
 */
export async function deleteDatabase( type: 'manage' | 'run' ) {
  console.log(`🗑️  Deleting all database objects for environment: ${env.ENVIRONMENT}`);
  console.log('---');

  const dbClient = type === 'manage' ? createAgentsManageDatabaseClient({}) : createAgentsRunDatabaseClient({});

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