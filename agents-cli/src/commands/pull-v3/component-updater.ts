/**
 * Component Updater - Update existing components with new data
 */

import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
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
import { validateTempDirectory } from './project-validator';
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
        stdio: 'pipe',
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
        stdio: 'pipe',
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
    // Biome not available - continue without formatting
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
        stdio: 'pipe',
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
        stdio: 'pipe',
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
  environment: string,
  actualFilePath?: string
): string {
  const defaultStyle = {
    quotes: 'single' as const,
    indentation: '  ',
    semicolons: true,
  };

  switch (componentType) {
    case 'agents': {
      // Get contextConfig data if agent has one
      const contextConfigData = componentData.contextConfig;
      const projectModels = remoteProject.models;
      return generateAgentFile(
        componentId,
        componentData,
        defaultStyle,
        localRegistry,
        contextConfigData,
        projectModels,
        actualFilePath
      );
    }
    case 'subAgents': {
      // Find parent agent info for contextConfig handling
      const parentInfo = findSubAgentWithParent(remoteProject, componentId);
      const parentAgentId = parentInfo?.parentAgentId;
      const contextConfigData = parentInfo?.contextConfigData;
      const parentModels = parentInfo
        ? remoteProject.agents?.[parentInfo.parentAgentId]?.models
        : undefined;

      return generateSubAgentFile(
        componentId,
        componentData,
        defaultStyle,
        localRegistry,
        parentAgentId,
        contextConfigData,
        parentModels,
        actualFilePath
      );
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
      return generateContextConfigFile(
        componentId,
        cleanComponentData,
        defaultStyle,
        localRegistry,
        agentId
      );
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
  providedTempDirName?: string,
  newComponents?: Array<{
    componentId: string;
    componentType: string;
    filePath: string;
  }>
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
      // Convert absolute path back to relative path for generators
      const relativeFilePath = filePath.replace(projectRoot + '/', '');

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
            if (
              agentData.statusUpdates?.statusComponents &&
              agentData.statusUpdates.statusComponents
            ) {
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
        } else if (componentType === 'environments') {
          // Environments are generated programmatically based on environment name
          componentData = {
            name: `${componentId} Environment`,
            description: `Environment configuration for ${componentId}`,
            credentials: remoteProject.credentialReferences || {},
          };
        } else {
          // Standard top-level component lookup
          const remoteComponents = (remoteProject as any)[componentType] || {};
          componentData = remoteComponents[componentId];
          
          // FIX: Reconstruct missing credentials field for agents
          if (componentType === 'agents' && componentData && !componentData.credentials && remoteProject.credentialReferences) {
            const agentCredentials: any[] = [];
            const credentialSet = new Set<string>();
            
            // Scan contextConfig.contextVariables for fetchDefinitions that reference credentials
            if (componentData.contextConfig?.contextVariables) {
              for (const [varName, varData] of Object.entries(componentData.contextConfig.contextVariables)) {
                if (varData && typeof varData === 'object' && (varData as any).credentialReferenceId) {
                  const credId = (varData as any).credentialReferenceId;
                  if (remoteProject.credentialReferences[credId] && !credentialSet.has(credId)) {
                    credentialSet.add(credId);
                    agentCredentials.push({ id: credId });
                  }
                }
              }
            }
            
            // Also check for usedBy field (in case it exists in some responses)
            for (const [credId, credData] of Object.entries(remoteProject.credentialReferences)) {
              if (credData.usedBy) {
                for (const usage of credData.usedBy) {
                  if (usage.type === 'agent' && usage.id === componentId && !credentialSet.has(credId)) {
                    credentialSet.add(credId);
                    agentCredentials.push({ id: credId });
                    break;
                  }
                }
              }
            }
            
            if (agentCredentials.length > 0) {
              componentData.credentials = agentCredentials;
            }
          }
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
            environment,
            relativeFilePath
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

      // Analyze which existing components need to be exported for new components
      let componentsToExport: Array<{
        componentId: string;
        variableName: string;
        reason: string;
      }> = [];

      try {
        componentsToExport = analyzeComponentsToExport(
          newComponents || [],
          relativeFilePath,
          localRegistry
        );
      } catch (error) {
        // Continue without componentsToExport rather than failing completely
      }

      const mergeResult = await mergeComponentsWithLLM({
        oldContent,
        newContent: newComponentContent,
        modifiedComponents: fileComponents.map((c) => ({
          componentId: c.id,
          componentType: c.type,
        })),
        filePath,
        newComponents,
        componentsToExport,
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
      console.log(
        chalk.blue(`   🔄 ${change.componentType}:${change.componentId} in ${change.filePath}`)
      );

      // Debug: log available changes in comparison
      if (debug) {
        console.log(
          chalk.gray(`      🔍 Available comparison changes: ${comparison.changes.length}`)
        );
        comparison.changes.forEach((c, i) => {
          console.log(
            chalk.gray(`        ${i}: ${c.componentType}:${c.componentId} (${c.changeType})`)
          );
        });
      }

      // Find the corresponding change from the comparison data to show what fields changed
      // Note: comparison uses singular forms (e.g. 'subAgent') but updater uses plural forms (e.g. 'subAgents')
      // Convert plural component types (used by updater) to singular forms (used by comparator)
      const normalizedCompType =
        change.componentType.endsWith('s') && change.componentType !== 'headers'
          ? change.componentType.slice(0, -1) // Remove 's' from plural forms
          : change.componentType;
      const componentChanges = comparison.changes.filter(
        (c) => c.componentId === change.componentId && c.componentType === normalizedCompType
      );

      if (debug) {
        console.log(chalk.gray(`      🔍 Matching changes found: ${componentChanges.length}`));
      }

      componentChanges.forEach((compChange) => {
        if (compChange.changedFields && compChange.changedFields.length > 0) {
          compChange.changedFields.forEach((fieldChange) => {
            const changeSymbol =
              fieldChange.changeType === 'added'
                ? '➕'
                : fieldChange.changeType === 'deleted'
                  ? '➖'
                  : '🔄';
            console.log(
              chalk.gray(
                `      ${changeSymbol} ${fieldChange.field}: ${fieldChange.description || fieldChange.changeType}`
              )
            );
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

  // Run Biome on the entire temp directory (silently)
  const tempDir = join(projectRoot, tempDirName);
  await runBiomeOnDirectory(tempDir);

  // Validate the temp directory (silently)
  await validateTempDirectory(projectRoot, tempDirName, remoteProject);

  return results;
}

/**
 * Analyze which existing components need to be exported because they're referenced by new components
 */
function analyzeComponentsToExport(
  newComponents: Array<{
    componentId: string;
    componentType: string;
    filePath: string;
  }>,
  currentFilePath: string,
  localRegistry: ComponentRegistry
): Array<{
  componentId: string;
  variableName: string;
  reason: string;
}> {
  const componentsToExport: Array<{
    componentId: string;
    variableName: string;
    reason: string;
  }> = [];

  // For each new component, check if it imports from the current file
  for (const newComp of newComponents) {
    // Skip if the new component is in the same file as current file
    if (newComp.filePath === currentFilePath) {
      continue;
    }

    // Check all components in the current file that might be referenced by new components
    const allLocalComponents = localRegistry.getAllComponents();
    for (const localComp of allLocalComponents) {
      // Convert the absolute path from registry back to relative for comparison
      const localCompRelativePath = localComp.filePath.startsWith('/')
        ? localComp.filePath
            .split('/')
            .slice(-2)
            .join('/') // Take last 2 parts (dir/file)
        : localComp.filePath;

      if (localCompRelativePath === currentFilePath) {
        // This component is in the current file
        // Check if any new component might reference it (simplified heuristic)
        // For now, we'll be conservative and export commonly referenced components
        if (shouldComponentBeExported(localComp, newComponents)) {
          const existingExport = componentsToExport.find((c) => c.componentId === localComp.id);
          if (!existingExport) {
            componentsToExport.push({
              componentId: localComp.id,
              variableName: localComp.name,
              reason: `referenced by new component ${newComp.componentType}:${newComp.componentId}`,
            });
          }
        }
      }
    }
  }

  return componentsToExport;
}

/**
 * Determine if a component should be exported based on heuristics
 */
function shouldComponentBeExported(
  localComponent: ComponentInfo,
  newComponents: Array<{ componentId: string; componentType: string; filePath: string }>
): boolean {
  // Export components that are likely to be referenced by new components
  // This is a heuristic - in reality, we'd need to parse the new component files to see exact references

  // Export all agents and subAgents as they're commonly referenced
  if (localComponent.type === 'agents' || localComponent.type === 'subAgents') {
    return true;
  }

  // Export tools that are commonly used
  if (localComponent.type === 'tools' || localComponent.type === 'functionTools') {
    return true;
  }

  // Export context configs as they're often referenced
  if (localComponent.type === 'contextConfigs') {
    return true;
  }

  // Export artifact components
  if (localComponent.type === 'artifactComponents') {
    return true;
  }

  return false;
}
