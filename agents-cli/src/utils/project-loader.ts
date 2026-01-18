import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from '@inkeep/agents-sdk';
import { importWithTypeScriptSupport } from './tsx-loader';

/**
 * Load and validate project from index.ts
 *
 * This utility is shared between push and pull commands to ensure
 * consistent project loading behavior across the CLI.
 *
 * @param projectDir - The directory containing the index.ts file
 * @returns The loaded Project instance
 * @throws Error if index.ts not found or no valid project export found
 */
export async function loadProject(projectDir: string): Promise<Project> {
  const indexPath = join(projectDir, 'index.ts');

  if (!existsSync(indexPath)) {
    throw new Error(`index.ts not found in project directory: ${projectDir}`);
  }

  // Import the module with TypeScript support
  const module = await importWithTypeScriptSupport(indexPath);

  // Find the first export with __type = "project"
  const exports = Object.keys(module);
  for (const exportKey of exports) {
    const value = module[exportKey];
    if (value && typeof value === 'object' && value.__type === 'project') {
      return value as Project;
    }
  }

  throw new Error(
    'No project export found in index.ts. Expected an export with __type = "project"'
  );
}
