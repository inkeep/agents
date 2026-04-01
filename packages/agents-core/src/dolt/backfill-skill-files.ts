import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { stringify } from 'yaml';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { createAgentsManageDatabasePool } from '../db/manage/manage-client';
import { manageRelations } from '../db/manage/manage-relations';
import * as manageSchema from '../db/manage/manage-schema';
import { skillFiles, skills } from '../db/manage/manage-schema';
import { confirmMigration } from '../db/utils';
import { loadEnvironmentFiles } from '../env';
import { doltListBranches } from './branch';
import { doltReset } from './commit';

const DEFAULT_AUTHOR = {
  name: 'migration-script',
  email: 'migration@inkeep.com',
};

const DEFAULT_COMMIT_MESSAGE = 'Backfill legacy SKILL.md skill files';
const SKILL_ENTRY_FILE_PATH = 'SKILL.md';

type SkillBackfillSource = {
  tenantId: string;
  projectId: string;
  id: string;
  name: string;
  description: string;
  content: string;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
};

type ExistingSkillEntryFile = {
  tenantId: string;
  projectId: string;
  skillId: string;
};

export type BackfillSkillFilesArgs = {
  apply: boolean;
  branchNames: string[];
  continueOnError: boolean;
  help: boolean;
  includeMain: boolean;
};

function serializeSkillEntryFile(
  skill: Pick<SkillBackfillSource, 'name' | 'description' | 'metadata' | 'content'>
) {
  const yaml = stringify({
    name: skill.name,
    description: skill.description,
    metadata: skill.metadata ?? undefined,
  });

  return ['---', yaml.trimEnd(), '---', '', skill.content].join('\n');
}

export function buildLegacySkillFileId(
  skill: Pick<SkillBackfillSource, 'tenantId' | 'projectId' | 'id'>
) {
  const hash = createHash('md5')
    .update(`${skill.tenantId}:${skill.projectId}:${skill.id}:${SKILL_ENTRY_FILE_PATH}`)
    .digest('hex');

  return `legacy-${hash}`;
}

export function buildMissingSkillFileRows(
  sourceSkills: SkillBackfillSource[],
  existingSkillEntryFiles: ExistingSkillEntryFile[]
) {
  const existingKeys = new Set(
    existingSkillEntryFiles.map(
      (file) => `${file.tenantId}:${file.projectId}:${file.skillId}:${SKILL_ENTRY_FILE_PATH}`
    )
  );

  return sourceSkills
    .filter(
      (skill) =>
        !existingKeys.has(
          `${skill.tenantId}:${skill.projectId}:${skill.id}:${SKILL_ENTRY_FILE_PATH}`
        )
    )
    .map((skill) => ({
      tenantId: skill.tenantId,
      id: buildLegacySkillFileId(skill),
      projectId: skill.projectId,
      skillId: skill.id,
      filePath: SKILL_ENTRY_FILE_PATH,
      content: serializeSkillEntryFile(skill),
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    }));
}

function readNextArg(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseBackfillSkillFilesArgs(argv: string[]): BackfillSkillFilesArgs {
  const parsed: BackfillSkillFilesArgs = {
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

  return parsed;
}

export function getBackfillSkillFilesUsage(): string {
  return [
    'Backfill legacy SKILL.md files from skills rows across Dolt branches.',
    '',
    'Usage:',
    '  tsx packages/agents-core/scripts/backfill-skill-files.ts [options]',
    '',
    'Options:',
    '  --apply                 Persist and commit changes. Default is dry-run.',
    '  --branch <name>         Limit execution to a branch. Repeatable.',
    '  --skip-main             Exclude main.',
    '  --continue-on-error     Continue processing remaining branches after failures.',
    '  --help, -h              Show this help text.',
  ].join('\n');
}

async function tableExists(connection: PoolClient, tableName: string): Promise<boolean> {
  const result = await connection.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1
     LIMIT 1`,
    [tableName]
  );

  return result.rows.length > 0;
}

export async function backfillSkillFilesAcrossAllBranches(
  options: Omit<BackfillSkillFilesArgs, 'help'>
): Promise<void> {
  loadEnvironmentFiles();

  const connectionString = process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL;
  await confirmMigration(connectionString);

  const pool = createAgentsManageDatabasePool({
    connectionString,
    poolSize: 2,
  });

  try {
    const db = drizzle({
      client: pool,
      schema: manageSchema,
      relations: manageRelations,
    }) as unknown as AgentsManageDatabaseClient;
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
      `${options.apply ? 'Applying' : 'Dry-running'} SKILL.md backfill on ${targetBranches.length} branch(es)\n`
    );

    let changedBranches = 0;
    let noopBranches = 0;
    let skippedBranches = 0;
    let failedBranches = 0;
    let insertedRows = 0;

    for (const branch of targetBranches) {
      const connection = await pool.connect();
      const branchDb = drizzle({
        client: connection,
        schema: manageSchema,
        relations: manageRelations,
      }) as unknown as AgentsManageDatabaseClient;

      try {
        await connection.query('SELECT DOLT_CHECKOUT($1)', [branch.name]);

        const hasSkillsTable = await tableExists(connection, 'skills');
        const hasSkillFilesTable = await tableExists(connection, 'skill_files');

        if (!hasSkillsTable || !hasSkillFilesTable) {
          skippedBranches += 1;
          console.log(`Branch "${branch.name}": skipped (missing skills or skill_files table)`);
          continue;
        }

        const branchSkills = await branchDb
          .select({
            tenantId: skills.tenantId,
            projectId: skills.projectId,
            id: skills.id,
            name: skills.name,
            description: skills.description,
            content: skills.content,
            metadata: skills.metadata,
            createdAt: skills.createdAt,
            updatedAt: skills.updatedAt,
          })
          .from(skills);

        const existingEntryFiles = await branchDb
          .select({
            tenantId: skillFiles.tenantId,
            projectId: skillFiles.projectId,
            skillId: skillFiles.skillId,
          })
          .from(skillFiles)
          .where(eq(skillFiles.filePath, SKILL_ENTRY_FILE_PATH));

        const missingRows = buildMissingSkillFileRows(branchSkills, existingEntryFiles);

        if (missingRows.length === 0) {
          noopBranches += 1;
          console.log(`Branch "${branch.name}": no changes`);
          continue;
        }

        if (options.apply) {
          await branchDb.insert(skillFiles).values(missingRows).onConflictDoNothing();
          await connection.query("SELECT DOLT_COMMIT('-a', '-m', $1, '--author', $2)", [
            DEFAULT_COMMIT_MESSAGE,
            `${DEFAULT_AUTHOR.name} <${DEFAULT_AUTHOR.email}>`,
          ]);
          console.log(`Branch "${branch.name}": inserted ${missingRows.length} SKILL.md file(s)`);
        } else {
          console.log(
            `Branch "${branch.name}": would insert ${missingRows.length} SKILL.md file(s)`
          );
        }

        changedBranches += 1;
        insertedRows += missingRows.length;
      } catch (error) {
        failedBranches += 1;

        try {
          await doltReset(branchDb)({ hard: true });
        } catch {
          // best-effort cleanup after branch failure
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
      `Summary: ${changedBranches} changed, ${noopBranches} no-op, ${skippedBranches} skipped, ${failedBranches} failed, ${insertedRows} SKILL.md file(s) ${options.apply ? 'inserted' : 'would be inserted'}`
    );

    if (failedBranches > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsedArgs = parseBackfillSkillFilesArgs(argv);

  if (parsedArgs.help) {
    console.log(getBackfillSkillFilesUsage());
    return;
  }

  await backfillSkillFilesAcrossAllBranches({
    apply: parsedArgs.apply,
    branchNames: parsedArgs.branchNames,
    continueOnError: parsedArgs.continueOnError,
    includeMain: parsedArgs.includeMain,
  });
}
