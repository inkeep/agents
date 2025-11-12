/**
 * Project Validator - Validate generated projects with TypeScript compilation and equivalence checking
 */

import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { enrichCanDelegateToWithTypes } from './index';
import { compareProjects } from './project-comparator';
import { ComponentRegistry } from './utils/component-registry';

/**
 * Find key differences between two objects without full JSON dump
 */
function findKeyDifferences(obj1: any, obj2: any, componentId: string): string[] {
  const differences: string[] = [];
  
  // Get all unique keys from both objects
  const allKeys = new Set([
    ...Object.keys(obj1 || {}),
    ...Object.keys(obj2 || {})
  ]);
  
  for (const key of allKeys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    
    // Skip certain metadata fields that are expected to be different
    if (key.startsWith('_') || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }
    
    if (val1 === undefined && val2 !== undefined) {
      differences.push(`+ ${key}: ${typeof val2} (only in remote)`);
    } else if (val1 !== undefined && val2 === undefined) {
      differences.push(`- ${key}: ${typeof val1} (only in generated)`);
    } else if (val1 !== val2) {
      // For arrays and objects, just show type and length/size differences
      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) {
          differences.push(`~ ${key}: array length differs (${val1.length} vs ${val2.length})`);
        }
      } else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
        const keys1 = Object.keys(val1);
        const keys2 = Object.keys(val2);
        const subKeys1 = keys1.length;
        const subKeys2 = keys2.length;
        if (subKeys1 !== subKeys2) {
          console.log(`🔍 [${key}] Key count mismatch:`);
          console.log(`   Local keys (${subKeys1}):`, keys1.sort());
          console.log(`   Remote keys (${subKeys2}):`, keys2.sort());
          differences.push(`~ ${key}: object size differs (${subKeys1} vs ${subKeys2} keys)`);
        }
      } else if (typeof val1 !== typeof val2) {
        differences.push(`~ ${key}: type differs (${typeof val1} vs ${typeof val2})`);
      } else {
        // For primitives, show the actual values if they're short
        const val1Str = String(val1);
        const val2Str = String(val2);
        if (val1Str.length < 50 && val2Str.length < 50) {
          differences.push(`~ ${key}: "${val1Str}" vs "${val2Str}"`);
        } else {
          differences.push(`~ ${key}: values differ (both ${typeof val1})`);
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
        for (const [agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.subAgents && agentData.subAgents[componentId]) {
            return agentData.subAgents[componentId];
          }
        }
      }
      return null;
    case 'contextConfigs':
      // ContextConfigs are nested within agents - find by contextConfig.id
      if (project.agents) {
        for (const [agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.contextConfig && agentData.contextConfig.id === componentId) {
            console.log(chalk.cyan(`   🔍 Found contextConfig ${componentId} in agent ${agentId}`));
            return agentData.contextConfig;
          }
        }
      }
      console.log(chalk.yellow(`   ⚠️ contextConfig ${componentId} not found in any agent`));
      return null;
    case 'fetchDefinitions':
      // FetchDefinitions are nested within contextConfig.contextVariables
      if (project.agents) {
        for (const [agentId, agentData] of Object.entries(project.agents)) {
          if (agentData.contextConfig?.contextVariables) {
            for (const [varId, variable] of Object.entries(agentData.contextConfig.contextVariables)) {
              if (variable && typeof variable === 'object' && (variable as any).id === componentId) {
                console.log(chalk.cyan(`   🔍 Found fetchDefinition ${componentId} in agent ${agentId}, variable ${varId}`));
                return variable;
              }
            }
          }
        }
      }
      console.log(chalk.yellow(`   ⚠️ fetchDefinition ${componentId} not found in any contextConfig`));
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
      console.log(chalk.red(`   ❌ Unknown component type: ${componentType}`));
      return null;
  }
}

/**
 * Compile TypeScript project in a directory
 */
async function compileTypeScript(projectDir: string): Promise<boolean> {
  try {
    // Create a very permissive tsconfig.json for the temp directory
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      const minimalTsconfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          strict: false,
          noEmit: true,
          resolveJsonModule: true,
          allowJs: true,
          checkJs: false,
          noImplicitAny: false,
          isolatedModules: true, // Only validate individual file syntax
        },
        include: ['**/*.ts', '**/*.js'],
        exclude: ['node_modules'],
        typeAcquisition: {
          enable: false,
        },
      };
      writeFileSync(tsconfigPath, JSON.stringify(minimalTsconfig, null, 2));
    }

    // Copy package.json from parent directory if it exists to help with module resolution
    const parentPackageJson = join(dirname(projectDir), 'package.json');
    const tempPackageJson = join(projectDir, 'package.json');
    if (existsSync(parentPackageJson) && !existsSync(tempPackageJson)) {
      const packageContent = JSON.parse(readFileSync(parentPackageJson, 'utf8'));
      // Create a minimal package.json with just the dependencies
      const minimalPackage = {
        name: 'temp-validation',
        version: '1.0.0',
        dependencies: packageContent.dependencies || {},
        devDependencies: packageContent.devDependencies || {},
      };
      writeFileSync(tempPackageJson, JSON.stringify(minimalPackage, null, 2));
    }

    await new Promise<void>((resolve, reject) => {
      // Use minimal TypeScript checking - just syntax validation
      const tscProcess = spawn(
        'npx',
        [
          'tsc',
          '--noEmit',
          '--skipLibCheck',
          '--isolatedModules', // Only check individual file syntax, no imports
        ],
        {
          cwd: projectDir,
          stdio: 'pipe',
        }
      );

      let stdout = '';
      let stderr = '';

      tscProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      tscProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      tscProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const fullOutput = stdout + stderr;
          reject(new Error(`TypeScript compilation failed with exit code ${code}:\n${fullOutput}`));
        }
      });

      tscProcess.on('error', (err) => {
        reject(new Error(`Failed to run TypeScript compiler: ${err.message}`));
      });
    });

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`   ❌ TypeScript compilation failed:`));

    // Parse and display TypeScript errors, filtering out external file references
    const lines = errorMsg.split('\n');
    let inErrorSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip the first line which just says "TypeScript compilation failed..."
      if (trimmedLine.startsWith('TypeScript compilation failed')) {
        inErrorSection = true;
        continue;
      }

      if (inErrorSection && trimmedLine) {
        // Skip errors from external directories (outside temp dir)
        if (trimmedLine.includes('../../') && !trimmedLine.includes(basename(projectDir))) {
          continue;
        }

        // Color code different types of output
        if (trimmedLine.includes('error TS')) {
          console.log(chalk.red(`      ${trimmedLine}`));
        } else if (trimmedLine.includes('(') && trimmedLine.includes(')')) {
          // File locations
          console.log(chalk.cyan(`      ${trimmedLine}`));
        } else if (trimmedLine.startsWith('~') || trimmedLine.startsWith('^')) {
          // Error indicators
          console.log(chalk.yellow(`      ${trimmedLine}`));
        } else {
          // Other output
          console.log(chalk.gray(`      ${trimmedLine}`));
        }
      }
    }

    console.log(
      chalk.gray(
        `   💡 Run 'npx tsc --noEmit --skipLibCheck' in ${basename(projectDir)} for details`
      )
    );
    console.log(
      chalk.gray(`   💡 External import errors are filtered out to focus on generated files`)
    );
    return false;
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
    enrichCanDelegateToWithTypes(tempProjectDefinition, false);

    // Debug: Log what we found in the temp project vs remote project
    console.log(chalk.cyan(`   🔍 Temp project structure loaded:`));
    console.log(chalk.gray(`      agents: ${tempProjectDefinition.agents ? Object.keys(tempProjectDefinition.agents).join(', ') : 'none'}`));
    if (tempProjectDefinition.agents) {
      for (const [agentId, agentData] of Object.entries(tempProjectDefinition.agents)) {
        console.log(chalk.gray(`        ${agentId}: contextConfig=${!!agentData.contextConfig}, contextConfig.id=${agentData.contextConfig?.id}`));
        if (agentData.contextConfig?.contextVariables) {
          const varIds = Object.keys(agentData.contextConfig.contextVariables);
          console.log(chalk.gray(`          contextVariables: ${varIds.join(', ')}`));
        }
      }
    }
    
    console.log(chalk.cyan(`   🔍 Remote project structure:`));
    console.log(chalk.gray(`      agents: ${remoteProject.agents ? Object.keys(remoteProject.agents).join(', ') : 'none'}`));
    if (remoteProject.agents) {
      for (const [agentId, agentData] of Object.entries(remoteProject.agents)) {
        console.log(chalk.gray(`        ${agentId}: contextConfig=${!!agentData.contextConfig}, contextConfig.id=${agentData.contextConfig?.id}`));
        if (agentData.contextConfig?.contextVariables) {
          const varIds = Object.keys(agentData.contextConfig.contextVariables);
          console.log(chalk.gray(`          contextVariables: ${varIds.join(', ')}`));
        }
      }
    }

    // Use existing project comparator instead of custom logic

    // Create a temporary registry for the temp project (needed by compareProjects)
    const tempRegistry = new ComponentRegistry();

    // Compare using existing comparator
    const comparison = await compareProjects(
      tempProjectDefinition,
      remoteProject,
      tempRegistry,
      true
    );

    // Display comparison results
    const hasChanges = comparison.hasChanges;

    if (!hasChanges) {
      return true;
    } else {
      console.log(chalk.yellow(`      🔄 Found differences:`));

      // Show component changes summary with detailed differences
      for (const [componentType, changes] of Object.entries(comparison.componentChanges)) {
        const totalChanges =
          changes.added.length + changes.modified.length + changes.deleted.length;
        if (totalChanges > 0) {
          console.log(chalk.cyan(`         ${componentType}: ${totalChanges} changes`));
          if (changes.added.length > 0) {
            console.log(chalk.green(`           ➕ Added: ${changes.added.join(', ')}`));
          }
          if (changes.modified.length > 0) {
            console.log(chalk.yellow(`           📝 Modified: ${changes.modified.join(', ')}`));

            // Show specific differences for modified components
            for (const modifiedId of changes.modified) {
              console.log(chalk.gray(`              ${modifiedId} detailed differences:`));

              // Get the actual objects for comparison
              const generatedComponent = getComponentFromProject(
                tempProjectDefinition,
                componentType,
                modifiedId
              );
              const remoteComponent = getComponentFromProject(
                remoteProject,
                componentType,
                modifiedId
              );

              // Show the actual differences
              if (generatedComponent && remoteComponent) {
                const differences = findKeyDifferences(generatedComponent, remoteComponent, modifiedId);
                if (differences.length > 0) {
                  differences.forEach(diff => {
                    console.log(chalk.yellow(`                ${diff}`));
                  });
                } else {
                  console.log(chalk.gray(`                No significant differences detected`));
                }
              } else if (!generatedComponent) {
                console.log(chalk.red(`                Component missing in generated project`));
              } else if (!remoteComponent) {
                console.log(chalk.red(`                Component missing in remote project`));
              }
            }
          }
          if (changes.deleted.length > 0) {
            console.log(chalk.red(`           ➖ Deleted: ${changes.deleted.join(', ')}`));
          }
        }
      }

      // Strict validation - any changes (added, modified, deleted) are failures
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`   ❌ Project validation failed: ${errorMsg}`));
    return false;
  }
}

/**
 * Validate the temp directory by compiling and comparing with remote project
 */
export async function validateTempDirectory(
  originalProjectRoot: string,
  tempDirName: string,
  remoteProject: FullProjectDefinition
): Promise<void> {
  const tempDir = join(originalProjectRoot, tempDirName);

  // Step 1: Skip TypeScript compilation (temp directory may have SDK version mismatches)
  const compilationSuccess = true;

  // Step 2: Load and compare project definitions
  const equivalenceSuccess = await validateProjectEquivalence(tempDir, remoteProject);

  if (equivalenceSuccess) {
    // Ask user if they want to overwrite their files
    console.log(
      chalk.yellow(`\n❓ Would you like to overwrite your project files with the generated files?`)
    );
    console.log(
      chalk.gray(`   This will replace your current files with the validated generated ones.`)
    );
    console.log(chalk.green(`   [Y] Yes - Replace files and clean up temp directory`));
    console.log(chalk.red(`   [N] No - Keep temp directory for manual review`));

    return new Promise<void>((resolve) => {
      // Clean up any existing listeners first and increase max listeners
      process.stdin.removeAllListeners('data');
      process.stdin.setMaxListeners(15);

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onKeypress = (key: string) => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners('data');

        const normalizedKey = key.toLowerCase();
        if (normalizedKey === 'y') {
          console.log(chalk.green(`\n✅ Selected: Yes - Replacing files...`));
          // Overwrite files and clean up
          overwriteProjectFiles(originalProjectRoot, tempDirName, tempDir);
          console.log(chalk.green(`\n🎉 Pull completed successfully!`));
          process.exit(0);
        } else if (normalizedKey === 'n') {
          console.log(chalk.yellow(`\n❌ Selected: No - Files not replaced`));
          console.log(chalk.gray(`📂 Generated files remain in: ${tempDirName}`));
          console.log(chalk.gray(`   You can manually review and copy files as needed.`));
          console.log(chalk.cyan(`\n✅ Pull completed - temp directory preserved for review.`));
          process.exit(0);
        } else {
          console.log(chalk.red(`\n❌ Invalid key: "${key}". Please press Y or N.`));
          console.log(
            chalk.gray(`📂 Files not replaced. Generated files remain in: ${tempDirName}`)
          );
          console.log(
            chalk.yellow(`\n⚠️ Pull completed with invalid input - temp directory preserved.`)
          );
          process.exit(0);
        }
      };

      process.stdin.on('data', onKeypress);
      process.stdout.write(chalk.cyan('\nPress [Y] for Yes or [N] for No: '));
    });
  } else {
    console.log(chalk.yellow(`   ⚠️ Generated project differs from remote project`));
    console.log(chalk.gray(`   💡 This might be expected if there are structural changes`));
    console.log(chalk.gray(`   📂 Generated files available in: ${tempDirName} for manual review`));

    // Summary
    if (compilationSuccess) {
      console.log(chalk.yellow(`\n✅ Compilation successful, but project structure differs.`));
      console.log(
        chalk.cyan(`\n✅ Pull completed - please review generated files in temp directory.`)
      );
      process.exit(0);
    } else {
      console.log(chalk.red(`\n❌ Validation failed - please check the generated files.`));
      console.log(
        chalk.yellow(`\n⚠️ Pull completed with validation errors - temp directory preserved.`)
      );
      process.exit(1); // Exit with error code for validation failure
    }
  }
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
          const relativePath = targetPath.replace(originalProjectRoot + '/', '');
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
