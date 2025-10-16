import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findUp } from 'find-up';

/**
 * Find project directory by looking for inkeep.config.ts
 * @param projectId - Optional project ID or path to look for
 * @param configPath - Optional specific config file path to use
 * @returns Path to project directory or null if not found
 */
export async function findProjectDirectory(
  projectId?: string,
  configPath?: string
): Promise<string | null> {
  // If a specific config path is provided, use its directory
  if (configPath) {
    const absoluteConfigPath = resolve(process.cwd(), configPath);
    if (existsSync(absoluteConfigPath)) {
      return resolve(absoluteConfigPath, '..');
    }
  }

  if (projectId) {
    // Check if projectId is a path
    if (projectId.includes('/') || projectId.includes('\\')) {
      const projectPath = resolve(process.cwd(), projectId);
      if (existsSync(join(projectPath, 'inkeep.config.ts'))) {
        return projectPath;
      }
    } else {
      // Look for directory with projectId name in current directory
      const projectPath = join(process.cwd(), projectId);
      if (existsSync(join(projectPath, 'inkeep.config.ts'))) {
        return projectPath;
      }
    }
    return null;
  }

  // Use find-up to look for inkeep.config.ts starting from current directory
  const foundConfigPath = await findUp('inkeep.config.ts');

  if (foundConfigPath) {
    // Return the directory containing the config file
    return resolve(foundConfigPath, '..');
  }

  return null;
}
