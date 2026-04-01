import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDefaultCommitMessage,
  parseRunSqlFileOnAllBranchesArgs,
  resolveSqlFilePath,
} from '../../dolt/run-sql-file-on-all-branches';

describe('runSqlFileOnAllBranches helpers', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('parses required file argument with dry-run defaults', () => {
    const result = parseRunSqlFileOnAllBranchesArgs(['--file', 'drizzle/manage/0015.sql']);

    expect(result).toEqual({
      apply: false,
      branchNames: [],
      continueOnError: false,
      filePath: 'drizzle/manage/0015.sql',
      help: false,
      includeMain: true,
    });
  });

  it('parses optional flags', () => {
    const result = parseRunSqlFileOnAllBranchesArgs([
      '--file',
      'drizzle/manage/0015.sql',
      '--apply',
      '--branch',
      'main',
      '--branch',
      'tenant_proj_feature',
      '--skip-main',
      '--continue-on-error',
    ]);

    expect(result).toEqual({
      apply: true,
      branchNames: ['main', 'tenant_proj_feature'],
      continueOnError: true,
      filePath: 'drizzle/manage/0015.sql',
      help: false,
      includeMain: false,
    });
  });

  it('builds a default commit message from the sql filename', () => {
    expect(buildDefaultCommitMessage('/tmp/0015_backfill_skill_files.sql')).toBe(
      'Apply backfill SQL from 0015_backfill_skill_files.sql'
    );
  });

  it('resolves sql paths from the current working directory', () => {
    const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'agents-backfill-'));
    const sqlFile = path.join(tempDirectory, 'backfill.sql');
    tempDirectories.push(tempDirectory);
    writeFileSync(sqlFile, 'select 1;');

    expect(resolveSqlFilePath('backfill.sql', tempDirectory)).toBe(sqlFile);
  });

  it('resolves repo-root relative paths when running from the package directory', () => {
    const packageDirectory = process.cwd();
    const repoDirectory = path.resolve(packageDirectory, '..', '..');
    const repoRelativePath =
      'packages/agents-core/drizzle/manage/20260330145022_backfill_skill_files/migration.sql';

    expect(resolveSqlFilePath(repoRelativePath, packageDirectory)).toBe(
      path.resolve(repoDirectory, repoRelativePath)
    );
  });

  it('throws when the sql file does not exist', () => {
    expect(() => resolveSqlFilePath('missing.sql', '/tmp')).toThrow(
      'SQL file not found: missing.sql'
    );
  });
});
