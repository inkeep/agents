import { createAgentsManageDatabaseClient } from '../db/manage/manage-client';
import { confirmMigration } from '../db/utils';
import { loadEnvironmentFiles } from '../env';
import { doltCheckout, doltListBranches } from './branch';
import { syncSchemaFromMain } from './schema-sync';

const ansi = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

const format = {
  header: (text: string) => `${ansi.bold}${ansi.cyan}${text}${ansi.reset}`,
  ok: (text: string) => `${ansi.green}${text}${ansi.reset}`,
  warn: (text: string) => `${ansi.yellow}${text}${ansi.reset}`,
  err: (text: string) => `${ansi.red}${text}${ansi.reset}`,
  dim: (text: string) => `${ansi.dim}${text}${ansi.reset}`,
  bold: (text: string) => `${ansi.bold}${text}${ansi.reset}`,
};

const ms = (start: number, end: number) => `${Math.max(0, end - start)}ms`;

export const main = async () => {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  await confirmMigration(connectionString);

  const startedAt = Date.now();
  const db = createAgentsManageDatabaseClient({});
  const branches = await doltListBranches(db)();
  const targetBranches = branches.filter((b) => b.name !== 'main');
  const nameWidth = Math.max(12, ...targetBranches.map((b) => b.name.length));

  console.log(format.header(`Sync schema from main → ${targetBranches.length} branches`));
  console.log(format.dim(`Started: ${new Date().toISOString()}`));
  console.log('');

  let syncedCount = 0;
  let upToDateCount = 0;
  let errorCount = 0;

  for (const branch of branches) {
    if (branch.name === 'main') {
      continue;
    }
    const branchStartedAt = Date.now();
    const paddedName = branch.name.padEnd(nameWidth, ' ');
    console.log(`${format.bold('─'.repeat(Math.min(80, nameWidth + 34)))}`);
    console.log(`${format.bold('Branch')}  ${format.header(paddedName)}`);

    try {
      process.stdout.write(`${format.dim('Action ')}  checkout… `);
      await doltCheckout(db)({ branch: branch.name });
      console.log(format.ok('[OK]'));

      process.stdout.write(`${format.dim('Action ')}  sync schema… `);
      const result = await syncSchemaFromMain(db)();

      if (result.synced) {
        syncedCount += 1;
        console.log(format.ok('[SYNCED]'));
        console.log(
          `${format.dim('Result ')}  ${format.ok('Schema updated')} ${format.dim(`(${ms(branchStartedAt, Date.now())})`)}`
        );
      } else if (result.error) {
        errorCount += 1;
        console.log(format.err('[FAILED]'));
        console.log(
          `${format.dim('Result ')}  ${format.err('Error')} ${format.dim(`(${ms(branchStartedAt, Date.now())})`)}`
        );
        console.log(`${format.dim('Details')}  ${result.error}`);
      } else {
        upToDateCount += 1;
        console.log(format.warn('[NOOP]'));
        console.log(
          `${format.dim('Result ')}  ${format.warn('Already up to date')} ${format.dim(`(${ms(branchStartedAt, Date.now())})`)}`
        );
      }
    } catch (error) {
      errorCount += 1;
      console.log(format.err('[FAILED]'));
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `${format.dim('Result ')}  ${format.err('Error')} ${format.dim(`(${ms(branchStartedAt, Date.now())})`)}`
      );
      console.log(`${format.dim('Details')}  ${message}`);
    }
    console.log('');
  }

  console.log(format.bold('─'.repeat(80)));
  console.log(
    `${format.bold('Summary')}  ` +
      `${format.ok(`${syncedCount} synced`)}, ` +
      `${format.warn(`${upToDateCount} up to date`)}, ` +
      `${errorCount > 0 ? format.err(`${errorCount} failed`) : format.ok('0 failed')}`
  );
  console.log(format.dim(`Total: ${ms(startedAt, Date.now())}`));
};

main();
