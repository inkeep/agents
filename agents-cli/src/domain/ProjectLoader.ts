import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Project } from '@inkeep/agents-sdk';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';
import { ProjectNotFoundError, InvalidProjectError } from './errors';

/**
 * Options for loading a project
 */
export interface ProjectLoadOptions {
  /**
   * Optional explicit project directory path
   * If not provided, will use current working directory
   */
  projectPath?: string;

  /**
   * Optional base directory for resolving relative paths
   * Defaults to process.cwd()
   */
  baseDir?: string;
}

/**
 * ProjectLoader handles loading and validating project definitions
 *
 * This class contains pure business logic for project loading,
 * with no UI or infrastructure dependencies.
 */
export class ProjectLoader {
  /**
   * Resolve the project directory from options
   */
  private resolveProjectDirectory(options: ProjectLoadOptions): string {
    const baseDir = options.baseDir || process.cwd();

    if (options.projectPath) {
      // If project path is explicitly specified, use it
      const resolvedPath = resolve(baseDir, options.projectPath);

      if (!existsSync(join(resolvedPath, 'index.ts'))) {
        throw new ProjectNotFoundError(
          resolvedPath,
          'No index.ts found in specified project directory'
        );
      }

      return resolvedPath;
    }

    // Look for index.ts in base directory
    if (existsSync(join(baseDir, 'index.ts'))) {
      return baseDir;
    }

    throw new ProjectNotFoundError(baseDir, 'No index.ts found in current directory');
  }

  /**
   * Extract project from imported module
   */
  private extractProject(module: Record<string, unknown>, indexPath: string): Project {
    const exports = Object.keys(module);

    for (const exportKey of exports) {
      const value = module[exportKey];
      if (value && typeof value === 'object' && '__type' in value && value.__type === 'project') {
        return value as Project;
      }
    }

    throw new InvalidProjectError(
      indexPath,
      'No project export found in index.ts. Expected an export with __type = "project"'
    );
  }

  /**
   * Load a project from the specified directory
   *
   * @param options - Project load options
   * @returns The loaded Project instance
   * @throws {ProjectNotFoundError} If the project directory or index.ts doesn't exist
   * @throws {InvalidProjectError} If no valid project export is found
   */
  async load(options: ProjectLoadOptions = {}): Promise<Project> {
    const projectDir = this.resolveProjectDirectory(options);
    const indexPath = join(projectDir, 'index.ts');

    if (!existsSync(indexPath)) {
      throw new ProjectNotFoundError(projectDir, 'index.ts not found in project directory');
    }

    // Import the module with TypeScript support
    const module = await importWithTypeScriptSupport(indexPath);

    // Extract and return the project
    return this.extractProject(module, indexPath);
  }

  /**
   * Get the resolved project directory without loading the project
   * Useful for operations that need the directory path
   */
  getProjectDirectory(options: ProjectLoadOptions = {}): string {
    return this.resolveProjectDirectory(options);
  }
}
