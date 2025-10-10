import { builtinModules } from 'node:module';
import * as ts from 'typescript';

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

/**
 * Extract external NPM dependencies from JavaScript/TypeScript code
 * Returns a Set of package names (without versions)
 */
export function collectDepsFromCode(code: string): Set<string> {
  const info = ts.preProcessFile(code, /*readImportFiles*/ true, /*detectJavaScriptImports*/ true);

  const dependencies = new Set<string>();
  const addDependency = (spec: string) => {
    if (isExternal(spec)) {
      dependencies.add(collapseSubpath(spec));
    }
  };

  // Process imports detected by TypeScript compiler
  for (const importedFile of info.importedFiles) {
    const spec = importedFile.fileName; // already unquoted
    if (spec) {
      addDependency(spec);
    }
  }

  // Additional regex-based detection for require() calls that TS might miss
  const requirePattern = /(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requirePattern.exec(code))) {
    addDependency(match[2]);
  }

  return dependencies;
}

/**
 * Convert detected dependencies to a Record with "latest" versions
 */
export function createLatestDependencies(dependencies: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const dep of dependencies) {
    result[dep] = 'latest';
  }
  return result;
}

/**
 * Auto-detect dependencies from code and return them with "latest" versions
 */
export function autoDetectDependencies(executeCode: string): Record<string, string> {
  const detectedDeps = collectDepsFromCode(executeCode);
  return createLatestDependencies(detectedDeps);
}
