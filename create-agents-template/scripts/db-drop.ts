import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function deleteDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🗑️  Dropping and recreating public schema...');

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Drop the public schema and everything in it
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    console.log('✅ Public schema dropped');

    // Drop the drizzle schema if it exists
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    console.log('✅ Drizzle schema dropped');

    // Recreate the empty public schema
    await pool.query('CREATE SCHEMA public');
    console.log('✅ Public schema recreated');

    // Grant proper permissions on the public schema
    await pool.query('GRANT ALL ON SCHEMA public TO PUBLIC');
    await pool.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
    console.log('✅ Permissions granted on public schema');

    console.log('🎉 Database completely wiped - ready for fresh migrations');
  } catch (error) {
    console.error('❌ Failed to delete database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteDatabase();
