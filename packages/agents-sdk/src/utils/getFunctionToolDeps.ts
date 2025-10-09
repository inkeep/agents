import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import * as lockfile from '@yarnpkg/lockfile';
import * as yaml from 'js-yaml';
import ts, { type ModuleResolutionCache } from 'typescript';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('function-tool');

export const getFunctionToolDeps = (name: string, code: string): Record<string, string> => {
  const { dependencies, warnings } = buildToolManifestFromCodeTS(code);
  if (warnings.length > 0) {
    logger.warn({ warnings }, `FunctionTool dependencies warnings for ${name}`);
  }
  return dependencies;
};

type VersionResult = { exact: string } | { range: string; unresolved: true };
export type ToolManifest = { dependencies: Record<string, string>; warnings: string[] };

const NODE_BUILTINS = new Set(builtinModules.concat(builtinModules.map((m) => `node:${m}`)));

const isExternal = (spec: string) =>
  !spec.startsWith('.') && !spec.startsWith('/') && !NODE_BUILTINS.has(spec);

const collapseSubpath = (spec: string) => {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return `${scope}/${name ?? ''}`;
  }
  return spec.split('/')[0];
};

const readJSON = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const findUp = (start: string, file: string): string | null => {
  let dir = path.resolve(start);
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  for (;;) {
    const candidate = path.join(dir, file);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

export function collectDepsFromCodeTS(code: string): Set<string> {
  const info = ts.preProcessFile(code, /*readImportFiles*/ true, /*detectJavaScriptImports*/ true);

  const add = new Set<string>();
  const push = (spec: string) => {
    if (isExternal(spec)) add.add(collapseSubpath(spec));
  };

  for (const f of info.importedFiles) {
    // `import ... from 'x'`, `import('x')`, and `require('x')` (when detectable)
    const spec = f.fileName; // already unquoted
    if (spec) push(spec);
  }

  // Optional: catch CommonJS `require('x')` not surfaced by preProcessFile in rare cases.
  // Minimal tokenizer for string-literal requires/import(): (safe enough for tools)
  const requireLike = /(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = requireLike.exec(code))) push(m[2]);

  return add;
}

export function resolveInstalledVersion(pkg: string, projectRoot: string): VersionResult | null {
  // pnpm
  const pnpmLock = findUp(projectRoot, 'pnpm-lock.yaml');
  if (pnpmLock) {
    const doc = yaml.load(fs.readFileSync(pnpmLock, 'utf8')) as any;
    const pkgs = doc?.packages ?? {};

    for (const key of Object.keys(pkgs)) {
      if (key.startsWith(`${pkg}@`)) {
        const ver = key.slice(key.indexOf('@') + 1);
        if (ver) return { exact: String(ver) };
      }
    }
  }
  // npm
  const npmLock = findUp(projectRoot, 'package-lock.json');
  if (npmLock) {
    const lock = readJSON(npmLock);
    if (lock.packages?.[`node_modules/${pkg}`]?.version) {
      return { exact: String(lock.packages[`node_modules/${pkg}`].version) };
    }
    if (lock.dependencies?.[pkg]?.version) {
      return { exact: String(lock.dependencies[pkg].version) };
    }
  }
  // yarn v1
  const yarnLock = findUp(projectRoot, 'yarn.lock');
  if (yarnLock) {
    const parsed = lockfile.parse(fs.readFileSync(yarnLock, 'utf8'));
    if (parsed.type === 'success') {
      for (const [key, val] of Object.entries(parsed.object)) {
        if (key === pkg || key.startsWith(`${pkg}@`)) {
          const ver = (val as any).version;
          if (ver) return { exact: String(ver) };
        }
      }
    }
  }
  // node_modules fallback (use TS resolver to find the d.ts/js, then walk up to the package root)
  const host: ts.ModuleResolutionHost = {
    fileExists: fs.existsSync,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    realpath: (p) => fs.realpathSync.native?.(p) ?? fs.realpathSync(p),
    directoryExists: (d) => {
      try {
        return fs.statSync(d).isDirectory();
      } catch {
        return false;
      }
    },
    getCurrentDirectory: () => projectRoot,
    getDirectories: (d) =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
  };
  const res = ts.resolveModuleName(
    `${pkg}/package.json`,
    path.join(projectRoot, '__fake.ts'),
    {},
    host,
    ts.ModuleKind.NodeNext as unknown as ModuleResolutionCache
  );
  const pkgJsonPath =
    res?.resolvedModule?.resolvedFileName ??
    // Try typical path as fallback
    findUp(path.join(projectRoot, 'node_modules', pkg), 'package.json');
  if (pkgJsonPath && fs.existsSync(pkgJsonPath)) {
    try {
      const version = readJSON(pkgJsonPath).version;
      if (version) return { exact: String(version) };
    } catch {}
  }

  // host package.json range
  const hostPkg = findUp(projectRoot, 'package.json');
  if (hostPkg) {
    const hostJson = readJSON(hostPkg);
    const range =
      hostJson.dependencies?.[pkg] ??
      hostJson.devDependencies?.[pkg] ??
      hostJson.optionalDependencies?.[pkg];
    if (range) return { range: String(range), unresolved: true as const };
  }
  return null;
}

export function buildToolManifestFromCodeTS(
  code: string,
  projectRoot = process.cwd()
): ToolManifest {
  const deps = collectDepsFromCodeTS(code);
  const warnings: string[] = [];
  const dependencies: Record<string, string> = {};
  for (const pkg of deps) {
    const v = resolveInstalledVersion(pkg, projectRoot);
    if (!v) {
      warnings.push(`Could not resolve version for "${pkg}"`);
      continue;
    }
    if ('unresolved' in v) {
      warnings.push(`Using range for "${pkg}" -> ${v.range} (no lockfile / not installed)`);
      dependencies[pkg] = v.range;
    } else {
      dependencies[pkg] = v.exact;
    }
  }
  return { dependencies, warnings };
}
