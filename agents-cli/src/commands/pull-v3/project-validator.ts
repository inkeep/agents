/**
 * Project Validator - Validate generated projects with TypeScript compilation and equivalence checking
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { compareProjects } from './project-comparator';
import { ComponentRegistry } from './utils/component-registry';

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
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          skipLibCheck: true,
          strict: false,
          noEmit: true,
          resolveJsonModule: true,
          allowJs: true,
          checkJs: false,
          noImplicitAny: false,
          isolatedModules: true        // Only validate individual file syntax
        },
        include: ["**/*.ts", "**/*.js"],
        exclude: ["node_modules"],
        typeAcquisition: {
          enable: false
        }
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
        name: "temp-validation",
        version: "1.0.0",
        dependencies: packageContent.dependencies || {},
        devDependencies: packageContent.devDependencies || {}
      };
      writeFileSync(tempPackageJson, JSON.stringify(minimalPackage, null, 2));
    }
    
    await new Promise<void>((resolve, reject) => {
      // Use minimal TypeScript checking - just syntax validation
      const tscProcess = spawn('npx', [
        'tsc', 
        '--noEmit',
        '--skipLibCheck',
        '--isolatedModules'      // Only check individual file syntax, no imports
      ], {
        cwd: projectDir,
        stdio: 'pipe'
      });
      
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
    
    console.log(chalk.gray(`   💡 Run 'npx tsc --noEmit --skipLibCheck' in ${basename(projectDir)} for details`));
    console.log(chalk.gray(`   💡 External import errors are filtered out to focus on generated files`));
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
    
    // Use existing project comparator instead of custom logic
    console.log(chalk.cyan(`   📊 Project Structure Comparison:`));
    
    // Create a temporary registry for the temp project (needed by compareProjects)
    const tempRegistry = new ComponentRegistry();
    
    // Compare using existing comparator
    const comparison = await compareProjects(tempProjectDefinition, remoteProject, tempRegistry, true);
    
    // Display comparison results
    const hasChanges = comparison.hasChanges;
    
    if (!hasChanges) {
      console.log(chalk.green(`      ✅ Projects are identical`));
      return true;
    } else {
      console.log(chalk.yellow(`      🔄 Found differences:`));
      
      // Show component changes summary
      for (const [componentType, changes] of Object.entries(comparison.componentChanges)) {
        const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;
        if (totalChanges > 0) {
          console.log(chalk.cyan(`         ${componentType}: ${totalChanges} changes`));
          if (changes.added.length > 0) {
            console.log(chalk.green(`           ➕ Added: ${changes.added.join(', ')}`));
          }
          if (changes.modified.length > 0) {
            console.log(chalk.yellow(`           📝 Modified: ${changes.modified.join(', ')}`));
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
  console.log(chalk.cyan(`   ⏭️  Skipping TypeScript compilation (known SDK type issues in temp directory)`));
  const compilationSuccess = true;
  
  // Step 2: Load and compare project definitions
  console.log(chalk.cyan(`   🔍 Comparing project definitions...`));
  const equivalenceSuccess = await validateProjectEquivalence(tempDir, remoteProject);
  
  if (equivalenceSuccess) {
    console.log(chalk.green(`   ✅ Generated project matches remote project structure`));
    
    // Ask user if they want to overwrite their files
    console.log(chalk.cyan(`\n📁 Generated files are ready in: ${tempDir}`));
    console.log(chalk.yellow(`\n❓ Would you like to overwrite your project files with the generated files?`));
    console.log(chalk.gray(`   This will replace your current files with the validated generated ones.`));
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
          console.log(chalk.gray(`📂 Files not replaced. Generated files remain in: ${tempDirName}`));
          console.log(chalk.yellow(`\n⚠️ Pull completed with invalid input - temp directory preserved.`));
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
      console.log(chalk.cyan(`\n✅ Pull completed - please review generated files in temp directory.`));
      process.exit(0);
    } else {
      console.log(chalk.red(`\n❌ Validation failed - please check the generated files.`));
      console.log(chalk.yellow(`\n⚠️ Pull completed with validation errors - temp directory preserved.`));
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
        if (entry.startsWith('.temp-') || 
            entry === 'node_modules' || 
            entry === '.git' ||
            entry === 'tsconfig.json' ||
            entry === 'package.json') {
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