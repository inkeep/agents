#!/usr/bin/env node

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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

function fail(message, error) {
  console.error(`❌ ${message}`);
  if (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function runGitRaw(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  let baseRef = 'origin/main';

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

function getChangedFiles(baseRef) {
  try {
    return runGit(['diff', '--name-only', `${baseRef}...HEAD`])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    fail('Failed to determine changed files for migration lineage check.', error);
  }
}

function isMigrationRelated(file) {
  return MIGRATION_RELATED_PATHS.some((prefix) => file === prefix || file.startsWith(prefix));
}

function toSqlTag(file) {
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
}

function collectSqlTags(dir) {
  return fs
    .readdirSync(path.join(ROOT_DIR, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
    .map(toSqlTag);
}

function readSqlFile(dir, fileName) {
  return fs.readFileSync(path.join(ROOT_DIR, dir, fileName), 'utf8');
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
    .map(toSqlTag);
}

function readSqlFileAtRef(baseRef, dir, fileName) {
  return runGitRaw(['show', `${baseRef}:${path.posix.join(dir, fileName)}`]);
}

function entriesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateTarget(target) {
  const errors = [];
  const sqlTags = collectSqlTags(target.dir);
  const journalEntries = collectJournalEntries(target.journal);
  const validSqlTags = sqlTags.filter((sqlTag) => sqlTag.tag !== null);
  const sqlPrefixMap = new Map();
  const sqlTagSet = new Set(validSqlTags.map((sqlTag) => sqlTag.tag));

  for (const sqlTag of sqlTags) {
    if (sqlTag.prefix === null || sqlTag.tag === null) {
      errors.push(`${target.label}: invalid migration filename '${sqlTag.file}'`);
      continue;
    }

    const existing = sqlPrefixMap.get(sqlTag.prefix) ?? [];
    existing.push(sqlTag.file);
    sqlPrefixMap.set(sqlTag.prefix, existing);
  }

  for (const [prefix, files] of sqlPrefixMap) {
    if (files.length > 1) {
      const quotedFiles = files.map((file) => `'${file}'`).join(', ');
      errors.push(
        `${target.label}: duplicate migration number ${String(prefix).padStart(4, '0')} used by ${quotedFiles}`
      );
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

    if (!sqlTagSet.has(entry.tag)) {
      errors.push(`${target.label}: journal tag '${entry.tag}' is missing its SQL file`);
    }
  }

  const journalTagSet = new Set(journalTags);
  if (journalTagSet.size !== journalTags.length) {
    errors.push(`${target.label}: journal contains duplicate tags`);
  }

  for (const sqlTag of validSqlTags) {
    if (!journalTagSet.has(sqlTag.tag)) {
      errors.push(`${target.label}: migration file '${sqlTag.file}' is not referenced by the journal`);
    }
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

  const baseJournalTags = baseJournalEntries.map((entry) => entry.tag);
  const baseJournalTagSet = new Set(baseJournalTags);
  const baseJournalSqlTags = baseSqlTags.filter(
    (entry) => entry.tag !== null && baseJournalTagSet.has(entry.tag)
  );
  const currentSqlTagSet = new Set(
    current.sqlTags.filter((entry) => entry.tag !== null).map((entry) => entry.tag)
  );
  const currentSqlTagMap = new Map(
    current.sqlTags.filter((entry) => entry.tag !== null).map((entry) => [entry.tag, entry])
  );
  const baseJournalSqlTagSet = new Set(baseJournalSqlTags.map((entry) => entry.tag));

  const newSqlTags = current.sqlTags
    .filter((entry) => entry.tag !== null && !baseJournalSqlTagSet.has(entry.tag))
    .map((entry) => entry.tag);
  const newSqlTagSet = new Set(newSqlTags);

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

    if (!entriesEqual(current.journalEntries[index], baseJournalEntries[index])) {
      errors.push(
        `${target.label}: journal entry '${baseJournalTags[index]}' was modified from ${baseRef}; rebase and regenerate the migration`
      );
      return errors;
    }
  }

  for (const baseSqlTag of baseJournalSqlTags) {
    const currentSqlTag = currentSqlTagMap.get(baseSqlTag.tag);
    if (!currentSqlTag) {
      errors.push(
        `${target.label}: existing migration '${baseSqlTag.tag}.sql' from ${baseRef} is missing; migrations must append, not rewrite history`
      );
      continue;
    }

    try {
      const currentSql = readSqlFile(target.dir, currentSqlTag.file);
      const baseSql = readSqlFileAtRef(baseRef, target.dir, baseSqlTag.file);
      if (currentSql !== baseSql) {
        errors.push(
          `${target.label}: existing migration '${baseSqlTag.tag}.sql' was modified from ${baseRef}; rebase and regenerate the migration`
        );
      }
    } catch (error) {
      errors.push(
        `${target.label}: failed to compare existing migration '${baseSqlTag.tag}.sql' against ${baseRef} (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }

  if (errors.length > 0) {
    return errors;
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

  const lastBaseSql = baseJournalSqlTags.at(-1);
  const expectedFirstNewPrefix =
    lastBaseSql?.prefix !== null && lastBaseSql?.prefix !== undefined ? lastBaseSql.prefix + 1 : 0;
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
    const collidesWithBase = baseJournalSqlTags.some((entry) => entry.prefix === prefix);
    if (collidesWithBase) {
      errors.push(
        `${target.label}: new migration '${tag}' collides with an existing ${baseRef} migration number ${match[1]}; rebase and regenerate the migration`
      );
    }
  }

  return errors;
}

function main() {
  const { baseRef } = parseArgs();
  try {
    runGit(['rev-parse', '--verify', baseRef]);
  } catch (error) {
    fail(`Migration lineage base ref '${baseRef}' does not exist.`, error);
  }

  const changedFiles = getChangedFiles(baseRef);
  const relevantFiles = changedFiles.filter(isMigrationRelated);

  if (relevantFiles.length === 0) {
    console.log(
      `Skipping migration lineage check: no migration-related changes detected compared to ${baseRef}.`
    );
    process.exit(0);
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
