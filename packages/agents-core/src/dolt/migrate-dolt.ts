import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { createAgentsManageDatabaseClient } from '../db/manage/manage-client';
import { confirmMigration } from '../db/utils';
import { loadEnvironmentFiles } from '../env';
import { doltAddAndCommit, doltStatus } from './commit';

const commitMigrations = async () => {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  await confirmMigration(connectionString);

  try {
    execSync('drizzle-kit migrate --config=drizzle.manage.config.ts', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Error running migrations:', error);
    process.exit(1);
  }

  const db = createAgentsManageDatabaseClient({
    connectionString,
  });

  const status = await doltStatus(db)();
  const statusCount = status.length;

  const migrationsApplied = statusCount > 0;

  if (migrationsApplied) {
    await doltAddAndCommit(db)({ message: 'Applied database migrations' });
  } else {
    console.log('ℹ️  No changes to commit - database is up to date\n');
  }

  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    appendFileSync(ghOutput, `migrations_applied=${migrationsApplied}\n`);
  }
};

commitMigrations();
