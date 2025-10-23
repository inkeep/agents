/**
 * Pull v2 - Deterministic project code generation
 * 
 * This command pulls project data from the API and deterministically generates TypeScript files
 * without relying on LLMs, making it faster and more consistent than the original pull command.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { ManagementApiClient } from '../../api';
import type { NestedInkeepConfig } from '../../config';
import { loadConfig } from '../../utils/config';
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { compareProjectDefinitions } from '../../utils/json-comparison';
import { generateToolFile } from './tool-generator';
import { generateDataComponentFile } from './data-component-generator';
import { generateArtifactComponentFile } from './artifact-component-generator';
import { generateStatusComponentFile } from './status-component-generator';
import { generateEnvironmentFiles } from './environment-generator';
import { generateAgentFile } from './agent-generator';
import { generateIndexFile } from './index-generator';
import { type CodeStyle, DEFAULT_CODE_STYLE, ensureUniqueName, type ComponentType, toVariableName } from './generator-utils';
import { updateModifiedComponentWithLLM, batchUpdateModifiedComponents } from './llm-updater';
import { discoverComponentLocations, findComponent, getComponentFilePattern, type ComponentLocation } from './component-discovery';
import { generateComponentParts, batchIntegrateComponents } from './hybrid-generator';

export interface PullV2Options {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  force?: boolean;
}

interface ComponentDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

interface DetailedDiff {
  hasChanges: boolean;
  projectConfig: boolean;  // name, description, models, stopWhen changed
  indexFile: boolean;      // index.ts needs regeneration
  tools: ComponentDiff;
  agents: ComponentDiff;
  dataComponents: ComponentDiff;
  artifactComponents: ComponentDiff;
  statusComponents: ComponentDiff;
  environments: ComponentDiff;
  contextConfig: ComponentDiff;
  functions: ComponentDiff;
  credentials: ComponentDiff;
  fetchDefinitions: ComponentDiff;
  headers: ComponentDiff;
}

function createDetailedDiffFromValidation(
  differences: string[], 
  existingLocations: Map<string, ComponentLocation>,
  project: FullProjectDefinition
): DetailedDiff {
  const diff: DetailedDiff = {
    hasChanges: differences.length > 0,
    projectConfig: false,
    indexFile: false,
    tools: { added: [], modified: [], deleted: [] },
    agents: { added: [], modified: [], deleted: [] },
    dataComponents: { added: [], modified: [], deleted: [] },
    artifactComponents: { added: [], modified: [], deleted: [] },
    statusComponents: { added: [], modified: [], deleted: [] },
    environments: { added: [], modified: [], deleted: [] },
    contextConfig: { added: [], modified: [], deleted: [] },
    functions: { added: [], modified: [], deleted: [] },
    credentials: { added: [], modified: [], deleted: [] },
    fetchDefinitions: { added: [], modified: [], deleted: [] },
    headers: { added: [], modified: [], deleted: [] },
  };

  // Helper function to categorize a component as added or modified
  const categorizeComponent = (componentType: string, componentId: string, diffCategory: ComponentDiff) => {
    const locationKey = `${componentType}:${componentId}`;
    const existsInProject = existingLocations.has(locationKey);
    
    if (existsInProject) {
      // Component exists in file system - it's modified
      if (!diffCategory.modified.includes(componentId)) {
        diffCategory.modified.push(componentId);
      }
    } else {
      // Component doesn't exist in file system - it's added
      if (!diffCategory.added.includes(componentId)) {
        diffCategory.added.push(componentId);
      }
    }
  };

  // Process validation differences and determine which components changed
  for (const difference of differences) {
    if (difference.includes('agents.')) {
      const match = difference.match(/agents\.([^.]+)/);
      if (match) {
        const agentId = match[1];
        categorizeComponent('agent', agentId, diff.agents);
      }
    } else if (difference.includes('tools.')) {
      const match = difference.match(/tools\.([^.]+)/);
      if (match) {
        const toolId = match[1];
        categorizeComponent('tool', toolId, diff.tools);
      }
    } else if (difference.includes('functions.')) {
      const match = difference.match(/functions\.([^.]+)/);
      if (match) {
        const functionId = match[1];
        categorizeComponent('function', functionId, diff.functions);
      }
    } else if (difference.includes('dataComponents.')) {
      const match = difference.match(/dataComponents\.([^.]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('dataComponent', componentId, diff.dataComponents);
      }
    } else if (difference.includes('artifactComponents.')) {
      const match = difference.match(/artifactComponents\.([^.]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('artifactComponent', componentId, diff.artifactComponents);
      }
    } else if (difference.includes('statusComponents.')) {
      const match = difference.match(/statusComponents\.([^.]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('statusComponent', componentId, diff.statusComponents);
      }
    } else if (difference.includes('environments.')) {
      const match = difference.match(/environments\.([^.]+)/);
      if (match) {
        const envId = match[1];
        categorizeComponent('environment', envId, diff.environments);
      }
    } else if (difference.includes('contextConfig')) {
      // contextConfig is usually a single object, but we'll treat it as a component
      categorizeComponent('contextConfig', 'contextConfig', diff.contextConfig);
    } else if (difference.includes('credentialReferences.')) {
      const match = difference.match(/credentialReferences\.([^.]+)/);
      if (match) {
        const credId = match[1];
        categorizeComponent('credential', credId, diff.credentials);
      }
    } else if (difference.includes('fetchDefinitions.')) {
      const match = difference.match(/fetchDefinitions\.([^.]+)/);
      if (match) {
        const fetchId = match[1];
        categorizeComponent('fetchDefinition', fetchId, diff.fetchDefinitions);
      }
    } else if (difference.includes('headers.')) {
      const match = difference.match(/headers\.([^.]+)/);
      if (match) {
        const headerId = match[1];
        categorizeComponent('header', headerId, diff.headers);
      }
    }
  }

  // Also check for completely new components that aren't in validation differences
  // but exist in the project (e.g., newly added components from API)
  const checkForNewComponents = (
    projectComponents: Record<string, any> | undefined,
    componentType: string,
    diffCategory: ComponentDiff
  ) => {
    if (!projectComponents) return;
    
    for (const componentId of Object.keys(projectComponents)) {
      const locationKey = `${componentType}:${componentId}`;
      const existsInProject = existingLocations.has(locationKey);
      
      if (!existsInProject && !diffCategory.added.includes(componentId) && !diffCategory.modified.includes(componentId)) {
        // This is a completely new component not mentioned in validation differences
        diffCategory.added.push(componentId);
      }
    }
  };

  // Check all component types for completely new components
  checkForNewComponents(project.agents, 'agent', diff.agents);
  checkForNewComponents(project.tools, 'tool', diff.tools);
  checkForNewComponents(project.functions, 'function', diff.functions);
  checkForNewComponents(project.dataComponents, 'dataComponent', diff.dataComponents);
  checkForNewComponents(project.artifactComponents, 'artifactComponent', diff.artifactComponents);

  return diff;
}

/**
 * Load and validate inkeep.config.ts
 */
async function loadProjectConfig(
  projectDir: string,
  configPathOverride?: string
): Promise<NestedInkeepConfig> {
  const configPath = configPathOverride
    ? resolve(process.cwd(), configPathOverride)
    : join(projectDir, 'inkeep.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const config = await loadConfig(configPath);

    if (!config.tenantId) {
      throw new Error('tenantId is required in inkeep.config.ts');
    }

    // Convert normalized config to nested format
    return {
      tenantId: config.tenantId,
      agentsManageApi: {
        url: config.agentsManageApiUrl || 'http://localhost:3002',
        ...(config.agentsManageApiKey && { apiKey: config.agentsManageApiKey }),
      },
      agentsRunApi: {
        url: config.agentsRunApiUrl || 'http://localhost:3003',
        ...(config.agentsRunApiKey && { apiKey: config.agentsRunApiKey }),
      },
      outputDirectory: config.outputDirectory,
    };
  } catch (error: any) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create the project directory structure
 */
function createProjectStructure(
  projectDir: string,
  projectId: string,
  useCurrentDirectory: boolean = false
): {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
} {
  let projectRoot: string;
  if (useCurrentDirectory) {
    projectRoot = projectDir;
  } else {
    const dirName = projectDir.split('/').pop() || projectDir;
    projectRoot = dirName === projectId ? projectDir : join(projectDir, projectId);
  }

  const agentsDir = join(projectRoot, 'agents');
  const toolsDir = join(projectRoot, 'tools');
  const dataComponentsDir = join(projectRoot, 'data-components');
  const artifactComponentsDir = join(projectRoot, 'artifact-components');
  const statusComponentsDir = join(projectRoot, 'status-components');
  const environmentsDir = join(projectRoot, 'environments');

  ensureDirectoryExists(projectRoot);
  ensureDirectoryExists(agentsDir);
  ensureDirectoryExists(toolsDir);
  ensureDirectoryExists(dataComponentsDir);
  ensureDirectoryExists(artifactComponentsDir);
  ensureDirectoryExists(statusComponentsDir);
  ensureDirectoryExists(environmentsDir);

  return {
    projectRoot,
    agentsDir,
    toolsDir,
    dataComponentsDir,
    artifactComponentsDir,
    statusComponentsDir,
    environmentsDir,
  };
}

/**
 * Helper function to get value at a nested path like "agents.docs-writer-agent.subAgents.researcher-agent.models"
 */
function getValueAtPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    
    // Handle array access like "canUse[0]"
    if (key.includes('[')) {
      const [arrayKey, indexStr] = key.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      const array = current[arrayKey];
      return Array.isArray(array) ? array[index] : undefined;
    }
    
    return current[key];
  }, obj);
}

/**
 * Read existing project from filesystem if it exists
 * Uses the same logic as push command to parse local files into FullProjectDefinition
 */
async function readExistingProject(projectRoot: string): Promise<FullProjectDefinition | null> {
  const indexPath = join(projectRoot, 'index.ts');
  
  console.log(`🔍 DEBUG - Checking for index.ts at: ${indexPath}`);
  
  if (!existsSync(indexPath)) {
    console.log(`🔍 DEBUG - index.ts does not exist at ${indexPath}`);
    return null;
  }
  
  console.log(`🔍 DEBUG - index.ts exists, attempting to parse project...`);

  try {
    // Import the project-loader utility (same as push command)
    const { loadProject } = await import('../../utils/project-loader');
    
    console.log(`🔍 DEBUG - loadProject imported successfully`);
    
    // Load the project from index.ts (same as push command)
    const project = await loadProject(projectRoot);
    
    console.log(`🔍 DEBUG - project loaded successfully, calling getFullDefinition...`);
    
    // Convert to FullProjectDefinition (same as push command)
    const projectDefinition = await project.getFullDefinition();
    
    console.log(`🔍 DEBUG - getFullDefinition successful, project has ${Object.keys(projectDefinition.tools || {}).length} tools, ${Object.keys(projectDefinition.agents || {}).length} agents`);
    
    return projectDefinition;
  } catch (error) {
    // If there's any error parsing the existing project, treat as if it doesn't exist
    // This ensures pull-v2 can still work even if local files are malformed
    console.warn(`🔍 DEBUG - Failed to parse existing project: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.warn(`🔍 DEBUG - Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Register all component names in the global registry to ensure consistency
 */
function registerAllComponentNames(
  project: FullProjectDefinition,
  globalNameRegistry: Set<string>,
  componentNameMap: Map<string, { name: string; type: ComponentType }>
): void {
  // Register tools
  if (project.tools) {
    for (const toolId of Object.keys(project.tools)) {
      const baseName = toolId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'tool', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`tool:${toolId}`, { name: uniqueName, type: 'tool' });
    }
  }
  
  // Register data components
  if (project.dataComponents) {
    for (const componentId of Object.keys(project.dataComponents)) {
      const baseName = componentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'dataComponent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`dataComponent:${componentId}`, { name: uniqueName, type: 'dataComponent' });
    }
  }
  
  // Register artifact components
  if (project.artifactComponents) {
    for (const componentId of Object.keys(project.artifactComponents)) {
      const baseName = componentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'artifactComponent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`artifactComponent:${componentId}`, { name: uniqueName, type: 'artifactComponent' });
    }
  }
  
  // Register status components from agent statusUpdates
  if (project.agents) {
    for (const agent of Object.values(project.agents)) {
      if ((agent as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agent as any).statusUpdates.statusComponents) {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId) {
            const baseName = statusCompId
              .toLowerCase()
              .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
              .replace(/[^a-zA-Z0-9]/g, '')
              .replace(/^[0-9]/, '_$&');
            const uniqueName = ensureUniqueName(baseName, 'statusComponent', globalNameRegistry);
            globalNameRegistry.add(uniqueName);
            componentNameMap.set(`statusComponent:${statusCompId}`, { name: uniqueName, type: 'statusComponent' });
          }
        }
      }
    }
  }
  
  // Register agents
  if (project.agents) {
    for (const agentId of Object.keys(project.agents)) {
      const baseName = agentId
        .toLowerCase()
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^[0-9]/, '_$&');
      const uniqueName = ensureUniqueName(baseName, 'agent', globalNameRegistry);
      globalNameRegistry.add(uniqueName);
      componentNameMap.set(`agent:${agentId}`, { name: uniqueName, type: 'agent' });
    }
  }
  
  // Register subAgents
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.subAgents) {
        for (const subAgentId of Object.keys(agentData.subAgents)) {
          const baseName = subAgentId
            .toLowerCase()
            .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '')
            .replace(/^[0-9]/, '_$&');
          const uniqueName = ensureUniqueName(baseName, 'subAgent', globalNameRegistry);
          globalNameRegistry.add(uniqueName);
          componentNameMap.set(`subAgent:${subAgentId}`, { name: uniqueName, type: 'subAgent' });
        }
      }
    }
  }
  
  // Register project itself
  const projectBaseName = project.id
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
  const projectUniqueName = ensureUniqueName(projectBaseName, 'project', globalNameRegistry);
  globalNameRegistry.add(projectUniqueName);
  componentNameMap.set(`project:${project.id}`, { name: projectUniqueName, type: 'project' });
}

/**
 * Generate files based on project diff
 */
async function generateFiles(
  project: FullProjectDefinition,
  diff: ProjectDiff,
  paths: ReturnType<typeof createProjectStructure>,
  targetEnv: string,
  style: CodeStyle,
  debug: boolean,
  verbose: boolean,
  componentNameMap: Map<string, { name: string; type: ComponentType }>,
  hasRealDifferences: boolean,
  existingLocations: Map<string, ComponentLocation>
): Promise<void> {
  const { projectRoot, agentsDir, toolsDir, dataComponentsDir, artifactComponentsDir, statusComponentsDir, environmentsDir } = paths;
  
  // Component name map is now provided from the main function (shared with index.ts generation)
  // This ensures consistent naming across all generated files
  
  // Discover existing component locations and generate files intelligently
  
  if (debug) {
    console.log(chalk.gray('  Discovering existing component locations...'));
  }
  
  // existingLocations is now passed as a parameter
  const filePattern = await getComponentFilePattern(paths.projectRoot);
  
  if (debug) {
    console.log(chalk.gray(`  Found ${existingLocations.size} existing components`));
    console.log(chalk.gray(`  File pattern: ${filePattern.hasMixedPattern ? 'Mixed' : filePattern.hasMainIndex ? 'Main index' : filePattern.hasSeparateDirectories ? 'Separate files' : 'Empty project'}`));
  }

  // Group file updates by target file to batch them efficiently
  const fileUpdates = new Map<string, {
    filePath: string;
    modifications: Array<{
      componentType: ComponentLocation['componentType'];
      componentId: string;
      remoteData: any;
      isNew: boolean;
      changes: string[];
    }>;
  }>();

  // Process all component changes using hybrid generation
  await processComponentChanges('tool', project.tools, diff.tools, existingLocations, fileUpdates, paths, style, debug, project, componentNameMap);
  await processComponentChanges('dataComponent', project.dataComponents, diff.dataComponents, existingLocations, fileUpdates, paths, style, debug, project, componentNameMap);
  await processComponentChanges('artifactComponent', project.artifactComponents, diff.artifactComponents, existingLocations, fileUpdates, paths, style, debug, project, componentNameMap);
  await processComponentChanges('agent', project.agents, diff.agents, existingLocations, fileUpdates, paths, style, debug, project, componentNameMap);
  
  // Process status components from agent statusUpdates
  const statusComponentsToProcess = new Map<string, any>();
  if (project.agents) {
    for (const agent of Object.values(project.agents)) {
      if ((agent as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agent as any).statusUpdates.statusComponents) {
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId && !statusComponentsToProcess.has(statusCompId)) {
            statusComponentsToProcess.set(statusCompId, statusComp);
          }
        }
      }
    }
  }
  
  if (statusComponentsToProcess.size > 0) {
    const statusDiff = {
      added: Array.from(statusComponentsToProcess.keys()),
      modified: [],
      deleted: []
    };
    await processComponentChanges('statusComponent', Object.fromEntries(statusComponentsToProcess), statusDiff, existingLocations, fileUpdates, paths, style, debug, project, componentNameMap);
  }

  // Apply all file updates using hybrid generation
  if (fileUpdates.size > 0) {
    if (debug) {
      console.log(chalk.gray(`  📝 Processing ${fileUpdates.size} files with hybrid generation...`));
    }
    
    const fileIntegrations = Array.from(fileUpdates.values()).map(update => {
      const existingContent = existsSync(update.filePath) ? readFileSync(update.filePath, 'utf-8') : '';
      
      // Only use placeholders if we have real differences that require LLM
      const usePlaceholders = hasRealDifferences;
      
      const componentsToAdd = update.modifications.filter(m => m.isNew).map(m => generateComponentParts(m.componentType, m.componentId, m.remoteData, style, project, componentNameMap, usePlaceholders));
      const componentsToModify = update.modifications.filter(m => !m.isNew).map(m => generateComponentParts(m.componentType, m.componentId, m.remoteData, style, project, componentNameMap, usePlaceholders));
      
      if (debug) {
        const isNewFile = !existingContent;
        const hasModifications = componentsToModify.length > 0;
        const method = isNewFile ? '⚡ Deterministic generation' : hasModifications ? '🤖 LLM integration' : '⚡ Deterministic generation';
        console.log(chalk.gray(`    ${method}: ${update.filePath}`));
      }
      
      return {
        filePath: update.filePath,
        existingContent,
        componentsToAdd,
        componentsToModify,
        verbose: verbose
      };
    });

    const integrationResult = await batchIntegrateComponents(fileIntegrations, debug);
    
    if (debug) {
      const llmUsed = fileIntegrations.some(fi => fi.existingContent && (fi.componentsToModify.length > 0 || fi.componentsToAdd.length > 0));
      const deterministicCount = fileIntegrations.filter(fi => !fi.existingContent && fi.componentsToAdd.length > 0 && fi.componentsToModify.length === 0).length;
      
      console.log(chalk.gray(`  ✅ Integration complete: ${integrationResult.successful} successful, ${integrationResult.failed} failed`));
      
      if (deterministicCount > 0) {
        console.log(chalk.gray(`  ⚡ ${deterministicCount} files generated deterministically (new files)`));
      }
      if (llmUsed) {
        console.log(chalk.gray(`  🤖 LLM was used for ${fileIntegrations.length - deterministicCount} file integrations`));
      }
      if (!llmUsed && deterministicCount === fileIntegrations.length) {
        console.log(chalk.gray(`  ⚡ No LLM required - pure deterministic generation`));
      }
    }
  }
}

/**
 * Helper function to process component changes using hybrid generation
 */
async function processComponentChanges(
  componentType: ComponentLocation['componentType'],
  components: Record<string, any> | undefined,
  diff: { added: string[]; modified: string[]; deleted: string[] },
  existingLocations: Map<string, ComponentLocation>,
  fileUpdates: Map<string, {
    filePath: string;
    modifications: Array<{
      componentType: ComponentLocation['componentType'];
      componentId: string;
      remoteData: any;
      isNew: boolean;
      changes: string[];
    }>;
  }>,
  paths: ReturnType<typeof createProjectStructure>,
  style: CodeStyle,
  debug: boolean,
  project: FullProjectDefinition,
  componentNameMap: Map<string, { name: string; type: string }>
): Promise<void> {
  if (!components) return;
  
  // Get the default directory for this component type
  const getDefaultDir = () => {
    switch (componentType) {
      case 'tool': return paths.toolsDir;
      case 'dataComponent': return paths.dataComponentsDir;
      case 'artifactComponent': return paths.artifactComponentsDir;
      case 'statusComponent': return paths.statusComponentsDir;
      case 'agent': return paths.agentsDir;
      default: return paths.projectRoot;
    }
  };

  // Process all component changes
  const allChanges = [...diff.added, ...diff.modified];
  
  for (const componentId of allChanges) {
    const componentData = components[componentId];
    const isNew = diff.added.includes(componentId);
    const locationKey = `${componentType}:${componentId}`;
    const existingLocation = existingLocations.get(locationKey);
    
    // Determine target file path
    let targetFilePath: string;
    
    if (existingLocation && !isNew) {
      // Use existing location for modifications
      targetFilePath = existingLocation.filePath;
    } else {
      // For new components, use detected pattern or default to separate files
      // Use kebab-case file name (original componentId) but camelCase variable name
      targetFilePath = join(getDefaultDir(), `${componentId}.ts`);
    }
    
    // Add to file updates map
    if (!fileUpdates.has(targetFilePath)) {
      fileUpdates.set(targetFilePath, {
        filePath: targetFilePath,
        modifications: []
      });
    }
    
    fileUpdates.get(targetFilePath)!.modifications.push({
      componentType,
      componentId,
      remoteData: componentData,
      isNew,
      changes: [] // We could add specific change details here if needed
    });
    
    if (debug) {
      console.log(chalk.gray(`    ${isNew ? 'Adding' : 'Modifying'} ${componentType} ${componentId} in ${targetFilePath}`));
    }
  }
}

/**
 * Main pull-v2 command
 */
export async function pullV2Command(options: PullV2Options): Promise<void> {
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  console.log(chalk.blue('\n🚀 Pull v2 - Deterministic project generation'));
  console.log(chalk.gray('  No LLM required • Fast • Consistent'));

  const s = p.spinner();
  s.start('Loading configuration...');

  try {
    let config: NestedInkeepConfig | null = null;
    let configFound = false;
    let configLocation = '';

    // Determine initial search directory for config
    const searchDir = process.cwd();

    // If a specific config file was provided, use that
    if (options.config) {
      const configPath = resolve(process.cwd(), options.config);
      if (existsSync(configPath)) {
        try {
          config = await loadProjectConfig(dirname(configPath), options.config);
          configFound = true;
          configLocation = configPath;
        } catch (error) {
          s.stop('Failed to load specified configuration file');
          console.error(
            chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
          );
          process.exit(1);
        }
      } else {
        s.stop(`Specified configuration file not found: ${configPath}`);
        process.exit(1);
      }
    }

    // If no config specified, search for inkeep.config.ts
    if (!configFound) {
      // Check current directory first
      const currentConfigPath = join(searchDir, 'inkeep.config.ts');
      if (existsSync(currentConfigPath)) {
        try {
          config = await loadProjectConfig(searchDir);
          configFound = true;
          configLocation = currentConfigPath;
        } catch (_error) {
          console.log(chalk.yellow('⚠️  Failed to load configuration from current directory'));
        }
      }

      // Check parent directory if not found in current
      if (!configFound) {
        const parentConfigPath = join(searchDir, '..', 'inkeep.config.ts');
        if (existsSync(parentConfigPath)) {
          try {
            config = await loadProjectConfig(join(searchDir, '..'));
            configFound = true;
            configLocation = parentConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from parent directory'));
          }
        }
      }

      // Use find-up as last resort
      if (!configFound) {
        const { findUp } = await import('find-up');
        const foundConfigPath = await findUp('inkeep.config.ts', { cwd: searchDir });
        if (foundConfigPath) {
          try {
            config = await loadProjectConfig(dirname(foundConfigPath));
            configFound = true;
            configLocation = foundConfigPath;
          } catch (_error) {
            console.log(chalk.yellow('⚠️  Failed to load configuration from found path'));
          }
        }
      }
    }

    if (!configFound || !config) {
      s.stop('Configuration not found');
      console.error(chalk.red('\n❌ Error: Could not find inkeep.config.ts'));
      console.error(chalk.yellow('   Please ensure your configuration file exists and is valid.'));
      process.exit(1);
    }

    s.message('Configuration loaded successfully');
    if (options.debug) {
      console.log(chalk.gray(`\n📄 Config loaded from: ${configLocation}`));
      console.log(chalk.gray(`   Tenant ID: ${config.tenantId}`));
      console.log(chalk.gray(`   Manage API: ${config.agentsManageApi.url}`));
    }

    // Determine project ID
    let projectId = options.project;
    if (!projectId) {
      s.stop('Project ID required');
      console.error(chalk.red('\n❌ Error: Project ID is required'));
      console.error(chalk.yellow('   Use: --project <project-id> or specify in current directory'));
      process.exit(1);
    }

    // Initialize API client
    const apiClient = await ManagementApiClient.create(
      config.agentsManageApi.url,
      options.config,
      config.tenantId,
      projectId
    );

    // Fetch project data
    s.start(`Fetching project data: ${projectId}`);
    let projectData: FullProjectDefinition;
    try {
      projectData = await apiClient.getFullProject(projectId);
      s.message(`Project data fetched: ${projectData.name}`);
      if (options.debug) {
        console.log(chalk.gray(`\n📊 Project: ${projectData.name} (${projectData.id})`));
        console.log(chalk.gray(`   Agents: ${Object.keys(projectData.agents || {}).length}`));
        console.log(chalk.gray(`   Tools: ${Object.keys(projectData.tools || {}).length}`));
        console.log(chalk.gray(`   Data Components: ${Object.keys(projectData.dataComponents || {}).length}`));
        console.log(chalk.gray(`   Artifact Components: ${Object.keys(projectData.artifactComponents || {}).length}`));
      }
    } catch (error) {
      s.stop(`Failed to fetch project: ${projectId}`);
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }

    // JSON output mode
    if (options.json) {
      s.stop('Project data fetched');
      console.log(JSON.stringify(projectData, null, 2));
      process.exit(0);
    }

    // Determine output directory
    const outputDir = (config.outputDirectory && config.outputDirectory !== 'default') 
      ? config.outputDirectory 
      : process.cwd();
    const projectDir = resolve(outputDir);
    
    // Create project structure
    s.start('Creating project structure...');
    const paths = createProjectStructure(projectDir, projectId, false);
    
    // Read existing project if it exists
    const existingProject = await readExistingProject(paths.projectRoot);
    
    // DEBUG: Check what readExistingProject returned
    console.log('🐛 DEBUG - existingProject:', existingProject ? 'FOUND' : 'NULL');
    
    // Discover existing component locations early (needed for diff creation)
    const existingLocations = await discoverComponentLocations(paths.projectRoot);
    if (existingProject) {
      console.log('🐛 DEBUG - existingProject has tools:', Object.keys(existingProject.tools || {}).length);
      console.log('🐛 DEBUG - existingProject has agents:', Object.keys(existingProject.agents || {}).length);
    }
    
    // First, do a validated comparison to check if there are REAL differences
    let hasRealDifferences = true;
    let validationResult: any = null;
    
    if (existingProject) {
      try {
        console.log(chalk.gray('🔍 DEBUG - Starting validation comparison...'));
        validationResult = compareProjectDefinitions(projectData, existingProject);
        hasRealDifferences = !validationResult.matches;
        console.log(chalk.gray(`🔍 DEBUG - Validation complete. hasRealDifferences: ${hasRealDifferences}`));
      } catch (error) {
        console.error(chalk.red('❌ Validation comparison failed:'), error);
        // Fall back to treating as different to be safe
        hasRealDifferences = true;
        validationResult = { matches: false, differences: ['Validation comparison failed'], warnings: [] };
      }
      
      if (options.debug) {
        console.log(chalk.gray('\n🔍 VALIDATION CHECK (using pull command logic):'));
        console.log(chalk.gray(`   Real differences detected: ${hasRealDifferences}`));
        if (validationResult.differences?.length > 0) {
          console.log(chalk.yellow(`   Validation differences: ${validationResult.differences.length}`));
          for (const diff of validationResult.differences) {
            console.log(chalk.gray(`     • ${diff}`));
            
            // Extract path from difference message to show actual values
            if (diff.includes(' at ')) {
              const pathMatch = diff.match(/ at (.+?)(?::|$)/);
              if (pathMatch) {
                const path = pathMatch[1];
                const apiValue = getValueAtPath(projectData, path);
                const sdkValue = getValueAtPath(existingProject, path);
                
                console.log(chalk.cyan(`       API:    ${JSON.stringify(apiValue)}`));
                console.log(chalk.magenta(`       SDK:    ${JSON.stringify(sdkValue)}`));
              }
            }
          }
        }
        if (validationResult.warnings?.length > 0) {
          console.log(chalk.yellow(`   Validation warnings: ${validationResult.warnings.length}`));
          for (const warning of validationResult.warnings) {
            console.log(chalk.gray(`     ⚠️  ${warning}`));
          }
        }
      }
    }

    // Use the same validation result we already have, or handle new projects
    let validation = validationResult;
    let diff;
    
    if (!existingProject) {
      // Check if this is a parsing failure due to placeholders vs truly new project
      const indexExists = existsSync(join(paths.projectRoot, 'index.ts'));
      
      if (indexExists) {
        console.log(chalk.gray('🔍 DEBUG - Files exist but parsing failed (likely due to placeholders)'));
        console.log(chalk.gray('🔍 DEBUG - Treating as no real differences since files exist with expected structure'));
        
        // Files exist but parsing failed (likely due to placeholders)
        // This means no real content changes, just placeholder differences
        hasRealDifferences = false;
        diff = {
          hasChanges: false, // Key: set to false since files exist
          projectConfig: false,
          indexFile: false,
          tools: { added: [], modified: [], deleted: [] },
          agents: { added: [], modified: [], deleted: [] },
          dataComponents: { added: [], modified: [], deleted: [] },
          artifactComponents: { added: [], modified: [], deleted: [] },
          statusComponents: { added: [], modified: [], deleted: [] },
          environments: { added: [], modified: [], deleted: [] },
          contextConfig: { added: [], modified: [], deleted: [] },
          functions: { added: [], modified: [], deleted: [] },
          credentials: { added: [], modified: [], deleted: [] },
          fetchDefinitions: { added: [], modified: [], deleted: [] },
          headers: { added: [], modified: [], deleted: [] },
        };
        validation = { matches: true, differences: [], warnings: [] };
      } else {
        // For truly new projects, mark everything as "added" 
        console.log(chalk.gray('🔍 DEBUG - New project (no index.ts), treating all components as new'));
        diff = {
          hasChanges: true,
          projectConfig: true,
          indexFile: true,
          tools: { added: Object.keys(projectData.tools || {}), modified: [], deleted: [] },
          agents: { added: Object.keys(projectData.agents || {}), modified: [], deleted: [] },
          dataComponents: { added: Object.keys(projectData.dataComponents || {}), modified: [], deleted: [] },
          artifactComponents: { added: Object.keys(projectData.artifactComponents || {}), modified: [], deleted: [] },
          statusComponents: { added: [], modified: [], deleted: [] },
          environments: { added: [], modified: [], deleted: [] },
          contextConfig: { added: [], modified: [], deleted: [] },
          functions: { added: Object.keys(projectData.functions || {}), modified: [], deleted: [] },
          credentials: { added: Object.keys(projectData.credentialReferences || {}), modified: [], deleted: [] },
          fetchDefinitions: { added: [], modified: [], deleted: [] },
          headers: { added: [], modified: [], deleted: [] },
        };
        validation = { matches: false, differences: [], warnings: [] };
      }
    } else {
      // For existing projects, create diff from validation differences
      validation = validationResult;
      diff = createDetailedDiffFromValidation(validation.differences, existingLocations, projectData);
    }
    
    // Check if project-level config or index.ts needs updating
    diff.projectConfig = validation.differences.some(d => 
      d.includes('name') || d.includes('description') || d.includes('models') || d.includes('stopWhen')
    );
    diff.indexFile = diff.hasChanges; // Always regenerate index.ts when any component changes
    
    // Always show detailed diff information when there are changes
    if (!validation.matches) {
      console.log(chalk.yellow('\n🔍 DETAILED PROJECT DIFF:'));
      console.log(chalk.gray(`   Has changes: ${!validation.matches}`));
      console.log(chalk.gray(`   Real differences: ${validation.differences.length} (${validation.warnings.length} warnings ignored)`));
    } else if (options.debug) {
      console.log(chalk.green('\n✅ No differences detected between local and remote projects'));
    }

    // Use validation result to determine if we should proceed
    if (options.debug) {
      console.log(chalk.gray(`🔍 DEBUG - Early exit check:`));
      console.log(chalk.gray(`   hasRealDifferences: ${hasRealDifferences}`));
      console.log(chalk.gray(`   options.force: ${options.force}`));
      console.log(chalk.gray(`   validationResult.differences.length: ${validationResult?.differences?.length || 0}`));
    }
    
    if (!hasRealDifferences && !options.force) {
      s.stop();
      console.log(chalk.green('✅ Project is already up to date (validated comparison)'));
      console.log(chalk.green('   No real differences detected between remote and local project'));
      if (options.debug) {
        console.log(chalk.gray('   🚀 Exiting early - validation confirmed no functional changes'));
        console.log(chalk.gray('   💡 Any structural differences shown above are just formatting/metadata differences'));
      }
      process.exit(0); // Force clean exit to prevent hanging
    }

    // Show warning if validation says no real differences but diff system thinks there are changes
    if (!hasRealDifferences && diff.hasChanges) {
      console.log(chalk.yellow('\n⚠️  COMPARISON MISMATCH DETECTED'));
      console.log(chalk.gray('   The detailed diff shows changes, but validated comparison says no real differences.'));
      console.log(chalk.gray('   This indicates the changes are likely just structural/metadata differences.'));
      console.log(chalk.gray('   Using --force flag to bypass this check.'));
      
      if (!options.force) {
        return;
      }
    }

    // Check if LLM will be used and ask for confirmation
    const willUseLLM = existingProject && !validation.matches;

    if (willUseLLM) {
      console.log(chalk.yellow('\n⚠️  LLM INTEGRATION REQUIRED'));
      console.log(chalk.gray('   The system detected modifications to existing components.'));
      console.log(chalk.gray('   This will require LLM assistance to integrate changes while preserving existing code style.'));
      
      const modifiedCount = validation.differences.length;
                           
      console.log(chalk.gray(`   Components requiring LLM integration: ${modifiedCount}`));
      console.log(chalk.gray('   New components will be generated deterministically (no LLM required).'));
      
      const shouldContinue = await p.confirm({
        message: 'Continue with LLM integration?',
        initialValue: false
      });

      if (p.isCancel(shouldContinue) || !shouldContinue) {
        console.log(chalk.yellow('\n🚫 Operation cancelled by user'));
        process.exit(0);
      }
      
      console.log(chalk.blue('\n✅ Proceeding with LLM-assisted integration...'));
    } else {
      console.log(chalk.green('\n⚡ Pure deterministic generation - no LLM required'));
    }

    // Generate files (if there are differences, regenerate everything for now)
    const targetEnv = options.env || 'development';
    const codeStyle = DEFAULT_CODE_STYLE;
    
    // Create the global component name registry ONCE and share it everywhere
    const globalNameRegistry = new Set<string>();
    const globalComponentNameMap = new Map<string, { name: string; type: ComponentType }>();
    
    // Pre-register all component names to ensure consistency
    registerAllComponentNames(projectData, globalNameRegistry, globalComponentNameMap);
    
    s.start('Generating TypeScript files...');
    
    // Use the diff structure we already calculated
    const simpleDiff = diff;
    
    await generateFiles(projectData, simpleDiff, paths, targetEnv, codeStyle, options.debug || false, options.verbose || false, globalComponentNameMap, hasRealDifferences, existingLocations);
    
    // Generate the main index.ts file using the SAME componentNameMap for consistency
    const indexContent = generateIndexFile(projectData, globalComponentNameMap, codeStyle);
    const indexPath = join(paths.projectRoot, 'index.ts');
    writeFileSync(indexPath, indexContent, 'utf-8');
    
    if (options.debug) {
      console.log(chalk.gray(`  📄 Generated index.ts with project export`));
    }
    
    s.stop('Files generated successfully');
    
    // Success message
    console.log(chalk.green(`\n✅ Project generated successfully!`));
    console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
    console.log(chalk.gray(`   🌍 Environment: ${targetEnv}`));
    
    if (diff.hasChanges) {
      const totalChanges = diff.agents.added.length + diff.agents.modified.length +
                          diff.tools.added.length + diff.tools.modified.length +
                          diff.dataComponents.added.length + diff.dataComponents.modified.length +
                          diff.artifactComponents.added.length + diff.artifactComponents.modified.length;
      console.log(chalk.gray(`   📝 Files updated: ${totalChanges + 1} (including index.ts)`));
    }

    // Ensure clean exit
    process.exit(0);
    
  } catch (error) {
    s.stop('Failed');
    console.error(chalk.red(`\nUnexpected error: ${error instanceof Error ? error.message : String(error)}`));
    if (options.debug) {
      console.error(chalk.red(error instanceof Error ? error.stack || '' : ''));
    }
    process.exit(1);
  }
}