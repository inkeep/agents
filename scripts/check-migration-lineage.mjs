#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIGRATION_TARGETS = [
  {
    label: 'manage',
    dir: 'packages/agents-core/drizzle/manage',
    journal: 'packages/agents-core/drizzle/manage/meta/_journal.json',
  },
  {
    label: 'runtime',
    dir: 'packages/agents-core/drizzle/runtime',
    journal: 'packages/agents-core/drizzle/runtime/meta/_journal.json',
  },
];

const MIGRATION_RELATED_PATHS = [
  'packages/agents-core/drizzle/manage/',
  'packages/agents-core/drizzle/runtime/',
];

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let baseRef;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--base-ref') {
      baseRef = args[i + 1];
      i++;
      continue;
    }

    if (arg.startsWith('--base-ref=')) {
      baseRef = arg.slice('--base-ref='.length);
    }
  }

  return { baseRef };
}

function resolveBaseRef(cliBaseRef) {
  const candidates = [
    cliBaseRef,
    process.env.MIGRATION_LINEAGE_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    'origin/main',
    'origin/master',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      runGit(['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function getChangedFiles(baseRef) {
  try {
    if (baseRef) {
      return runGit(['diff', '--name-only', `${baseRef}...HEAD`])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    }

    const tracked = runGit(['diff', '--name-only', 'HEAD']);
    const staged = runGit(['diff', '--name-only', '--cached', 'HEAD']);
    const untracked = runGit(['ls-files', '--others', '--exclude-standard']);
    return [...tracked.split('\n'), ...staged.split('\n'), ...untracked.split('\n')]
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error('❌ Failed to determine changed files for migration lineage check.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function isMigrationRelated(file) {
  return MIGRATION_RELATED_PATHS.some((prefix) => file === prefix || file.startsWith(prefix));
}

function collectSqlTags(dir) {
  const sqlFiles = fs
    .readdirSync(path.join(ROOT_DIR, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  return sqlFiles.map((file) => {
    const match = file.match(/^(\d{4})_(.+)\.sql$/);
    if (!match) {
      return {
        file,
        prefix: null,
        tag: null,
      };
    }

    return {
      file,
      prefix: Number.parseInt(match[1], 10),
      tag: `${match[1]}_${match[2]}`,
    };
  });
}

function collectJournalEntries(journalPath) {
  const fullPath = path.join(ROOT_DIR, journalPath);
  const journal = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return Array.isArray(journal.entries) ? journal.entries : [];
}

function collectJournalEntriesAtRef(baseRef, journalPath) {
  const content = runGit(['show', `${baseRef}:${journalPath}`]);
  const journal = JSON.parse(content);
  return Array.isArray(journal.entries) ? journal.entries : [];
}

function collectSqlTagsAtRef(baseRef, dir) {
  let output;
  try {
    output = runGit(['ls-tree', '-r', '--name-only', baseRef, dir]);
  } catch {
    return [];
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.sql'))
    .map((filePath) => path.basename(filePath))
    .sort()
    .map((file) => {
      const match = file.match(/^(\d{4})_(.+)\.sql$/);
      if (!match) {
        return {
          file,
          prefix: null,
          tag: null,
        };
      }

      return {
        file,
        prefix: Number.parseInt(match[1], 10),
        tag: `${match[1]}_${match[2]}`,
      };
    });
}

function validateTarget(target) {
  const errors = [];
  const sqlTags = collectSqlTags(target.dir);
  const journalEntries = collectJournalEntries(target.journal);

  for (const sqlTag of sqlTags) {
    if (sqlTag.prefix === null || sqlTag.tag === null) {
      errors.push(`${target.label}: invalid migration filename '${sqlTag.file}'`);
    }
  }

  const journalTags = [];
  for (let index = 0; index < journalEntries.length; index++) {
    const entry = journalEntries[index];
    if (entry.idx !== index) {
      errors.push(
        `${target.label}: journal idx mismatch at position ${index} (found ${String(entry.idx)})`
      );
    }

    if (typeof entry.tag !== 'string') {
      errors.push(`${target.label}: journal entry ${index} is missing a valid tag`);
      continue;
    }

    const tagMatch = entry.tag.match(/^(\d{4})_.+$/);
    if (!tagMatch) {
      errors.push(`${target.label}: invalid journal tag '${entry.tag}'`);
      continue;
    }

    const tagPrefix = Number.parseInt(tagMatch[1], 10);
    if (tagPrefix !== index) {
      errors.push(
        `${target.label}: journal tag '${entry.tag}' does not match expected position ${String(index).padStart(4, '0')}`
      );
    }

    journalTags.push(entry.tag);
  }

  const journalTagSet = new Set(journalTags);
  if (journalTagSet.size !== journalTags.length) {
    errors.push(`${target.label}: journal contains duplicate tags`);
  }

  return { errors, sqlTags, journalEntries };
}

function validateTargetAgainstBase(target, baseRef) {
  const errors = [];
  const current = validateTarget(target);
  errors.push(...current.errors);

  let baseSqlTags = [];
  let baseJournalEntries = [];
  try {
    baseSqlTags = collectSqlTagsAtRef(baseRef, target.dir);
    baseJournalEntries = collectJournalEntriesAtRef(baseRef, target.journal);
  } catch (error) {
    errors.push(
      `${target.label}: failed to read base migration state from ${baseRef} (${error instanceof Error ? error.message : String(error)})`
    );
    return errors;
  }

  const currentSqlTagSet = new Set(
    current.sqlTags.filter((entry) => entry.tag !== null).map((entry) => entry.tag)
  );
  const baseSqlTagSet = new Set(
    baseSqlTags.filter((entry) => entry.tag !== null).map((entry) => entry.tag)
  );

  const newSqlTags = current.sqlTags
    .filter((entry) => entry.tag !== null && !baseSqlTagSet.has(entry.tag))
    .map((entry) => entry.tag);
  const newSqlTagSet = new Set(newSqlTags);

  const baseJournalTags = baseJournalEntries.map((entry) => entry.tag);
  const currentJournalTags = current.journalEntries.map((entry) => entry.tag);

  if (current.journalEntries.length < baseJournalEntries.length) {
    errors.push(
      `${target.label}: journal is shorter than ${baseRef}; migrations must append, not rewrite history`
    );
    return errors;
  }

  for (let index = 0; index < baseJournalTags.length; index++) {
    if (currentJournalTags[index] !== baseJournalTags[index]) {
      errors.push(
        `${target.label}: journal diverges from ${baseRef} at index ${index}; rebase and regenerate the migration`
      );
      return errors;
    }
  }

  const appendedJournalTags = currentJournalTags.slice(baseJournalTags.length);

  if (appendedJournalTags.length === 0 && newSqlTags.length === 0) {
    return errors;
  }

  if (appendedJournalTags.length === 0 && newSqlTags.length > 0) {
    errors.push(
      `${target.label}: new migration SQL files were added without corresponding journal entries`
    );
    return errors;
  }

  const lastBaseEntry = baseJournalEntries.at(-1);
  const expectedFirstNewIndex = lastBaseEntry ? lastBaseEntry.idx + 1 : 0;
  const firstAppendedEntry = current.journalEntries[baseJournalEntries.length];
  if (firstAppendedEntry && firstAppendedEntry.idx !== expectedFirstNewIndex) {
    errors.push(
      `${target.label}: first new journal entry should follow ${baseRef} immediately at index ${expectedFirstNewIndex}`
    );
  }

  const lastBaseSql = baseSqlTags.at(-1);
  const expectedFirstNewPrefix = lastBaseSql?.prefix !== null && lastBaseSql?.prefix !== undefined
    ? lastBaseSql.prefix + 1
    : 0;
  const firstNewTag = appendedJournalTags[0];
  if (firstNewTag) {
    const match = firstNewTag.match(/^(\d{4})_/);
    const firstNewPrefix = match ? Number.parseInt(match[1], 10) : null;
    if (firstNewPrefix !== expectedFirstNewPrefix) {
      errors.push(
        `${target.label}: first new migration should be ${String(expectedFirstNewPrefix).padStart(4, '0')} after ${baseRef}, found ${firstNewTag}`
      );
    }
  }

  for (const tag of appendedJournalTags) {
    if (!currentSqlTagSet.has(tag)) {
      errors.push(`${target.label}: new journal tag '${tag}' is missing its SQL file`);
    }
  }

  for (const tag of newSqlTagSet) {
    if (!appendedJournalTags.includes(tag)) {
      errors.push(
        `${target.label}: new migration file '${tag}.sql' is not part of the new journal tail; rebase and regenerate the migration`
      );
    }
  }

  for (const tag of newSqlTagSet) {
    const match = tag.match(/^(\d{4})_/);
    if (!match) continue;
    const prefix = Number.parseInt(match[1], 10);
    const collidesWithBase = baseSqlTags.some((entry) => entry.prefix === prefix);
    if (collidesWithBase) {
      errors.push(
        `${target.label}: new migration '${tag}' collides with an existing ${baseRef} migration number ${match[1]}; rebase and regenerate the migration`
      );
    }
  }

  return errors;
}

function main() {
  const { baseRef: cliBaseRef } = parseArgs();
  const baseRef = resolveBaseRef(cliBaseRef);
  const changedFiles = getChangedFiles(baseRef);
  const relevantFiles = changedFiles.filter(isMigrationRelated);

  if (relevantFiles.length === 0) {
    const scope = baseRef ? ` compared to ${baseRef}` : '';
    console.log(`Skipping migration lineage check: no migration-related changes detected${scope}.`);
    process.exit(0);
  }

  if (!baseRef) {
    console.error('❌ Migration lineage check requires a base ref when migrations change.');
    process.exit(1);
  }

  console.log('Checking migration lineage...');
  console.log(`Relevant changes: ${relevantFiles.join(', ')}`);

  const changedTargets = MIGRATION_TARGETS.filter((target) =>
    relevantFiles.some((file) => file.startsWith(`${target.dir}/`))
  );
  const errors = changedTargets.flatMap((target) => validateTargetAgainstBase(target, baseRef));

  if (errors.length === 0) {
    console.log('✅ Migration lineage is valid.');
    process.exit(0);
  }

  console.error('❌ Migration lineage check failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

main();
