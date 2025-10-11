import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Recursively find all TypeScript files in a directory, excluding specified directories
 * @param rootDir - Root directory to search
 * @param excludeDirs - Array of directory names to exclude (relative to root)
 * @returns Array of file paths
 */
export function findAllTypeScriptFiles(rootDir: string, excludeDirs: string[] = []): string[] {
  const tsFiles: string[] = [];

  function scanDirectory(dir: string): void {
    if (!existsSync(dir)) {
      return;
    }

    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(rootDir, fullPath);

      // Skip excluded directories
      const isExcludedDir = excludeDirs.some(
        (excludeDir) => relativePath === excludeDir || relativePath.startsWith(`${excludeDir}/`)
      );

      if (isExcludedDir) {
        continue;
      }

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        scanDirectory(fullPath);
      } else if (stat.isFile() && item.endsWith('.ts')) {
        // Add TypeScript files
        tsFiles.push(fullPath);
      }
    }
  }

  scanDirectory(rootDir);
  return tsFiles.sort(); // Sort for consistent ordering
}

/**
 * Categorize TypeScript files by their likely purpose based on filename and location
 * @param files - Array of file paths
 * @param rootDir - Root directory for relative path calculation
 * @returns Object with categorized files
 */
export function categorizeTypeScriptFiles(
  files: string[],
  rootDir: string
): {
  indexFile: string | null;
  configFiles: string[];
  agentFiles: string[];
  subAgentFiles: string[];
  toolFiles: string[];
  otherFiles: string[];
} {
  const indexFile =
    files.find((file) => file.endsWith('/index.ts') || file === join(rootDir, 'index.ts')) || null;
  const configFiles: string[] = [];
  const agentFiles: string[] = [];
  const subAgentFiles: string[] = [];
  const toolFiles: string[] = [];
  const otherFiles: string[] = [];

  for (const file of files) {
    const fileName = file.split('/').pop() || '';
    const relativePath = relative(rootDir, file);

    if (file === indexFile) {
      continue; // Already handled
    }

    if (
      fileName.includes('.config.') ||
      fileName.includes('.env.') ||
      fileName === 'inkeep.config.ts'
    ) {
      configFiles.push(file);
    } else if (fileName.includes('.agent.') || relativePath.includes('agent/')) {
      agentFiles.push(file);
    } else if (
      fileName.includes('agent') ||
      fileName.includes('Agent') ||
      relativePath.includes('agents/')
    ) {
      agentFiles.push(file);
    } else if (
      fileName.includes('tool') ||
      fileName.includes('Tool') ||
      relativePath.includes('tools/')
    ) {
      toolFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  }

  return {
    indexFile,
    configFiles,
    agentFiles,
    subAgentFiles,
    toolFiles,
    otherFiles,
  };
}
