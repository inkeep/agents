/**
 * Converts a component display name to PascalCase for file names and imports.
 * e.g. "Temperature List" | "temperature-list" | "temperature_list" -> "TemperatureList"
 */
export function toPascalCase(name: string): string {
  if (!name?.trim()) return 'Component';
  return name
    .trim()
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Tries to extract the exported component function name from render code.
 * Matches: export function Foo(...) or export const Foo = ...
 * Returns undefined if not found.
 */
export function extractExportedComponentName(code: string): string | undefined {
  if (!code?.trim()) return undefined;
  const exportFunction = /export\s+function\s+(\w+)\s*\(/.exec(code);
  if (exportFunction) return exportFunction[1];
  const exportConst = /export\s+const\s+(\w+)\s*=/.exec(code);
  if (exportConst) return exportConst[1];
  const functionDecl = /function\s+(\w+)\s*\(/.exec(code);
  if (functionDecl) return functionDecl[1];
  const constDecl = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/.exec(code);
  if (constDecl) return constDecl[1];
  return undefined;
}
