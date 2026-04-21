import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { createAgentsManageDatabasePool } from '../db/manage/manage-client';
import * as manageSchema from '../db/manage/manage-schema';
import { confirmMigration } from '../db/utils';
import { loadEnvironmentFiles } from '../env';
import { doltListBranches } from './branch';
import { doltReset, doltStatus } from './commit';

const DEFAULT_AUTHOR = {
  name: 'migration-script',
  email: 'migration@inkeep.com',
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

export type RunSqlFileOnAllBranchesArgs = {
  apply: boolean;
  branchNames: string[];
  continueOnError: boolean;
  filePath?: string;
  help: boolean;
  includeMain: boolean;
};

export function buildDefaultCommitMessage(sqlFilePath: string): string {
  return `Apply backfill SQL from ${path.basename(sqlFilePath)}`;
}

export function resolveSqlFilePath(inputPath: string, cwd = process.cwd()): string {
  const candidates = path.isAbsolute(inputPath)
    ? [inputPath]
    : [
        path.resolve(cwd, inputPath),
        path.resolve(packageRoot, inputPath),
        path.resolve(repoRoot, inputPath),
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`SQL file not found: ${inputPath}`);
}

function readNextArg(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseRunSqlFileOnAllBranchesArgs(argv: string[]): RunSqlFileOnAllBranchesArgs {
  const parsed: RunSqlFileOnAllBranchesArgs = {
    apply: false,
    branchNames: [],
    continueOnError: false,
    help: false,
    includeMain: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--apply':
        parsed.apply = true;
        break;
      case '--branch':
        parsed.branchNames.push(readNextArg(argv, index, arg));
        index += 1;
        break;
      case '--continue-on-error':
        parsed.continueOnError = true;
        break;
      case '--file':
      case '-f':
        parsed.filePath = readNextArg(argv, index, arg);
        index += 1;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--skip-main':
        parsed.includeMain = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.help && !parsed.filePath) {
    throw new Error('Missing required argument: --file <path-to-sql>');
  }

  return parsed;
}

export function getRunSqlFileOnAllBranchesUsage(): string {
  return [
    'Run a SQL backfill file across Dolt branches.',
    '',
    'Usage:',
    '  tsx packages/agents-core/scripts/run-manage-backfill-on-all-branches.ts --file <path> [options]',
    '',
    'Options:',
    '  --apply                 Persist and commit changes. Default is dry-run.',
    '  --file, -f <path>       SQL file to execute.',
    '  --branch <name>         Limit execution to a branch. Repeatable.',
    '  --skip-main             Exclude main.',
    '  --continue-on-error     Continue processing remaining branches after failures.',
    '  --help, -h              Show this help text.',
  ].join('\n');
}

type RunSqlFileOnAllBranchesOptions = {
  apply: boolean;
  author: {
    email: string;
    name: string;
  };
  branchNames: string[];
  commitMessage: string;
  continueOnError: boolean;
  includeMain: boolean;
  sqlFilePath: string;
};

export async function runSqlFileOnAllBranches(
  options: RunSqlFileOnAllBranchesOptions
): Promise<void> {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  await confirmMigration(connectionString);

  const resolvedSqlFilePath = resolveSqlFilePath(options.sqlFilePath);
  const sqlFileContents = readFileSync(resolvedSqlFilePath, 'utf8').trim();

  if (!sqlFileContents) {
    throw new Error(`SQL file is empty: ${resolvedSqlFilePath}`);
  }

  const pool = createAgentsManageDatabasePool({
    connectionString,
    poolSize: 2,
  });

  try {
    const db = drizzle(pool, { schema: manageSchema }) as unknown as AgentsManageDatabaseClient;
    const allBranches = await doltListBranches(db)();
    const targetBranches = allBranches.filter((branch) => {
      if (!options.includeMain && branch.name === 'main') {
        return false;
      }

      if (options.branchNames.length > 0 && !options.branchNames.includes(branch.name)) {
        return false;
      }

      return true;
    });

    if (targetBranches.length === 0) {
      console.log('No matching branches found.');
      return;
    }

    console.log(
      `${options.apply ? 'Applying' : 'Dry-running'} ${path.basename(resolvedSqlFilePath)} on ${targetBranches.length} branch(es)\n`
    );

    let changedBranches = 0;
    let noopBranches = 0;
    let failedBranches = 0;

    for (const branch of targetBranches) {
      const connection = await pool.connect();
      const branchDb = drizzle(connection, {
        schema: manageSchema,
      }) as unknown as AgentsManageDatabaseClient;

      try {
        await connection.query('SELECT DOLT_CHECKOUT($1)', [branch.name]);
        await connection.query(sqlFileContents);

        const status = await doltStatus(branchDb)();
        if (status.length === 0) {
          noopBranches += 1;
          console.log(`Branch "${branch.name}": no changes`);
          continue;
        }

        if (options.apply) {
          await connection.query("SELECT DOLT_COMMIT('-a', '-m', $1, '--author', $2)", [
            options.commitMessage,
            `${options.author.name} <${options.author.email}>`,
          ]);
          console.log(`Branch "${branch.name}": applied and committed`);
        } else {
          await doltReset(branchDb)({ hard: true });
          console.log(`Branch "${branch.name}": would change (${status.length} tracked change(s))`);
        }

        changedBranches += 1;
      } catch (error) {
        failedBranches += 1;

        try {
          await doltReset(branchDb)({ hard: true });
        } catch {
          // ignore cleanup failures here; checkout cleanup below still runs
        }

        const message = error instanceof Error ? error.message : String(error);
        console.error(`Branch "${branch.name}": failed`);
        console.error(`  ${message}`);

        if (!options.continueOnError) {
          throw error;
        }
      } finally {
        try {
          await connection.query("SELECT DOLT_CHECKOUT('main')");
        } catch {
          // best-effort cleanup before releasing the connection
        }
        connection.release();
      }
    }

    console.log('');
    console.log(
      `Summary: ${changedBranches} changed, ${noopBranches} no-op, ${failedBranches} failed`
    );

    if (failedBranches > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsedArgs = parseRunSqlFileOnAllBranchesArgs(argv);

  if (parsedArgs.help) {
    console.log(getRunSqlFileOnAllBranchesUsage());
    return;
  }

  await runSqlFileOnAllBranches({
    apply: parsedArgs.apply,
    author: DEFAULT_AUTHOR,
    branchNames: parsedArgs.branchNames,
    commitMessage: buildDefaultCommitMessage(parsedArgs.filePath ?? 'backfill.sql'),
    continueOnError: parsedArgs.continueOnError,
    includeMain: parsedArgs.includeMain,
    sqlFilePath: parsedArgs.filePath ?? '',
  });
}
