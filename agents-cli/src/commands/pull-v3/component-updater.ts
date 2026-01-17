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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { generateText } from 'ai';
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
import { mergeComponentsWithLLM } from './llm-content-merger';
import type { ProjectComparison } from './project-comparator';
import type { ComponentInfo, ComponentRegistry } from './utils/component-registry';
import { findSubAgentWithParent } from './utils/component-registry';
import { getAvailableModel } from './utils/model-provider-detector';

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
 * Copy entire project to temp directory, including symlinks to parent files
 * that might be imported (e.g., ../../env.ts)
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

  // Create symlinks for parent directories that might be imported
  // This handles cases like ../../env.ts being imported from project files
  createParentSymlinks(projectRoot, tempDir);
}

/**
 * Create symlinks in the temp directory for parent files that might be imported
 * Scans project files for parent imports (../) and creates appropriate symlinks
 */
function createParentSymlinks(projectRoot: string, tempDir: string): void {
  const parentImports = findParentImports(tempDir);

  for (const parentPath of parentImports) {
    // Calculate the actual source path
    const sourcePath = resolve(projectRoot, parentPath);

    // Skip if source doesn't exist
    if (!existsSync(sourcePath)) continue;

    // Calculate target path in temp directory
    const targetPath = join(tempDir, parentPath);

    // Skip if already exists
    if (existsSync(targetPath)) continue;

    // Create parent directories if needed
    const targetDir = dirname(targetPath);
    mkdirSync(targetDir, { recursive: true });

    try {
      // Create symlink to the actual file/directory
      symlinkSync(sourcePath, targetPath);
    } catch {
      // If symlink fails (e.g., on Windows), try copying instead
      try {
        const stat = statSync(sourcePath);
        if (stat.isFile()) {
          copyFileSync(sourcePath, targetPath);
        }
      } catch {
        // Ignore if we can't create symlink or copy
      }
    }
  }
}

/**
 * Find all parent imports (../) in TypeScript files within a directory
 */
function findParentImports(dir: string): string[] {
  const parentImports = new Set<string>();
  const importRegex = /(?:from\s+['"]|import\s+['"]|require\s*\(\s*['"])(\.\.[^'"]+)['"]/g;

  function scanDir(currentDir: string): void {
    if (!existsSync(currentDir)) return;

    try {
      const entries = readdirSync(currentDir);

      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.temp-')) continue;

        const fullPath = join(currentDir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (stat.isFile() && /\.[tj]sx?$/.test(entry)) {
          const content = readFileSync(fullPath, 'utf8');
          let match: RegExpMatchArray | null;

          while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            // Resolve the import relative to the file's directory
            const fileDir = dirname(fullPath);
            const relativeToDirRoot = relative(dir, fileDir);
            const resolvedImport = join(relativeToDirRoot, importPath);

            // Only add if it goes outside the temp directory (starts with ..)
            if (resolvedImport.startsWith('..')) {
              // Add both .ts and the bare path
              parentImports.add(resolvedImport);
              if (!resolvedImport.endsWith('.ts') && !resolvedImport.endsWith('.js')) {
                parentImports.add(`${resolvedImport}.ts`);
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors scanning directories
    }
  }

  scanDir(dir);
  return Array.from(parentImports);
}

/**
 * Check for stale components and prompt user for cleanup permission
 */
export async function checkAndPromptForStaleComponentCleanup(
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry
): Promise<boolean> {
  // Get stale components (same logic as cleanup function)
  const remoteComponentIds = new Set<string>();

  // Add all remote component IDs (same logic as cleanupStaleComponents)
  if (remoteProject.agents) {
    Object.keys(remoteProject.agents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.tools) {
    Object.keys(remoteProject.tools).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.functionTools) {
    Object.keys(remoteProject.functionTools).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.functions) {
    Object.keys(remoteProject.functions).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.dataComponents) {
    Object.keys(remoteProject.dataComponents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.artifactComponents) {
    Object.keys(remoteProject.artifactComponents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.credentialReferences) {
    Object.keys(remoteProject.credentialReferences).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.externalAgents) {
    Object.keys(remoteProject.externalAgents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Environments (if they exist as separate entities)
  if ((remoteProject as any).environments) {
    Object.keys((remoteProject as any).environments).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Headers (if they exist as separate entities)
  if ((remoteProject as any).headers) {
    Object.keys((remoteProject as any).headers).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Models - project level
  if (remoteProject.models) {
    remoteComponentIds.add('project'); // models:project component
  }

  // Project component (the project itself)
  if (remoteProject.name || remoteProject.description) {
    remoteComponentIds.add(remoteProject.name || 'project');
  }

  // Add nested components within agents
  if (remoteProject.agents) {
    Object.values(remoteProject.agents).forEach((agent) => {
      if (agent.subAgents) {
        Object.keys(agent.subAgents).forEach((id) => {
          remoteComponentIds.add(id);
        });

        // Check for function tools within each sub-agent
        Object.values(agent.subAgents).forEach((subAgent: any) => {
          if (subAgent.functionTools) {
            Object.keys(subAgent.functionTools).forEach((id) => {
              remoteComponentIds.add(id);
            });
          }
          if (subAgent.tools) {
            Object.keys(subAgent.tools).forEach((id) => {
              remoteComponentIds.add(id);
            });
          }
        });
      }
      if (agent.contextConfig?.id) {
        remoteComponentIds.add(agent.contextConfig.id);
        if (agent.contextConfig.contextVariables) {
          Object.values(agent.contextConfig.contextVariables).forEach((variable: any) => {
            if (variable && typeof variable === 'object' && variable.id) {
              remoteComponentIds.add(variable.id);
            }
          });
        }

        // Headers within context configs (if any)
        if ((agent.contextConfig as any).headers) {
          Object.keys((agent.contextConfig as any).headers).forEach((id) => {
            remoteComponentIds.add(id);
          });
        }
      }

      // Status components
      if ((agent as any).statusUpdates?.statusComponents) {
        (agent as any).statusUpdates.statusComponents.forEach((statusComp: any) => {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId) {
            remoteComponentIds.add(statusCompId);
          }
        });
      }

      // Agent-level models (if any)
      if (agent.models) {
        remoteComponentIds.add(`${agent.id || 'unknown'}-models`);
      }
    });
  }

  // Find stale components (excluding the project root itself)
  const staleComponents: ComponentInfo[] = [];
  for (const component of localRegistry.getAllComponents()) {
    // Skip the project component itself - it's the root and should never be "stale"
    if (component.type === 'project') {
      continue;
    }
    if (!remoteComponentIds.has(component.id)) {
      staleComponents.push(component);
    }
  }

  if (staleComponents.length === 0) {
    return false; // No cleanup needed
  }

  // Show stale components to user with clearer formatting
  console.log(
    chalk.yellow(
      `\n🧹 Found ${staleComponents.length} stale component(s) that don't exist in remote project:`
    )
  );
  staleComponents.forEach((comp) => {
    // Format type for better readability (e.g., "agents" -> "Agent", "tools" -> "Tool")
    const typeLabel = comp.type.replace(/s$/, '').replace(/^./, (c) => c.toUpperCase());
    console.log(chalk.gray(`   • ${typeLabel}: ${chalk.cyan(comp.id)}`));
    console.log(chalk.gray(`     └─ File: ${comp.filePath}`));
  });

  console.log(
    chalk.cyan(`\n❓ Would you like to remove these stale components from your project?`)
  );
  console.log(chalk.green(`   [Y] Yes - Clean up stale components`));
  console.log(chalk.red(`   [N] No - Keep existing components`));

  return new Promise<boolean>((resolve) => {
    // Clean up any existing listeners first to prevent leaks
    process.stdin.removeAllListeners('data');
    process.stdin.removeAllListeners('keypress');
    process.stdin.removeAllListeners('end');

    // Ensure stdin is properly configured
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeypress = (key: string) => {
      // Clean up immediately to prevent leaks
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('keypress');
      process.stdin.removeAllListeners('end');
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();

      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'y') {
        console.log(chalk.green(`\n✅ Selected: Yes - Will clean up stale components`));
        resolve(true);
      } else if (normalizedKey === 'n') {
        console.log(chalk.yellow(`\n❌ Selected: No - Keeping existing components`));
        resolve(false);
      } else {
        console.log(chalk.red(`\n❌ Invalid key: "${key}". Skipping cleanup.`));
        resolve(false);
      }
    };

    process.stdin.once('data', onKeypress);
    process.stdout.write(chalk.cyan('\nPress [Y] for Yes or [N] for No: '));
  });
}

/**
 * Clean up stale components that don't exist in remote project
 * @param projectRoot - Root project directory
 * @param tempDirName - Temp directory name (empty string = operate on original project)
 * @param remoteProject - Remote project definition
 * @param localRegistry - Local component registry
 */
export async function cleanupStaleComponents(
  projectRoot: string,
  tempDirName: string,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry
): Promise<void> {
  const tempDir = join(projectRoot, tempDirName);

  // Get all component IDs that exist in remote project
  const remoteComponentIds = new Set<string>();

  // Add ALL remote component IDs from ALL possible locations

  // Top-level components
  if (remoteProject.agents) {
    Object.keys(remoteProject.agents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.tools) {
    Object.keys(remoteProject.tools).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.functionTools) {
    Object.keys(remoteProject.functionTools).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.functions) {
    Object.keys(remoteProject.functions).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.dataComponents) {
    Object.keys(remoteProject.dataComponents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.artifactComponents) {
    Object.keys(remoteProject.artifactComponents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.credentialReferences) {
    Object.keys(remoteProject.credentialReferences).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }
  if (remoteProject.externalAgents) {
    Object.keys(remoteProject.externalAgents).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Environments (if they exist as separate entities)
  if ((remoteProject as any).environments) {
    Object.keys((remoteProject as any).environments).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Headers (if they exist as separate entities)
  if ((remoteProject as any).headers) {
    Object.keys((remoteProject as any).headers).forEach((id) => {
      remoteComponentIds.add(id);
    });
  }

  // Models - project level
  if (remoteProject.models) {
    remoteComponentIds.add('project'); // models:project component
  }

  // Project component (the project itself)
  if (remoteProject.name || remoteProject.description) {
    remoteComponentIds.add(remoteProject.name || 'project');
  }

  // Nested components within agents
  if (remoteProject.agents) {
    Object.values(remoteProject.agents).forEach((agent) => {
      // Sub-agents
      if (agent.subAgents) {
        Object.keys(agent.subAgents).forEach((id) => {
          remoteComponentIds.add(id);
        });

        // Check for function tools within each sub-agent
        Object.values(agent.subAgents).forEach((subAgent: any) => {
          if (subAgent.functionTools) {
            Object.keys(subAgent.functionTools).forEach((id) => {
              remoteComponentIds.add(id);
            });
          }
          if (subAgent.tools) {
            Object.keys(subAgent.tools).forEach((id) => {
              remoteComponentIds.add(id);
            });
          }
        });
      }

      // Context configs
      if (agent.contextConfig?.id) {
        remoteComponentIds.add(agent.contextConfig.id);

        // Fetch definitions within context configs
        if (agent.contextConfig.contextVariables) {
          Object.values(agent.contextConfig.contextVariables).forEach((variable: any) => {
            if (variable && typeof variable === 'object' && variable.id) {
              remoteComponentIds.add(variable.id);
            }
          });
        }

        // Headers within context configs (if any)
        if ((agent.contextConfig as any).headers) {
          Object.keys((agent.contextConfig as any).headers).forEach((id) => {
            remoteComponentIds.add(id);
          });
        }
      }

      // Status components
      if ((agent as any).statusUpdates?.statusComponents) {
        (agent as any).statusUpdates.statusComponents.forEach((statusComp: any) => {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId) {
            remoteComponentIds.add(statusCompId);
          }
        });
      }

      // Agent-level models (if any)
      if (agent.models) {
        remoteComponentIds.add(`${agent.id || 'unknown'}-models`);
      }
    });
  }

  const allLocalComponents = localRegistry.getAllComponents();

  // Get all local components that don't exist remotely (stale components)
  // Skip the project component itself - it's the root and should never be "stale"
  const staleComponents: ComponentInfo[] = [];
  for (const component of allLocalComponents) {
    if (component.type === 'project') {
      continue;
    }
    if (!remoteComponentIds.has(component.id)) {
      staleComponents.push(component);
    }
  }

  if (staleComponents.length === 0) {
    return; // No cleanup needed
  }

  // Group stale components by file path
  const staleComponentsByFile = new Map<string, ComponentInfo[]>();
  for (const component of staleComponents) {
    const filePath = component.filePath;
    if (!staleComponentsByFile.has(filePath)) {
      staleComponentsByFile.set(filePath, []);
    }
    staleComponentsByFile.get(filePath)?.push(component);
  }

  // Process each file that contains stale components
  for (const [originalFilePath, staleComponentsInFile] of staleComponentsByFile) {
    const tempFilePath = join(tempDir, originalFilePath.replace(`${projectRoot}/`, ''));

    if (!existsSync(tempFilePath)) {
      continue; // File doesn't exist in temp, skip
    }

    // Get all components in this file (both stale and valid)
    const allComponentsInFile = localRegistry.getComponentsInFile(originalFilePath);
    const validComponentsRemaining = allComponentsInFile.filter(
      (component) => !staleComponentsInFile.some((stale) => stale.id === component.id)
    );

    if (validComponentsRemaining.length === 0) {
      // ALL components in this file are stale → delete entire file
      unlinkSync(tempFilePath);
    } else {
      // MIXED file → use LLM to surgically remove only stale components
      const currentContent = readFileSync(tempFilePath, 'utf8');

      // Use LLM to remove stale components
      const cleanedContent = await removeComponentsFromFile(
        currentContent,
        staleComponentsInFile.map((c) => ({ id: c.id, type: c.type }))
      );

      if (cleanedContent !== currentContent) {
        writeFileSync(tempFilePath, cleanedContent, 'utf8');
      }
    }
  }

  // Update the registry to remove stale components so index.ts generation works correctly
  for (const staleComponent of staleComponents) {
    localRegistry.removeComponent(staleComponent.type, staleComponent.id);
  }
}

/**
 * Use LLM specifically for component removal with custom prompt
 */
async function removeComponentsWithLLM(fileContent: string, prompt: string): Promise<string> {
  try {
    const model = await getAvailableModel();
    const result = await generateText({
      model,
      prompt: `${prompt}

File content:
\`\`\`typescript
${fileContent}
\`\`\``,
    });

    // Strip code fences from response if present
    let cleanedResponse = result.text.replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/i, '');
    cleanedResponse = cleanedResponse.replace(/\n?```\s*$/i, '');

    return cleanedResponse.trim();
  } catch (error) {
    console.error('LLM removal failed:', error);
    return fileContent; // Return original content on error
  }
}

/**
 * Use LLM to remove specific components from file content
 */
async function removeComponentsFromFile(
  fileContent: string,
  componentsToRemove: Array<{ id: string; type: string }>
): Promise<string> {
  const componentList = componentsToRemove.map((c) => `${c.type}:${c.id}`).join(', ');

  const prompt = `Remove the following components from this TypeScript file: ${componentList}

Please remove these components completely, including:
- Their export statements
- Their variable declarations/definitions  
- Any imports that are no longer needed after removal
- Any related helper code specific to these components

Keep all other components, imports, and code that are still needed. Ensure the file remains syntactically valid TypeScript.

Original file content:
${fileContent}

Return only the cleaned TypeScript code with the specified components removed.`;

  try {
    // Use the dedicated LLM removal function
    return await removeComponentsWithLLM(fileContent, prompt);
  } catch {
    return fileContent;
  }
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
  const relativePath = filePath.replace(`${projectRoot}/`, '');
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
  } catch {
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
  } catch {
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
      componentsByFile.get(filePath)?.push({
        type: componentType,
        id: componentId,
        registryInfo: actualComponent,
      });
    }
  }

  console.log(
    chalk.cyan(`\n🔄 Updating ${componentsByFile.size} files with modified components...`)
  );

  let fileIndex = 0;
  const totalFiles = componentsByFile.size;

  for (const [filePath, fileComponents] of componentsByFile) {
    fileIndex++;
    try {
      // Convert absolute path back to relative path for generators
      const relativeFilePath = filePath.replace(`${projectRoot}/`, '');

      // Log which file/components are being processed BEFORE the LLM call
      const componentNames = fileComponents.map((c) => `${c.type}:${c.id}`).join(', ');
      console.log(chalk.gray(`   [${fileIndex}/${totalFiles}] Processing: ${relativeFilePath}`));
      console.log(chalk.gray(`            Components: ${componentNames}`));

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
          for (const agentData of Object.values(remoteProject.agents || {})) {
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
          for (const agentData of Object.values(remoteProject.agents || {})) {
            if (agentData.subAgents?.[componentId]) {
              componentData = agentData.subAgents[componentId];
              break;
            }
          }
        } else if (componentType === 'statusComponents') {
          // StatusComponents are nested within agents - find the statusComponent by ID
          for (const agentData of Object.values(remoteProject.agents || {})) {
            if (
              agentData.statusUpdates?.statusComponents &&
              agentData.statusUpdates.statusComponents
            ) {
              for (const statusComp of agentData.statusUpdates.statusComponents) {
                if (statusComp.type === componentId) {
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
          if (
            componentType === 'agents' &&
            componentData &&
            !componentData.credentials &&
            remoteProject.credentialReferences
          ) {
            const agentCredentials: any[] = [];
            const credentialSet = new Set<string>();

            // Scan contextConfig.contextVariables for fetchDefinitions that reference credentials
            if (componentData.contextConfig?.contextVariables) {
              for (const varData of Object.values(componentData.contextConfig.contextVariables)) {
                if (
                  varData &&
                  typeof varData === 'object' &&
                  (varData as any).credentialReferenceId
                ) {
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
              if ((credData as any).usedBy) {
                for (const usage of (credData as any).usedBy) {
                  if (
                    usage.type === 'agent' &&
                    usage.id === componentId &&
                    !credentialSet.has(credId)
                  ) {
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
      } catch {
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
      const relativePath = filePath.replace(`${projectRoot}/`, '');
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

  // Note: Validation is now handled by the main flow after index.ts generation
  // This allows the index.ts to be properly regenerated before validation

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
        if (shouldComponentBeExported(localComp)) {
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
function shouldComponentBeExported(localComponent: ComponentInfo): boolean {
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
