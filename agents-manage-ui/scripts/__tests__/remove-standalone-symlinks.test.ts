import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const manageUiDir = path.join(import.meta.dirname, '..', '..');
const manageUi = JSON.parse(fs.readFileSync(path.join(manageUiDir, 'package.json'), 'utf8')) as {
  files: string[];
  scripts: Record<string, string>;
};

function runPrepack(packageDir: string) {
  const prepack = manageUi.scripts.prepack;
  if (!prepack) throw new Error('agents-manage-ui declares no prepack script');
  fs.cpSync(path.join(manageUiDir, 'scripts'), path.join(packageDir, 'scripts'), {
    recursive: true,
    filter: (source) => path.basename(source) !== '__tests__',
  });
  return execSync(prepack, {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeFile(packageDir: string, relativePath: string, content = '') {
  const filePath = path.join(packageDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function link(packageDir: string, relativePath: string, target: string) {
  const linkPath = path.join(packageDir, relativePath);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath);
}

function isSymlink(packageDir: string, relativePath: string) {
  return fs.lstatSync(path.join(packageDir, relativePath)).isSymbolicLink();
}

function symlinksUnder(packageDir: string, relativePath: string): string[] {
  const stats = fs.lstatSync(path.join(packageDir, relativePath), { throwIfNoEntry: false });
  if (stats?.isSymbolicLink()) return [relativePath];
  if (!stats?.isDirectory()) return [];
  return fs
    .readdirSync(path.join(packageDir, relativePath))
    .flatMap((name) => symlinksUnder(packageDir, path.join(relativePath, name)))
    .sort();
}

describe('remove-standalone-symlinks', () => {
  let packageDir: string;

  beforeEach(() => {
    packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manage-ui-prepack-'));
    writeFile(packageDir, 'package.json', JSON.stringify({ files: manageUi.files }));
  });

  afterEach(() => {
    fs.rmSync(packageDir, { recursive: true, force: true });
  });

  it('removes every symlink from the published standalone output and keeps its files', () => {
    const pnpmStore = '.next/standalone/node_modules/.pnpm';
    writeFile(packageDir, `${pnpmStore}/zod@4.1.0/node_modules/zod/index.js`, 'zod');
    writeFile(packageDir, `${pnpmStore}/pino@9.0.0/node_modules/pino/index.js`, 'pino');
    writeFile(packageDir, '.next/standalone/package.json', '{}');
    writeFile(packageDir, '.next/standalone/agents-manage-ui/server.js', 'server');
    writeFile(packageDir, '.next/standalone/agents-manage-ui/.next/server/page.js', 'page');
    writeFile(packageDir, '.next/standalone/packages/agents-core/dist/index.js', 'core');
    link(
      packageDir,
      '.next/standalone/agents-manage-ui/node_modules/zod',
      '../../node_modules/.pnpm/zod@4.1.0/node_modules/zod'
    );
    link(
      packageDir,
      '.next/standalone/agents-manage-ui/.next/node_modules/pino-51ec28aa490c8dec',
      '../../../node_modules/.pnpm/pino@9.0.0/node_modules/pino'
    );
    link(
      packageDir,
      '.next/standalone/packages/agents-core/node_modules/zod',
      '../../../node_modules/.pnpm/zod@4.1.0/node_modules/zod'
    );
    link(packageDir, '.next/standalone/agents-manage-ui/server-link.js', 'server.js');

    expect(runPrepack(packageDir)).toContain('Removed 4 symlinks');

    expect(symlinksUnder(packageDir, '.next/standalone/agents-manage-ui')).toEqual([]);
    expect(symlinksUnder(packageDir, '.next/standalone/packages')).toEqual([]);
    for (const file of [
      '.next/standalone/agents-manage-ui/server.js',
      '.next/standalone/agents-manage-ui/.next/server/page.js',
      '.next/standalone/packages/agents-core/dist/index.js',
      `${pnpmStore}/zod@4.1.0/node_modules/zod/index.js`,
      `${pnpmStore}/pino@9.0.0/node_modules/pino/index.js`,
    ]) {
      expect(fs.existsSync(path.join(packageDir, file)), file).toBe(true);
    }
  });

  it('leaves symlinks outside the .next build output alone', () => {
    writeFile(packageDir, 'shared/theme.css', 'theme');
    link(packageDir, 'src/theme.css', '../shared/theme.css');

    expect(runPrepack(packageDir)).toContain('Removed 0 symlinks');
    expect(isSymlink(packageDir, 'src/theme.css')).toBe(true);
  });

  it('succeeds when the package has not been built', () => {
    expect(runPrepack(packageDir)).toContain('Removed 0 symlinks');
  });
});

describe('published source', () => {
  it('contains no symlinks, because the npm registry rejects a tarball that has one', () => {
    const sources = manageUi.files.filter((file) => !file.startsWith('.next/'));

    expect(sources).toContain('public');
    expect(sources.flatMap((file) => symlinksUnder(manageUiDir, file))).toEqual([]);
  });
});
