/**
 * Project Validator - Validate generated projects with TypeScript compilation and equivalence checking
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { buildComponentRegistryFromParsing } from './component-parser';
import { enrichCanDelegateToWithTypes } from './index';
import { compareProjects } from './project-comparator';

/**
 * Get a complete preview of an object for logging (pretty-printed JSON)
 */
function getObjectPreview(obj: any): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';

  try {
    // For objects, show complete JSON without truncation
    if (typeof obj === 'object') {
      // Use pretty-printed JSON with indentation for better readability
      return JSON.stringify(obj, null, 2);
    }
    // For primitives, show the full value
    return String(obj);
  } catch {
    return `[Error stringifying: ${typeof obj}]`;
  }
}

/**
 * Find key differences between two objects without full JSON dump
 */
/**
 * Extract credential IDs from an agent object, handling different storage structures
 */
function extractCredentialIds(agentObj: any): string[] {
  const credentialIds: string[] = [];

  // Method 1: Direct credentials array (remote API format)
  if (agentObj.credentials && Array.isArray(agentObj.credentials)) {
    agentObj.credentials.forEach((cred: any) => {
      if (cred.id) {
        credentialIds.push(cred.id);
      }
    });
  }

  // Method 2: Via contextConfig fetchDefinitions (generated format)
  if (agentObj.contextConfig?.contextVariables) {
    Object.values(agentObj.contextConfig.contextVariables).forEach((variable: any) => {
      if (variable && typeof variable === 'object' && variable.credentialReferenceId) {
        credentialIds.push(variable.credentialReferenceId);
      }
    });
  }

  return [...new Set(credentialIds)]; // Remove duplicates
}

// Fields to ignore when comparing generated vs remote projects
// These are SDK/runtime-generated fields that don't represent meaningful structural differences
const IGNORED_COMPARISON_FIELDS = new Set([
  // SDK-generated metadata (added at runtime when loading project)
  'type', // SDK adds 'type: internal' to SubAgents at runtime
  // Runtime context fields (set dynamically)
  'tenantId',
  'projectId',
  'agentId',
  // Runtime/error fields
  'lastError',
  'lastErrorAt',
  'status',
  'usedBy', // Computed field
  // Agent-level fields that shouldn't be compared
  'tools', // Tools are handled at project level and sub-agent level via canUse
  // Timestamps
  'createdAt',
  'updatedAt',
]);

function findKeyDifferences(obj1: any, obj2: any): string[] {
  const differences: string[] = [];

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

  for (const key of allKeys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];

    // Skip certain metadata fields that are expected to be different
    // (Must match project-comparator.ts ignoredFields for consistency)
    if (key.startsWith('_') || IGNORED_COMPARISON_FIELDS.has(key)) {
      continue;
    }

    // Special handling for credentials - compare actual credential usage regardless of structure
    if (key === 'credentials') {
      const creds1 = extractCredentialIds(obj1);
      const creds2 = extractCredentialIds(obj2);

      // Sort both arrays for comparison
      creds1.sort();
      creds2.sort();

      if (JSON.stringify(creds1) !== JSON.stringify(creds2)) {
        differences.push(
          `~ credentials: usage differs (${creds1.join(', ')} vs ${creds2.join(', ')})`
        );
      }
      continue; // Skip normal comparison for credentials
    }

    // Check if values are effectively empty (null, undefined, {}, [])
    const val1IsEmpty =
      val1 === null ||
      val1 === undefined ||
      (Array.isArray(val1) && val1.length === 0) ||
      (typeof val1 === 'object' && val1 !== null && Object.keys(val1).length === 0);
    const val2IsEmpty =
      val2 === null ||
      val2 === undefined ||
      (Array.isArray(val2) && val2.length === 0) ||
      (typeof val2 === 'object' && val2 !== null && Object.keys(val2).length === 0);

    // Skip if both are empty
    if (val1IsEmpty && val2IsEmpty) {
      continue;
    }

    if (val1IsEmpty && !val2IsEmpty) {
      differences.push(`+ ${key}: ${typeof val2} (only in remote)`);
    } else if (!val1IsEmpty && val2IsEmpty) {
      differences.push(`- ${key}: ${typeof val1} (only in generated)`);
    } else if (val1 !== val2) {
      // For arrays and objects, just show type and length/size differences
      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) {
          differences.push(`~ ${key}: array length differs (${val1.length} vs ${val2.length})`);
        }
      } else if (
        typeof val1 === 'object' &&
        typeof val2 === 'object' &&
        val1 !== null &&
        val2 !== null
      ) {
        // Filter out keys with empty/undefined values AND metadata fields for comparison
        const filterKeys = (obj: any) =>
          Object.keys(obj).filter((k) => {
            // Skip metadata fields (use same ignored fields as top level)
            if (k.startsWith('_') || IGNORED_COMPARISON_FIELDS.has(k)) {
              return false;
            }
            const v = obj[k];
            return !(
              v === null ||
              v === undefined ||
              (Array.isArray(v) && v.length === 0) ||
              (typeof v === 'object' && v !== null && Object.keys(v).length === 0)
            );
          });
        const keys1 = filterKeys(val1);
        const keys2 = filterKeys(val2);
        const subKeys1 = keys1.length;
        const subKeys2 = keys2.length;
        if (subKeys1 !== subKeys2) {
          differences.push(`~ ${key}: object size differs (${subKeys1} vs ${subKeys2} keys)`);
        }
      } else if (typeof val1 !== typeof val2) {
        differences.push(`~ ${key}: type differs (${typeof val1} vs ${typeof val2})`);
      } else {
        // Special handling for important fields that should show content
        if (key === 'render' || key === 'component') {
          // Show detailed render/component differences
          const val1Preview = getObjectPreview(val1);
          const val2Preview = getObjectPreview(val2);
          differences.push(`~ ${key}:`);
          differences.push(`    Generated: ${val1Preview}`);
          differences.push(`    Remote:    ${val2Preview}`);
        } else {
          // For other values, show them if they're reasonably short
          const val1Str = String(val1);
          const val2Str = String(val2);
          if (val1Str.length < 100 && val2Str.length < 100) {
            differences.push(`~ ${key}: "${val1Str}" vs "${val2Str}"`);
          } else {
            differences.push(`~ ${key}: values differ (both ${typeof val1})`);
          }
        }
      }
    }
  }

  return differences.slice(0, 10); // Limit to 10 differences to avoid spam
}

/**
 * Get a specific component from a project by type and ID
 */
function getComponentFromProject(
  project: FullProjectDefinition,
  componentType: string,
  componentId: string
): any {
  switch (componentType) {
    case 'credentials':
      return project.credentialReferences?.[componentId];
    case 'tools':
      return project.tools?.[componentId];
    case 'agents':
      return project.agents?.[componentId];
    case 'subAgents':
      // SubAgents are nested within agents - find the subAgent by ID
      if (project.agents) {
        for (const [_agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.subAgents?.[componentId]) {
            return agentData.subAgents[componentId];
          }
        }
      }
      return null;
    case 'contextConfigs':
      // ContextConfigs are nested within agents - find by contextConfig.id
      if (project.agents) {
        for (const [_agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.contextConfig && agentData.contextConfig.id === componentId) {
            return agentData.contextConfig;
          }
        }
      }
      return null;
    case 'fetchDefinitions':
      // FetchDefinitions are nested within contextConfig.contextVariables
      if (project.agents) {
        for (const [_agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.contextConfig?.contextVariables) {
            for (const [_varId, variable] of Object.entries(
              agentData.contextConfig.contextVariables
            )) {
              if (
                variable &&
                typeof variable === 'object' &&
                (variable as any).id === componentId
              ) {
                return variable;
              }
            }
          }
        }
      }
      return null;
    case 'dataComponents':
      return project.dataComponents?.[componentId];
    case 'artifactComponents':
      return project.artifactComponents?.[componentId];
    case 'externalAgents':
      return project.externalAgents?.[componentId];
    case 'functions':
      return project.functions?.[componentId];
    case 'functionTools':
      return project.functionTools?.[componentId];
    default:
      return null;
  }
}

/**
 * Load project from temp directory and compare with remote project
 */
async function validateProjectEquivalence(
  tempDir: string,
  remoteProject: FullProjectDefinition
): Promise<boolean> {
  try {
    // Import the project-loader utility
    const { loadProject } = await import('../../utils/project-loader');

    // Load the project from temp directory
    const tempProject = await loadProject(tempDir);

    // Convert to FullProjectDefinition with timeout
    const tempProjectDefinition = await Promise.race([
      tempProject.getFullDefinition(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('getFullDefinition() timed out after 30 seconds'));
        }, 30000);
      }),
    ]);

    // Apply the same canDelegateTo enrichment to temp project for fair comparison
    enrichCanDelegateToWithTypes(tempProjectDefinition);

    // Use existing project comparator instead of custom logic

    // Build a proper registry for the temp project (needed by compareProjects)
    const tempRegistry = buildComponentRegistryFromParsing(tempDir, false);

    // Compare using existing comparator
    const comparison = await compareProjects(
      tempProjectDefinition,
      remoteProject,
      tempRegistry,
      true
    );

    // Check if there are any changes at all
    if (!comparison.hasChanges) {
      return true;
    }

    // First pass: collect all meaningful differences without logging
    // This lets us decide what to display based on whether there are actual differences
    let hasMeaningfulDifferences = false;
    let hasAddedOrDeleted = false;

    interface ComponentDiff {
      componentType: string;
      componentId: string;
      differences: string[];
      isMissing?: 'generated' | 'remote';
    }

    const meaningfulDiffs: ComponentDiff[] = [];
    const addedComponents: Array<{ type: string; ids: string[] }> = [];
    const deletedComponents: Array<{ type: string; ids: string[] }> = [];

    for (const [componentType, changes] of Object.entries(comparison.componentChanges)) {
      if (changes.added.length > 0) {
        addedComponents.push({ type: componentType, ids: changes.added });
        hasAddedOrDeleted = true;
      }

      if (changes.deleted.length > 0) {
        deletedComponents.push({ type: componentType, ids: changes.deleted });
        hasAddedOrDeleted = true;
      }

      if (changes.modified.length > 0) {
        for (const modifiedId of changes.modified) {
          const generatedComponent = getComponentFromProject(
            tempProjectDefinition,
            componentType,
            modifiedId
          );
          const remoteComponent = getComponentFromProject(remoteProject, componentType, modifiedId);

          if (generatedComponent && remoteComponent) {
            const differences = findKeyDifferences(generatedComponent, remoteComponent);
            if (differences.length > 0) {
              meaningfulDiffs.push({
                componentType,
                componentId: modifiedId,
                differences,
              });
              hasMeaningfulDifferences = true;
            }
          } else if (!generatedComponent) {
            meaningfulDiffs.push({
              componentType,
              componentId: modifiedId,
              differences: [],
              isMissing: 'generated',
            });
            hasMeaningfulDifferences = true;
          } else if (!remoteComponent) {
            meaningfulDiffs.push({
              componentType,
              componentId: modifiedId,
              differences: [],
              isMissing: 'remote',
            });
            hasMeaningfulDifferences = true;
          }
        }
      }
    }

    // If no meaningful differences, the projects are functionally equivalent
    if (!hasMeaningfulDifferences && !hasAddedOrDeleted) {
      // Don't log anything confusing - just return true (equivalent)
      return true;
    }

    // There ARE meaningful differences - display them
    console.log(chalk.yellow(`      🔄 Found differences:`));

    // Show added components
    for (const { type, ids } of addedComponents) {
      console.log(chalk.cyan(`         ${type}:`));
      console.log(chalk.green(`           ➕ Added: ${ids.join(', ')}`));
    }

    // Show deleted components
    for (const { type, ids } of deletedComponents) {
      console.log(chalk.cyan(`         ${type}:`));
      console.log(chalk.red(`           ➖ Deleted: ${ids.join(', ')}`));
    }

    // Show modified components with differences
    const modifiedByType = new Map<string, ComponentDiff[]>();
    for (const diff of meaningfulDiffs) {
      const existing = modifiedByType.get(diff.componentType) ?? [];
      existing.push(diff);
      modifiedByType.set(diff.componentType, existing);
    }

    for (const [componentType, diffs] of modifiedByType) {
      console.log(chalk.cyan(`         ${componentType}:`));
      console.log(
        chalk.yellow(`           📝 Modified: ${diffs.map((d) => d.componentId).join(', ')}`)
      );

      for (const diff of diffs) {
        console.log(chalk.gray(`              ${diff.componentId} detailed differences:`));
        if (diff.isMissing === 'generated') {
          console.log(chalk.red(`                Component missing in generated project`));
        } else if (diff.isMissing === 'remote') {
          console.log(chalk.red(`                Component missing in remote project`));
        } else {
          for (const d of diff.differences) {
            console.log(chalk.gray(`                ${d}`));
          }
        }
      }
    }

    // Strict validation - real changes are failures
    return false;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`   ❌ Project validation failed: ${errorMsg}`));
    return false;
  }
}

// Module-level flag to prevent multiple simultaneous listener setups
let isWaitingForInput = false;
let currentKeypressHandler: ((key: string) => void) | null = null;

/**
 * Validate the temp directory by compiling and comparing with remote project
 */
export interface ValidationResult {
  success: boolean;
  upToDate?: boolean;
  userDeclined?: boolean;
}

export async function validateTempDirectory(
  originalProjectRoot: string,
  tempDirName: string,
  remoteProject: FullProjectDefinition,
  options?: { skipExit?: boolean }
): Promise<ValidationResult> {
  const tempDir = join(originalProjectRoot, tempDirName);
  const skipExit = options?.skipExit ?? false;

  // Load and compare project definitions
  const equivalenceSuccess = await validateProjectEquivalence(tempDir, remoteProject);

  if (equivalenceSuccess) {
    // Projects are functionally equivalent - no meaningful changes
    // Clean up temp directory without prompting user (no point overwriting with equivalent content)
    console.log(chalk.green(`\n✅ Project is already up to date - no meaningful changes detected`));
    console.log(chalk.gray(`   Cleaning up temp directory...`));

    try {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(chalk.gray(`   Temp directory cleaned up.`));
    } catch {
      console.log(chalk.yellow(`   Note: Could not clean up temp directory: ${tempDirName}`));
    }

    console.log(chalk.green(`\n🎉 Pull completed - project is up to date!`));
    if (!skipExit) {
      process.exit(0);
    }
    return { success: true, upToDate: true };
  }

  // Projects have meaningful differences - ask user if they want to overwrite
  console.log(
    chalk.yellow(`\n❓ Would you like to overwrite your project files with the generated files?`)
  );
  console.log(
    chalk.gray(`   This will replace your current files with the validated generated ones.`)
  );
  console.log(chalk.green(`   [Y] Yes - Replace files and clean up temp directory`));
  console.log(chalk.red(`   [N] No - Keep temp directory for manual review`));

  return new Promise<ValidationResult>((resolve) => {
    // Prevent multiple simultaneous listener setups
    if (isWaitingForInput && currentKeypressHandler) {
      // Remove the previous handler if it exists
      process.stdin.removeListener('data', currentKeypressHandler);
    }

    // Clean up any existing listeners to prevent leaks
    process.stdin.removeAllListeners('data');
    process.stdin.removeAllListeners('keypress');
    process.stdin.removeAllListeners('end');

    // Ensure stdin is properly configured
    if (process.stdin.isTTY && !process.stdin.isRaw) {
      process.stdin.setRawMode(true);
    }
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    process.stdin.setEncoding('utf8');

    const onKeypress = (key: string) => {
      // Prevent multiple handlers from executing
      if (!isWaitingForInput) {
        return;
      }

      // Clean up immediately to prevent leaks
      isWaitingForInput = false;
      currentKeypressHandler = null;
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('keypress');
      process.stdin.removeAllListeners('end');
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();

      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'y') {
        console.log(chalk.green(`\n✅ Selected: Yes - Replacing files...`));
        // Overwrite files and clean up
        overwriteProjectFiles(originalProjectRoot, tempDirName, tempDir);
        console.log(chalk.green(`\n🎉 Pull completed successfully!`));
        if (!skipExit) {
          process.exit(0);
        }
        resolve({ success: true });
      } else if (normalizedKey === 'n') {
        console.log(chalk.yellow(`\n❌ Selected: No - Files not replaced`));
        console.log(chalk.gray(`📂 Generated files remain in: ${tempDirName}`));
        console.log(chalk.gray(`   You can manually review and copy files as needed.`));
        console.log(chalk.cyan(`\n✅ Pull completed - temp directory preserved for review.`));
        if (!skipExit) {
          process.exit(0);
        }
        resolve({ success: true, userDeclined: true });
      } else {
        console.log(chalk.red(`\n❌ Invalid key: "${key}". Please press Y or N.`));
        console.log(chalk.gray(`📂 Files not replaced. Generated files remain in: ${tempDirName}`));
        console.log(
          chalk.yellow(`\n⚠️ Pull completed with invalid input - temp directory preserved.`)
        );
        if (!skipExit) {
          process.exit(0);
        }
        resolve({ success: true, userDeclined: true });
      }
    };

    // Store handler reference and set flag before adding listener
    currentKeypressHandler = onKeypress;
    isWaitingForInput = true;

    // Use 'once' instead of 'on' to ensure handler is only called once
    process.stdin.once('data', onKeypress);
    process.stdout.write(chalk.cyan('\nPress [Y] for Yes or [N] for No: '));
  });
}

/**
 * Overwrite project files with validated temp directory files and clean up
 */
function overwriteProjectFiles(
  originalProjectRoot: string,
  tempDirName: string,
  tempDir: string
): void {
  try {
    console.log(chalk.cyan(`\n🔄 Replacing project files with generated files...`));

    let filesReplaced = 0;

    // Recursively copy files from temp directory to original project
    function copyRecursively(sourceDir: string, targetDir: string): void {
      if (!existsSync(sourceDir)) return;

      const entries = readdirSync(sourceDir);

      for (const entry of entries) {
        // Skip temp directories themselves and other unwanted files
        if (
          entry.startsWith('.temp-') ||
          entry.startsWith('.DS_Store') ||
          entry === 'node_modules' ||
          entry === '.git' ||
          entry === 'tsconfig.json' ||
          entry === 'package.json'
        ) {
          continue;
        }

        const sourcePath = join(sourceDir, entry);
        const targetPath = join(targetDir, entry);
        const stat = statSync(sourcePath);

        if (stat.isDirectory()) {
          copyRecursively(sourcePath, targetPath);
        } else if (stat.isFile()) {
          // Ensure target directory exists before copying file
          mkdirSync(dirname(targetPath), { recursive: true });
          copyFileSync(sourcePath, targetPath);
          filesReplaced++;
          const relativePath = targetPath.replace(`${originalProjectRoot}/`, '');
          console.log(chalk.green(`   ✅ Replaced: ${relativePath}`));
        }
      }
    }

    // Copy all files from temp directory to original project
    copyRecursively(tempDir, originalProjectRoot);

    // Clean up temp directory
    console.log(chalk.cyan(`\n🧹 Cleaning up temp directory...`));
    rmSync(tempDir, { recursive: true, force: true });

    console.log(chalk.green(`\n🎉 Successfully replaced ${filesReplaced} files!`));
    console.log(chalk.gray(`   Your project files have been updated with the generated content.`));
    console.log(chalk.gray(`   Temp directory cleaned up.`));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`\n❌ Failed to overwrite project files: ${errorMsg}`));
    console.log(chalk.yellow(`   Generated files remain in: ${tempDirName} for manual review`));
  }
}
