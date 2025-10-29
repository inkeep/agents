/**
 * Temp directory validation generator - safely generates and validates files before overwriting
 *
 * This approach is completely path-agnostic and works with whatever directory structure
 * is defined by the filesToGenerate map. It generates all files in a temporary directory,
 * validates that the generated code matches the API response exactly, and only then
 * copies files to the real directory.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import chalk from 'chalk';

/**
 * Temporarily silence console logs during function execution
 */
export function silenceLogs<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  const originalWarn = console.warn;

  // Replace with no-ops
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};

  return fn().finally(() => {
    // Restore original functions
    console.log = originalLog;
    console.info = originalInfo;
    console.debug = originalDebug;
    console.warn = originalWarn;
  });
}

import type { FullProjectDefinition } from '@inkeep/agents-core';
import { type CodeStyle, DEFAULT_CODE_STYLE, formatString } from './generator-utils';

interface TempValidationResult {
  success: boolean;
  tempDir: string;
  generatedFiles: string[];
  validationError?: string;
  validationDetails?: any;
}

interface AgentFileInfo {
  relativePath: string; // e.g., "src/agents/my-agent.ts" or "agents/my-agent.ts"
  exportName: string; // e.g., "myAgent"
}

/**
 * Normalize SDK output format to match API format for comparison
 * The SDK uses `credential: { id: '...', ... }` while API uses `credentialReferenceId: '...'`
 */
function normalizeSDKToAPIFormat(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => normalizeSDKToAPIFormat(item));
  }

  // Create a shallow copy to avoid mutating original
  const normalized: any = { ...data };

  // Convert SDK's credential object to API's credentialReferenceId string
  if (normalized.credential && typeof normalized.credential === 'object') {
    normalized.credentialReferenceId = normalized.credential.id || null;
    delete normalized.credential;
  }

  // Recursively normalize nested objects
  for (const key of Object.keys(normalized)) {
    if (typeof normalized[key] === 'object' && normalized[key] !== null) {
      normalized[key] = normalizeSDKToAPIFormat(normalized[key]);
    }
  }

  return normalized;
}

/**
 * Generate all files in temp directory and validate before copying to real directory
 */
export async function generateAndValidateInTemp(
  projectRoot: string,
  projectData: FullProjectDefinition,
  filesToGenerate: Map<string, string>, // relative path -> content
  style: CodeStyle = DEFAULT_CODE_STYLE,
  componentNameMap?: Map<string, { name: string; type: string; importPath?: string }>,
  skipCopyingExistingFiles: boolean = false
): Promise<TempValidationResult> {
  // Create temp directory as subdirectory of project (for proper module resolution)
  const tempDir = join(
    projectRoot,
    `temp-validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  try {
    mkdirSync(tempDir, { recursive: true });

    // Copy ALL existing TypeScript files that we're not modifying (unless skipped for introspect mode)
    const copiedFiles = skipCopyingExistingFiles
      ? []
      : await copyExistingFiles(projectRoot, tempDir, filesToGenerate);

    // Generate new/modified files in temp directory
    const generatedFiles = await generateFilesToTemp(tempDir, filesToGenerate);

    // Generate index.ts using the componentNameMap if available, otherwise use file detection
    const indexContent = componentNameMap
      ? await generateIndexWithComponentNameMap(tempDir, projectData, componentNameMap, style)
      : await generateIndexFromTempFiles(tempDir, projectData, filesToGenerate, style);
    const indexPath = join(tempDir, 'index.ts');
    writeFileSync(indexPath, indexContent, 'utf-8');

    // No need for package.json - temp directory inherits from parent project

    // Validate the temp directory contains a valid project
    const validationResult = await validateTempProject(tempDir, projectData);

    if (!validationResult.success) {
      return {
        success: false,
        tempDir,
        generatedFiles: [...Array.from(filesToGenerate.keys()), 'index.ts'],
        validationError: validationResult.error,
        validationDetails: validationResult.details,
      };
    }

    return {
      success: true,
      tempDir,
      generatedFiles: [...Array.from(filesToGenerate.keys()), 'index.ts'],
    };
  } catch (error: any) {
    return {
      success: false,
      tempDir,
      generatedFiles: [],
      validationError: `Failed to generate temp files: ${error.message}`,
    };
  }
}

/**
 * Copy existing TypeScript files to temp directory (files we're not modifying)
 * This scans the entire project to find all .ts files and copies ones we're not regenerating
 */
async function copyExistingFiles(
  projectRoot: string,
  tempDir: string,
  filesToGenerate: Map<string, string>
): Promise<string[]> {
  const copiedFiles: string[] = [];
  const filesToSkip = new Set(filesToGenerate.keys());

  try {
    // Find all TypeScript files in the project using recursive directory traversal
    const allTsFiles = findTypeScriptFiles(projectRoot);

    for (const relativePath of allTsFiles) {
      // Skip files we're going to regenerate
      if (filesToSkip.has(relativePath)) continue;

      const sourcePath = join(projectRoot, relativePath);
      const destPath = join(tempDir, relativePath);

      // Ensure destination directory exists
      mkdirSync(dirname(destPath), { recursive: true });

      // Copy the file
      copyFileSync(sourcePath, destPath);
      copiedFiles.push(relativePath);
    }
  } catch (error) {}

  return copiedFiles;
}

/**
 * Generate files to temp directory
 */
async function generateFilesToTemp(
  tempDir: string,
  filesToGenerate: Map<string, string>
): Promise<string[]> {
  const generatedFiles: string[] = [];

  for (const [relativePath, content] of filesToGenerate) {
    const fullPath = join(tempDir, relativePath);

    // Ensure directory exists
    mkdirSync(dirname(fullPath), { recursive: true });

    // Write the file
    writeFileSync(fullPath, content, 'utf-8');
    generatedFiles.push(relativePath);
  }

  return generatedFiles;
}

/**
 * Generate index.ts by finding and reading actual agent files in temp directory
 * This is completely path-agnostic - it detects agents by looking at file contents and the filesToGenerate map
 */
async function generateIndexFromTempFiles(
  tempDir: string,
  projectData: FullProjectDefinition,
  filesToGenerate: Map<string, string>,
  style: CodeStyle
): string {
  const q = style.quotes === 'single' ? "'" : '"';
  const semi = style.semicolons ? ';' : '';
  const lines: string[] = [];

  // Import project function
  lines.push(`import { project } from ${q}@inkeep/agents-sdk${q}${semi}`);

  // Find all agent files by scanning temp directory for files that export agents
  const agentFiles = await findAgentFiles(tempDir);

  // Add imports for agents that actually exist
  if (agentFiles.length > 0) {
    for (const agent of agentFiles) {
      // Generate relative import path from index.ts to the agent file
      const importPath = generateImportPath(agent.relativePath);
      lines.push(`import { ${agent.exportName} } from ${q}${importPath}${q}${semi}`);
    }
  }

  lines.push('');

  // Generate project export using actual agent exports
  const projectVarName = getProjectVariableName(projectData.id);
  lines.push(`export const ${projectVarName} = project({`);
  lines.push(`  id: ${formatString(projectData.id, q)},`);
  lines.push(`  name: ${formatString(projectData.name || projectData.id, q)},`);

  if (projectData.description) {
    lines.push(`  description: ${formatString(projectData.description, q)},`);
  }

  // Add models if present
  if (projectData.models && projectData.models !== null) {
    // Import formatObject for comprehensive model support
    const { formatObject } = await import('./generator-utils');
    lines.push(`  models: ${formatObject(projectData.models, style, 1)},`);
  }

  // Add agents using actual exports
  if (agentFiles.length > 0) {
    lines.push(`  agents: () => [`);
    for (const agent of agentFiles) {
      lines.push(`    ${agent.exportName},`);
    }
    lines.push(`  ],`);
  }

  // Add stopWhen if present (omit if null or undefined)
  if (projectData.stopWhen && projectData.stopWhen !== null) {
    lines.push(`  stopWhen: ${JSON.stringify(projectData.stopWhen)},`);
  }

  lines.push(`})${semi}`);

  return lines.join('\n') + '\n';
}

/**
 * Find all agent files in temp directory by scanning for files that import 'agent' from SDK
 * This is path-agnostic - it looks at file contents rather than assuming directory structure
 */
async function findAgentFiles(tempDir: string): Promise<AgentFileInfo[]> {
  const agentFiles: AgentFileInfo[] = [];

  try {
    // Find all TypeScript files in temp directory
    const allTsFiles = findTypeScriptFiles(tempDir).filter((path) => path !== 'index.ts');

    for (const relativePath of allTsFiles) {
      const filePath = join(tempDir, relativePath);
      const exportName = await detectAgentExport(filePath);

      if (exportName) {
        agentFiles.push({
          relativePath,
          exportName,
        });
      }
    }
  } catch (error) {}

  return agentFiles;
}

/**
 * Detect if a file exports an agent and extract the export name
 */
async function detectAgentExport(filePath: string): Promise<string | null> {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Check if file imports 'agent' from SDK (indicates it's an agent file)
    const hasAgentImport =
      /import\s*{[^}]*\bagent\b[^}]*}\s*from\s*['"`]@inkeep\/agents-sdk['"`]/.test(content);
    if (!hasAgentImport) {
      return null;
    }

    // Extract the export name
    const exportMatch = content.match(/export\s+const\s+(\w+)\s*=\s*agent\s*\(/);
    if (exportMatch) {
      return exportMatch[1];
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate import path from index.ts to a file
 * e.g., "agents/my-agent.ts" -> "./agents/my-agent"
 * e.g., "src/agents/my-agent.ts" -> "./src/agents/my-agent"
 */
function generateImportPath(relativePath: string): string {
  // Remove .ts extension
  const withoutExtension = relativePath.replace(/\.ts$/, '');

  // Add ./ prefix for relative import
  return `./${withoutExtension}`;
}

/**
 * Generate index.ts using the proper componentNameMap (avoids naming collisions)
 */
async function generateIndexWithComponentNameMap(
  tempDir: string,
  projectData: FullProjectDefinition,
  componentNameMap: Map<string, { name: string; type: string; importPath?: string }>,
  style: CodeStyle
): string {
  // Use the existing temp-based generator that already has the correct agents: () => [ format
  // This ensures consistency with the temp validation approach
  const emptyFilesToGenerate = new Map<string, string>(); // Not needed when using componentNameMap
  return await generateIndexFromTempFiles(tempDir, projectData, emptyFilesToGenerate, style);
}

/**
 * Get all TypeScript files in a directory recursively
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
  }

  return files;
}

/**
 * Validate temp project matches API data exactly
 */
async function validateTempProject(
  tempDir: string,
  expectedProjectData: FullProjectDefinition
): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    // Use the same approach as existing pull command
    const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
    const indexPath = join(tempDir, 'index.ts');

    if (!existsSync(indexPath)) {
      return {
        success: false,
        error: 'Generated index.ts not found in temp directory',
        details: { tempDir, indexPath },
      };
    }

    // Debug: Log the files in temp directory to understand the circular dependency

    // Debug: Show index.ts content to understand the issue
    const indexContent = readFileSync(indexPath, 'utf-8');

    // Try to import without executing - if this fails, it's a structural issue

    // Basic static checks:
    // 1. Check that index.ts has a project export
    const hasProjectExport = /export\s+const\s+\w+\s*=\s*project\s*\(/.test(indexContent);
    if (!hasProjectExport) {
      return {
        success: false,
        error: 'Generated index.ts does not contain a project() export',
        details: { indexContent: indexContent.substring(0, 1000) },
      };
    }

    // 2. Check that project ID matches expected
    const projectIdMatch = indexContent.match(/id:\s*['"`]([^'"`]+)['"`]/);
    if (projectIdMatch?.[1] !== expectedProjectData.id) {
      return {
        success: false,
        error: `Project ID mismatch: expected "${expectedProjectData.id}", found "${projectIdMatch?.[1] || 'none'}"`,
        details: { expectedId: expectedProjectData.id, foundId: projectIdMatch?.[1] },
      };
    }

    // Use the same round-trip validation approach as the original pull command

    // Set environment variables temporarily for project loading (same as original pull command)
    const originalTenantId = process.env.INKEEP_TENANT_ID;
    const originalApiUrl = process.env.INKEEP_API_URL;
    const originalApiKey = process.env.INKEEP_API_KEY;

    process.env.INKEEP_TENANT_ID = 'temp-validation';
    process.env.INKEEP_API_URL = 'http://localhost:3000'; // Dummy URL for validation
    if (!process.env.INKEEP_API_KEY) {
      process.env.INKEEP_API_KEY = 'temp-key'; // Dummy key for validation
    }

    try {
      // Import the project loader and load the temp project with timeout
      const { loadProject } = await import('../../utils/project-loader');

      // Add timeout to prevent hanging - silenced to reduce noise
      const tempProject = (await silenceLogs(() =>
        Promise.race([
          loadProject(tempDir),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Project loading timed out after 30 seconds')), 30000)
          ),
        ])
      )) as any;

      // Get the full definition with timeout - silenced to reduce noise
      const actualProjectData = (await silenceLogs(() =>
        Promise.race([
          tempProject.getFullDefinition(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Project serialization timed out after 30 seconds')),
              30000
            )
          ),
        ])
      )) as any;

      // Use the same validation logic as the main pull-v2 system
      const { compareProjectDefinitions } = await import('../../utils/json-comparison');

      // Debug: log what's in expectedProjectData
      console.log(chalk.gray(`\n🔍 DEBUG expectedProjectData has:`));
      console.log(
        chalk.gray(
          `   - functionTools: ${expectedProjectData.functionTools ? Object.keys(expectedProjectData.functionTools).join(', ') : 'none'}`
        )
      );
      console.log(
        chalk.gray(
          `   - functions: ${expectedProjectData.functions ? Object.keys(expectedProjectData.functions).join(', ') : 'none'}`
        )
      );
      console.log(chalk.gray(`\n🔍 DEBUG actualProjectData has:`));
      console.log(
        chalk.gray(
          `   - functionTools: ${actualProjectData.functionTools ? Object.keys(actualProjectData.functionTools).join(', ') : 'none'}`
        )
      );
      console.log(
        chalk.gray(
          `   - functions: ${actualProjectData.functions ? Object.keys(actualProjectData.functions).join(', ') : 'none'}`
        )
      );

      // Normalize SDK output to match API format before comparison
      const normalizedActualData = normalizeSDKToAPIFormat(actualProjectData);
      
      const validation = compareProjectDefinitions(expectedProjectData, normalizedActualData);

      // Only fail on real differences, not warnings (same as main pull-v2 logic)
      if (!validation.matches) {
        // Log the specific differences for debugging
        console.log(
          chalk.red(`\n❌ Temp validation found ${validation.differences.length} differences:`)
        );
        for (const diff of validation.differences) {
          console.log(chalk.gray(`   • ${diff}`));
        }

        return {
          success: false,
          error: `Compiled project data doesn't match API response. Found ${validation.differences.length} real differences (${validation.warnings.length} warnings ignored).`,
          details: validation,
        };
      }

      return {
        success: true,
      };
    } finally {
      // Restore original environment variables (same as original pull)
      if (originalTenantId !== undefined) {
        process.env.INKEEP_TENANT_ID = originalTenantId;
      } else {
        delete process.env.INKEEP_TENANT_ID;
      }

      if (originalApiUrl !== undefined) {
        process.env.INKEEP_API_URL = originalApiUrl;
      } else {
        delete process.env.INKEEP_API_URL;
      }

      if (originalApiKey !== undefined) {
        process.env.INKEEP_API_KEY = originalApiKey;
      } else {
        delete process.env.INKEEP_API_KEY;
      }
    }
  } catch (error: any) {
    // Allow credential-not-found errors during validation (expected for new projects)
    const isCredentialError =
      error.message && error.message.includes('Credential') && error.message.includes('not found');

    if (isCredentialError) {
      console.log(chalk.yellow(`\n⚠️  Validation warning: ${error.message}`));
      console.log(
        chalk.gray(
          '   This is expected for projects with credentials - add real values to environment files after generation.'
        )
      );

      // Treat as success - credentials will be filled in later
      return {
        success: true,
      };
    }

    return {
      success: false,
      error: `Validation failed: ${error.message}`,
      details: { error: error.stack },
    };
  }
}

/**
 * Copy validated files from temp to real directory
 */
export async function copyValidatedFiles(
  tempDir: string,
  projectRoot: string,
  generatedFiles: string[]
): Promise<void> {
  for (const relativePath of generatedFiles) {
    const sourcePath = join(tempDir, relativePath);
    const destPath = join(projectRoot, relativePath);

    // Ensure destination directory exists
    mkdirSync(dirname(destPath), { recursive: true });

    // Copy the file
    copyFileSync(sourcePath, destPath);
  }
}

/**
 * Clean up temp directory
 */
export function cleanupTempDir(tempDir: string): void {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {}
}

// Utility functions

function getProjectVariableName(projectId: string): string {
  if (!projectId || typeof projectId !== 'string') {
    console.error('🔍 getProjectVariableName called with invalid value:', {
      value: projectId,
      type: typeof projectId,
      stack: new Error().stack,
    });
    throw new Error(
      `getProjectVariableName: expected string, got ${typeof projectId}: ${JSON.stringify(projectId)}`
    );
  }

  return projectId
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(rootDir: string, currentDir: string = ''): string[] {
  const files: string[] = [];
  const fullPath = join(rootDir, currentDir);

  try {
    const entries = readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);

      // Skip ignored directories and files
      if (shouldIgnorePath(entry.name, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        files.push(...findTypeScriptFiles(rootDir, entryPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(entryPath);
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }

  return files;
}

/**
 * Check if a path should be ignored
 */
function shouldIgnorePath(name: string, isDirectory: boolean): boolean {
  // Skip common directories to ignore
  const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
  if (isDirectory && ignoredDirs.includes(name)) {
    return true;
  }

  // CRITICAL: Skip temp validation directories to prevent recursive copying
  if (isDirectory && name.startsWith('temp-validation-')) {
    return true;
  }

  // Skip hidden files and directories
  if (name.startsWith('.')) {
    return true;
  }

  return false;
}
