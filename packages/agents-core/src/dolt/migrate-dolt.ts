import { execSync } from 'node:child_process';
import { createAgentsManageDatabaseClient } from '../db/manage/manage-client';
import { loadEnvironmentFiles } from '../env';
import { doltAddAndCommit, doltStatus } from './commit';

const isLocalhostUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
};

const commitMigrations = async () => {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  const hasProductionFlag = process.argv.includes('--production');

  if (!isLocalhostUrl(connectionString) && !hasProductionFlag) {
    console.error(
      '❌ Error: Database URL is not pointing to localhost.\n' +
        '   To run migrations on a non-localhost database, use the --production flag:\n' +
        '   pnpm db:migrate --production\n'
    );
    process.exit(1);
  }

  if (hasProductionFlag) {
    console.log('⚠️  Running migrations on production database...\n');
  }

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

  if (statusCount > 0) {
    await doltAddAndCommit(db)({ message: 'Applied database migrations' });
  } else {
    console.log('ℹ️  No changes to commit - database is up to date\n');
  }
};

commitMigrations();
