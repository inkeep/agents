import type * as TypeScript from 'typescript';

const collapseSubpath = (spec: string) => {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return `${scope}/${name ?? ''}`;
  }
  return spec.split('/')[0];
};

// Conditional imports to avoid breaking CLI bundling
let builtinModules: string[] = [];
let ts: typeof TypeScript | null = null;

try {
  /**
   * Only import in server environments
   *
   * Prevents rolldown create `require` shims in `dist/_virtual` folder,
   * which will break `turbopack` build in `@inkeep/agents-manage-ui`
   *
   * @see https://tsdown.dev/options/shims#the-require-function-in-esm
   */
  builtinModules = globalThis.require('node:module').builtinModules;
  ts = globalThis.require('typescript');
} catch {}

const NODE_BUILTINS = new Set(builtinModules.concat(builtinModules.map((m) => `node:${m}`)));
/**
 * Extract external NPM dependencies from JavaScript/TypeScript code
 * Returns a Set of package names (without versions)
 */
export function collectDepsFromCode(code: string): Set<string> {
  const isExternal = (spec: string) =>
    !spec.startsWith('.') && !spec.startsWith('/') && !NODE_BUILTINS.has(spec);

  const dependencies = new Set<string>();
  const addDependency = (spec: string) => {
    if (isExternal(spec)) {
      dependencies.add(collapseSubpath(spec));
    }
  };

  // Try TypeScript compiler API if available
  if (ts) {
    try {
      const info = ts.preProcessFile(
        code,
        /* readImportFiles */ true,
        /* detectJavaScriptImports */ true
      );

      // Process imports detected by TypeScript compiler
      for (const importedFile of info.importedFiles) {
        const spec = importedFile.fileName; // already unquoted
        if (spec) {
          addDependency(spec);
        }
      }
    } catch {
      // Fall back to regex if TypeScript parsing fails
    }
  }

  // Regex-based detection for require() and import() calls
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
