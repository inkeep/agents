/**
 * Component Updater - Update existing components with new data
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { validateTempDirectory } from './project-validator';
import { generateAgentFile } from './components/agent-generator';
import { generateArtifactComponentFile } from './components/artifact-component-generator';
import { generateContextConfigFile } from './components/context-config-generator';
import { generateCredentialFile } from './components/credential-generator';
import { generateDataComponentFile } from './components/data-component-generator';
import { generateEnvironmentFile } from './components/environment-generator';
import { generateExternalAgentFile } from './components/external-agent-generator';
import { generateFunctionToolFile } from './components/function-tool-generator';
import { generateMcpToolFile } from './components/mcp-tool-generator';
import { generateProjectFile } from './components/project-generator';
import { generateStatusComponentFile } from './components/status-component-generator';
import { generateSubAgentFile } from './components/sub-agent-generator';
import { mergeComponentsWithLLM, previewMergeResult } from './llm-content-merger';
import type { ProjectComparison } from './project-comparator';
import type { ComponentInfo, ComponentRegistry } from './utils/component-registry';
import { findSubAgentWithParent } from './utils/component-registry';

interface ComponentUpdateResult {
  componentId: string;
  componentType: string;
  filePath: string;
  success: boolean;
  error?: string;
  oldContent?: string;
  newContent?: string;
}

/**
 * Copy entire project to temp directory
 */
export function copyProjectToTemp(projectRoot: string, tempDirName: string): void {
  const tempDir = join(projectRoot, tempDirName);
  
  function copyRecursively(sourceDir: string, targetDir: string): void {
    if (!existsSync(sourceDir)) return;
    
    mkdirSync(targetDir, { recursive: true });
    const entries = readdirSync(sourceDir);
    
    for (const entry of entries) {
      // Skip temp directories and node_modules
      if (entry.startsWith('.temp-') || entry === 'node_modules') continue;
      
      const sourcePath = join(sourceDir, entry);
      const targetPath = join(targetDir, entry);
      const stat = statSync(sourcePath);
      
      if (stat.isDirectory()) {
        copyRecursively(sourcePath, targetPath);
      } else if (stat.isFile()) {
        copyFileSync(sourcePath, targetPath);
      }
    }
  }
  
  copyRecursively(projectRoot, tempDir);
}

/**
 * Write content to temp directory (overwrite if exists)
 */
function writeToTempDirectory(
  projectRoot: string,
  filePath: string,
  content: string,
  tempDirName: string
): void {
  const tempDir = join(projectRoot, tempDirName);
  const relativePath = filePath.replace(projectRoot + '/', '');
  const tempFilePath = join(tempDir, relativePath);

  // Ensure parent directory exists
  mkdirSync(dirname(tempFilePath), { recursive: true });

  // Write content to temp file (overwrite if exists)
  writeFileSync(tempFilePath, content, 'utf8');
}

/**
 * Run Biome formatter and linter on a file
 */
async function runBiomeOnFile(filePath: string): Promise<boolean> {
  try {
    // Check if file is TypeScript/JavaScript before processing
    const ext = extname(filePath);
    if (!['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
      return true; // Skip non-JS/TS files
    }

    // First format the file
    await new Promise<void>((resolve, reject) => {
      const formatProcess = spawn('npx', ['biome', 'format', '--write', filePath], {
        stdio: 'pipe'
      });
      
      formatProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Biome format exited with code ${code}`));
      });
      
      formatProcess.on('error', (err) => {
        reject(new Error(`Failed to run biome format: ${err.message}`));
      });
    });

    // Then lint and fix the file  
    await new Promise<void>((resolve, reject) => {
      const lintProcess = spawn('npx', ['biome', 'lint', '--write', filePath], {
        stdio: 'pipe'
      });
      
      lintProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Biome lint exited with code ${code}`));
      });
      
      lintProcess.on('error', (err) => {
        reject(new Error(`Failed to run biome lint: ${err.message}`));
      });
    });

    return true;
  } catch (error) {
    // Don't fail the entire process if Biome is not available or fails
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`   ⚠️ Biome not available or failed: ${errorMsg}`));
    console.log(chalk.gray(`   💡 Install biome with: npm install --save-dev @biomejs/biome`));
    return false;
  }
}

/**
 * Run Biome formatter and linter on an entire directory
 */
async function runBiomeOnDirectory(dirPath: string): Promise<boolean> {
  try {
    // First format all files in the directory
    await new Promise<void>((resolve, reject) => {
      const formatProcess = spawn('npx', ['biome', 'format', '--write', '.'], {
        cwd: dirPath,
        stdio: 'pipe'
      });
      
      formatProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Biome format exited with code ${code}`));
      });
      
      formatProcess.on('error', (err) => {
        reject(new Error(`Failed to run biome format: ${err.message}`));
      });
    });

    // Then lint and fix all files in the directory
    await new Promise<void>((resolve, reject) => {
      const lintProcess = spawn('npx', ['biome', 'lint', '--write', '.'], {
        cwd: dirPath,
        stdio: 'pipe'
      });
      
      lintProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Biome lint exited with code ${code}`));
      });
      
      lintProcess.on('error', (err) => {
        reject(new Error(`Failed to run biome lint: ${err.message}`));
      });
    });

    return true;
  } catch (error) {
    // Don't fail the entire process if Biome is not available or fails
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`   ⚠️ Biome directory formatting failed: ${errorMsg}`));
    console.log(chalk.gray(`   💡 Install biome with: npm install --save-dev @biomejs/biome`));
    return false;
  }
}

/**
 * Generate updated component content using appropriate generator
 */
function generateUpdatedComponentContent(
  componentType: string,
  componentId: string,
  componentData: any,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry,
  environment: string
): string {
  const defaultStyle = {
    quotes: 'single' as const,
    indentation: '  ',
    semicolons: true,
  };

  switch (componentType) {
    case 'agents':
      return generateAgentFile(componentId, componentData, defaultStyle, localRegistry);
    case 'subAgents': {
      // Find parent agent info for contextConfig handling
      const parentInfo = findSubAgentWithParent(remoteProject, componentId);
      const parentAgentId = parentInfo?.parentAgentId;
      const contextConfigData = parentInfo?.contextConfigData;
      
      return generateSubAgentFile(componentId, componentData, defaultStyle, localRegistry, parentAgentId, contextConfigData);
    }
    case 'tools':
      return generateMcpToolFile(componentId, componentData, defaultStyle, localRegistry);
    case 'functionTools':
    case 'functions':
      return generateFunctionToolFile(componentId, componentData, defaultStyle);
    case 'dataComponents':
      return generateDataComponentFile(componentId, componentData, defaultStyle);
    case 'artifactComponents':
      return generateArtifactComponentFile(componentId, componentData, defaultStyle);
    case 'statusComponents':
      return generateStatusComponentFile(componentId, componentData, defaultStyle);
    case 'environments':
      return generateEnvironmentFile(componentId, componentData, defaultStyle, localRegistry);
    case 'externalAgents':
      return generateExternalAgentFile(componentId, componentData, defaultStyle, localRegistry);
    case 'credentials':
      return generateCredentialFile(componentId, componentData, defaultStyle);
    case 'contextConfigs': {
      // Extract agent ID if stored in componentData
      const agentId = componentData._agentId;
      // Remove the temporary _agentId field before passing to generator
      const cleanComponentData = { ...componentData };
      delete cleanComponentData._agentId;
      return generateContextConfigFile(componentId, cleanComponentData, defaultStyle, localRegistry, agentId);
    }
    case 'fetchDefinitions':
      // Skip - fetchDefinitions are generated as part of their parent contextConfig
      return '';
    case 'projects':
      return generateProjectFile(componentId, componentData, defaultStyle, localRegistry);
    default:
      throw new Error(`No generator for component type: ${componentType}`);
  }
}

/**
 * Update existing components that have been modified
 */
export async function updateModifiedComponents(
  comparison: ProjectComparison,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry,
  projectRoot: string,
  environment: string,
  debug: boolean = false,
  providedTempDirName?: string
): Promise<ComponentUpdateResult[]> {
  const results: ComponentUpdateResult[] = [];

  // Create unique temp directory name with timestamp or use provided one
  const tempDirName = providedTempDirName || `.temp-${Date.now()}`;
  
  // Copy entire project to temp directory first (only if we created the temp dir name)
  if (!providedTempDirName) {
    console.log(chalk.cyan(`📁 Copying project to ${tempDirName}...`));
    copyProjectToTemp(projectRoot, tempDirName);
    console.log(chalk.green(`✅ Project copied to temp directory`));
  }

  // Get all modified components across all types
  const allModifiedComponents: Array<{ type: string; id: string }> = [];

  for (const [componentType, changes] of Object.entries(comparison.componentChanges)) {
    for (const componentId of changes.modified) {
      allModifiedComponents.push({ type: componentType, id: componentId });
    }
  }
  

  if (allModifiedComponents.length === 0) {
    return results;
  }

  // Group components by file path to handle multi-component files
  const componentsByFile = new Map<
    string,
    Array<{ type: string; id: string; registryInfo: any }>
  >();

  for (const { type: componentType, id: componentId } of allModifiedComponents) {
    // Handle function -> functionTool mapping: functions are implementation details of functionTools
    let actualComponentType = componentType;
    if (componentType === 'functions') {
      actualComponentType = 'functionTools';
    }
    
    const localComponent = localRegistry.get(componentId, actualComponentType as any);
    const singularType = actualComponentType.slice(0, -1);
    const localComponentSingular = localRegistry.get(componentId, singularType as any);    
    const actualComponent = localComponent || localComponentSingular;
    if (actualComponent) {
      const filePath = actualComponent.filePath.startsWith('/')
        ? actualComponent.filePath
        : `${projectRoot}/${actualComponent.filePath}`;

      if (!componentsByFile.has(filePath)) {
        componentsByFile.set(filePath, []);
      }
      componentsByFile.get(filePath)!.push({
        type: componentType,
        id: componentId,
        registryInfo: actualComponent,
      });
    }
  }

  console.log(
    chalk.cyan(`\n🔄 Updating ${componentsByFile.size} files with modified components...`)
  );

  for (const [filePath, fileComponents] of componentsByFile) {
    try {
      // Read current file content
      const oldContent = readFileSync(filePath, 'utf8');

      // Generate content for each modified component separately and combine
      const componentContentParts: string[] = [];
      const componentResults: Array<{
        success: boolean;
        error?: string;
        componentId: string;
        componentType: string;
      }> = [];

      for (const { type: componentType, id: componentId } of fileComponents) {
        // Get the updated component data from remote project
        let componentData: any = null;

        // Handle nested component types that don't exist as top-level collections
        if (componentType === 'contextConfigs') {
          // Find the contextConfig by its ID across all agents
          for (const [agentId, agentData] of Object.entries(remoteProject.agents || {})) {
            if (agentData.contextConfig && agentData.contextConfig.id === componentId) {
              componentData = agentData.contextConfig;
              // Store agent ID for generator
              componentData._agentId = agentId;
              break;
            }
          }
        } else if (componentType === 'fetchDefinitions') {
          // Find fetchDefinition nested in agent contextConfig.contextVariables
          for (const [agentId, agentData] of Object.entries(remoteProject.agents || {})) {
            const contextConfig = (agentData as any).contextConfig;
            if (contextConfig && contextConfig.contextVariables) {
              for (const [varName, variable] of Object.entries(contextConfig.contextVariables)) {
                if ((variable as any)?.id === componentId) {
                  componentData = variable;
                  break;
                }
              }
              if (componentData) break;
            }
          }
        } else if (componentType === 'subAgents') {
          // SubAgents are nested within agents - find the subAgent by ID
          for (const [agentId, agentData] of Object.entries(remoteProject.agents || {})) {
            if (agentData.subAgents && agentData.subAgents[componentId]) {
              componentData = agentData.subAgents[componentId];
              break;
            }
          }
        } else if (componentType === 'statusComponents') {
          // StatusComponents are nested within agents - find the statusComponent by ID
          for (const [agentId, agentData] of Object.entries(remoteProject.agents || {})) {
            if (agentData.statusUpdates?.statusComponents && agentData.statusUpdates.statusComponents) {
              for (const statusComp of agentData.statusUpdates.statusComponents) {
                if (statusComp['type'] === componentId) {
                  componentData = statusComp;
                  break;
                }
              }
            }
          }
        } else if (componentType === 'credentials') {
          // Credentials are in credentialReferences
          componentData = remoteProject.credentialReferences?.[componentId];
        } else {
          // Standard top-level component lookup
          const remoteComponents = (remoteProject as any)[componentType] || {};
          componentData = remoteComponents[componentId];
        }

        if (!componentData) {
          componentResults.push({
            componentId,
            componentType,
            success: false,
            error: `Component data not found in remote project.${componentType}`,
          });
          continue;
        }

        // Generate content for this component
        try {
          const componentContent = generateUpdatedComponentContent(
            componentType,
            componentId,
            componentData,
            remoteProject,
            localRegistry,
            environment
          );

          componentContentParts.push(`// ${componentType}:${componentId}\n${componentContent}`);
          componentResults.push({
            componentId,
            componentType,
            success: true,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          componentResults.push({
            componentId,
            componentType,
            success: false,
            error: errorMsg,
          });
        }
      }

      // Check if any component generation failed
      const failedComponents = componentResults.filter((r) => !r.success);
      if (failedComponents.length > 0) {
        // Add error results for failed components
        failedComponents.forEach((comp) => {
          results.push({
            componentId: comp.componentId,
            componentType: comp.componentType,
            filePath,
            success: false,
            error: comp.error,
          });
        });

        // If some components succeeded, we could still continue, but for now let's skip the whole file
        if (failedComponents.length === componentResults.length) {
          continue;
        }
      }

      // Combine all component content parts
      const newComponentContent = componentContentParts.join('\n\n');

      // Use LLM to intelligently merge old content with new component definitions

      const mergeResult = await mergeComponentsWithLLM({
        oldContent,
        newContent: newComponentContent,
        modifiedComponents: fileComponents.map((c) => ({
          componentId: c.id,
          componentType: c.type,
        })),
        filePath,
      });

      let finalContent: string;
      if (!mergeResult.success) {
        // LLM merge failed, fall back to generated content
        finalContent = newComponentContent;
      } else {
        finalContent = mergeResult.mergedContent;
      }

      // Write final content to temp directory
      writeToTempDirectory(projectRoot, filePath, finalContent, tempDirName);
      const relativePath = filePath.replace(projectRoot + '/', '');
      const tempFilePath = join(projectRoot, tempDirName, relativePath);
      
      // Run Biome formatter and linter on the modified file
      console.log(chalk.cyan(`   🔧 Running Biome formatter/linter...`));
      const biomeSuccess = await runBiomeOnFile(tempFilePath);
      
      if (biomeSuccess) {
        // Re-read the file after Biome formatting to get final size
        const formattedContent = readFileSync(tempFilePath, 'utf8');
        console.log(
          chalk.green(
            `   ✅ File formatted and written: ${tempDirName}/${relativePath} (${formattedContent.length} chars)`
          )
        );
      } else {
        console.log(
          chalk.cyan(
            `   💾 Final content written to ${tempDirName}/${relativePath} (${finalContent.length} chars)`
          )
        );
      }

      // Check if content actually changed
      if (oldContent.trim() === finalContent.trim()) {
        // Add results for all components in this file
        fileComponents.forEach((comp) => {
          results.push({
            componentId: comp.id,
            componentType: comp.type,
            filePath,
            success: true,
            oldContent,
            newContent: finalContent,
          });
        });
        continue;
      }

      // Add results for all components in this file
      fileComponents.forEach((comp) => {
        results.push({
          componentId: comp.id,
          componentType: comp.type,
          filePath,
          success: true,
          oldContent,
          newContent: newComponentContent,
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Add error results for all components in this file
      fileComponents.forEach((comp) => {
        results.push({
          componentId: comp.id,
          componentType: comp.type,
          filePath,
          success: false,
          error: errorMsg,
        });
      });
    }
  }

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const actualChanges = successful.filter((r) => r.oldContent?.trim() !== r.newContent?.trim());

  console.log(chalk.yellow(`\n📋 Analyzed ${actualChanges.length} components with changes`));
  
  // Log details of each changed component with field-level changes
  if (actualChanges.length > 0) {
    actualChanges.forEach((change) => {
      console.log(chalk.blue(`   🔄 ${change.componentType}:${change.componentId} in ${change.filePath}`));
      
      // Debug: log available changes in comparison
      if (debug) {
        console.log(chalk.gray(`      🔍 Available comparison changes: ${comparison.changes.length}`));
        comparison.changes.forEach((c, i) => {
          console.log(chalk.gray(`        ${i}: ${c.componentType}:${c.componentId} (${c.changeType})`));
        });
      }
      
      // Find the corresponding change from the comparison data to show what fields changed
      // Note: comparison uses singular forms (e.g. 'subAgent') but updater uses plural forms (e.g. 'subAgents')
      // Convert plural component types (used by updater) to singular forms (used by comparator)
      const normalizedCompType = change.componentType.endsWith('s') && change.componentType !== 'headers' 
                                  ? change.componentType.slice(0, -1)  // Remove 's' from plural forms
                                  : change.componentType;
      const componentChanges = comparison.changes.filter(c => 
        c.componentId === change.componentId && c.componentType === normalizedCompType
      );
      
      if (debug) {
        console.log(chalk.gray(`      🔍 Matching changes found: ${componentChanges.length}`));
      }
      
      componentChanges.forEach((compChange) => {
        if (compChange.changedFields && compChange.changedFields.length > 0) {
          compChange.changedFields.forEach((fieldChange) => {
            const changeSymbol = fieldChange.changeType === 'added' ? '➕' : 
                                fieldChange.changeType === 'deleted' ? '➖' : '🔄';
            console.log(chalk.gray(`      ${changeSymbol} ${fieldChange.field}: ${fieldChange.description || fieldChange.changeType}`));
          });
        } else if (debug) {
          console.log(chalk.gray(`      🔍 No changedFields data available for this change`));
        }
        if (compChange.summary) {
          console.log(chalk.gray(`      📝 ${compChange.summary}`));
        }
      });
    });
  }
  
  if (successful.length > actualChanges.length) {
    console.log(
      chalk.gray(`   ⚪ ${successful.length - actualChanges.length} components had no changes`)
    );
  }
  if (failed.length > 0) {
    console.log(chalk.red(`   ❌ ${failed.length} components failed to analyze`));
  }
  console.log(chalk.gray('   💡 Files not modified - comparison only'));
  
  // Show temp directory location
  console.log(chalk.cyan(`\n📁 Complete project snapshot: ${tempDirName}`));
  console.log(chalk.gray(`   Original files + modified files with LLM merging`));
  console.log(chalk.gray(`   Use this directory to compare against your original project`));

  // Run Biome on the entire temp directory
  console.log(chalk.cyan(`\n🔧 Running Biome formatter/linter on entire temp directory...`));
  const tempDir = join(projectRoot, tempDirName);
  const biomeSuccess = await runBiomeOnDirectory(tempDir);
  
  if (biomeSuccess) {
    console.log(chalk.green(`✅ Biome formatting and linting completed`));
  } else {
    console.log(chalk.yellow(`⚠️ Biome formatting had some issues (continuing anyway)`));
  }

  // Validate the temp directory
  console.log(chalk.cyan(`\n🔍 Validating generated project...`));
  await validateTempDirectory(projectRoot, tempDirName, remoteProject);

  return results;
}
