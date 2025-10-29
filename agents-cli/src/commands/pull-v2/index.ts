/**
 * Pull v2 - Deterministic project code generation
 *
 * This command pulls project data from the API and deterministically generates TypeScript files
 * without relying on LLMs, making it faster and more consistent than the original pull command.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { ManagementApiClient } from '../../api';
import type { NestedInkeepConfig } from '../../config';
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { loadConfig } from '../../utils/config';
import { compareProjectDefinitions } from '../../utils/json-comparison';
import { generateAgentFile } from './agent-generator';
import { generateArtifactComponentFile } from './artifact-component-generator';
import {
  type ComponentLocation,
  discoverComponentLocations,
  findComponent,
  getComponentFilePattern,
} from './component-discovery';
import { generateDataComponentFile } from './data-component-generator';
import { generateEnvironmentFiles } from './environment-generator';
import {
  type CodeStyle,
  type ComponentType,
  DEFAULT_CODE_STYLE,
  ensureUniqueName,
  toVariableName,
} from './generator-utils';
import { batchIntegrateComponents, generateComponentParts } from './hybrid-generator';
import { generateIndexFile } from './index-generator';
import { generateAllFilesDeterministically } from './introspect-generator';
import { batchUpdateModifiedComponents, updateModifiedComponentWithLLM } from './llm-updater';
import { generateStatusComponentFile } from './status-component-generator';
import {
  cleanupTempDir,
  copyValidatedFiles,
  generateAndValidateInTemp,
} from './temp-validation-generator';
import { tokenTracker } from './token-tracker';
import { generateToolFile } from './tool-generator';
import { generateWithTwoPassApproach } from './two-pass-generator';

export interface PullV2Options {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  force?: boolean;
  introspect?: boolean;
}

interface ComponentDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface ComponentFieldChange {
  componentId: string;
  componentType: string;
  changedFields: string[]; // e.g., ["prompt", "subAgents.updater-agent.prompt"]
  changeType: 'added' | 'modified';
  data?: any; // The actual component data
}

interface DetailedDiff {
  hasChanges: boolean;
  projectConfig: boolean; // name, description, models, stopWhen changed
  indexFile: boolean; // index.ts needs regeneration
  tools: ComponentDiff;
  agents: ComponentDiff;
  dataComponents: ComponentDiff;
  artifactComponents: ComponentDiff;
  statusComponents: ComponentDiff;
  environments: ComponentDiff;
  contextConfig: ComponentDiff;
  functionTools: ComponentDiff;
  credentials: ComponentDiff;
  fetchDefinitions: ComponentDiff;
  headers: ComponentDiff;
}

type ProjectDiff = DetailedDiff;

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
    functionTools: { added: [], modified: [], deleted: [] },
    credentials: { added: [], modified: [], deleted: [] },
    fetchDefinitions: { added: [], modified: [], deleted: [] },
    headers: { added: [], modified: [], deleted: [] },
  };

  // Helper function to categorize a component as added or modified
  const categorizeComponent = (
    componentType: string,
    componentId: string,
    diffCategory: ComponentDiff
  ) => {
    if (componentType === 'agent') {
      console.log(chalk.gray(`\n🔍 DEBUG categorizeComponent: type=${componentType}, id="${componentId}"`));
    }
    
    const locationKey = `${componentType}:${componentId}`;
    const existsInProject = existingLocations.has(locationKey);

    if (existsInProject) {
      // Component exists in file system - it's modified
      if (!diffCategory.modified.includes(componentId)) {
        diffCategory.modified.push(componentId);
        if (componentType === 'agent') {
          console.log(chalk.gray(`   → Added to MODIFIED (exists in filesystem)`));
        }
      }
    } else {
      // Component doesn't exist in file system - it's added
      if (!diffCategory.added.includes(componentId)) {
        diffCategory.added.push(componentId);
        if (componentType === 'agent') {
          console.log(chalk.gray(`   → Added to ADDED (NOT in filesystem)`));
        }
      }
    }
  };

  // Process validation differences and determine which components changed
  for (const difference of differences) {
    if (difference.includes('agents.')) {
      // Handle agent-level differences including nested contextConfig, fetchDefinitions, and headers
      // Extract agent ID but stop at colon (which indicates start of missing/extra keys list)
      const agentMatch = difference.match(/agents\.([^.:]+)/);
      if (agentMatch) {
        const agentId = agentMatch[1];

        // Check if this is a contextConfig, fetchDefinitions, headers, functionTools, or functions change within an agent
        // These should be treated as agent modifications, not separate components
        if (
          difference.includes('.contextConfig') ||
          difference.includes('.fetchDefinitions') ||
          difference.includes('.headers') ||
          difference.includes('.functionTools') ||
          difference.includes('.functions')
        ) {
          // These are sub-components of agents - categorize as agent modifications
          categorizeComponent('agent', agentId, diff.agents);
          
          // Extract function tools from agent differences and add them as separate components
          // Include inline functionTools so they can be updated via targeted replacement
          // Check for both '.functionTools' and '.functions' paths
          if (difference.includes('.functionTools') || difference.includes('functionTools') || difference.includes('.functions')) {
            const agentData = project.agents?.[agentId];
            
            // Try to extract specific function ID from the difference string
            // Pattern: agents.{agentId}.functions.{functionId}.{field}
            const functionsMatch = difference.match(/\.functions\.([^.]+)/);
            if (functionsMatch && functionsMatch[1]) {
              const functionId = functionsMatch[1];
              // Add this specific function to the diff
              categorizeComponent('tool', functionId, diff.functionTools);
            }
            
            // Also iterate through all functionTools in case there are other changes
            if (agentData?.functionTools) {
              for (const functionToolId of Object.keys(agentData.functionTools)) {
                // Add all functionTools (both inline and separate) to the diff
                // Use 'tool' as componentType to match how component-mapper stores them
                categorizeComponent('tool', functionToolId, diff.functionTools);
              }
            }
          }
        } else {
          // Regular agent modification
          categorizeComponent('agent', agentId, diff.agents);
          
          // Check if this agent modification involves function tools (catch-all for other patterns)
          if (difference.includes('functionTools')) {
            const agentData = project.agents?.[agentId];
            if (agentData?.functionTools) {
              for (const functionToolId of Object.keys(agentData.functionTools)) {
                // Check if this functionTool exists inline in the agent file
                const existingLocation = existingLocations.get(functionToolId);
                const isInline = existingLocation?.isInline;
                
                // Only add as separate component if NOT inline
                if (!isInline) {
                  categorizeComponent('functionTool', functionToolId, diff.functionTools);
                }
              }
            }
          }
        }
      }
    } else if (difference.includes('tools.')) {
      const match = difference.match(/tools\.([^.:]+)/);
      if (match) {
        const toolId = match[1];
        categorizeComponent('tool', toolId, diff.tools);
      }
    } else if (difference.includes('functionTools.')) {
      const match = difference.match(/functionTools\.([^.:]+)/);
      if (match) {
        const functionToolId = match[1];
        categorizeComponent('functionTool', functionToolId, diff.functionTools);
      }
    } else if (difference.includes('dataComponents.')) {
      const match = difference.match(/dataComponents\.([^.:]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('dataComponent', componentId, diff.dataComponents);
      }
    } else if (difference.includes('artifactComponents.')) {
      const match = difference.match(/artifactComponents\.([^.:]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('artifactComponent', componentId, diff.artifactComponents);
      }
    } else if (difference.includes('statusComponents.')) {
      const match = difference.match(/statusComponents\.([^.:]+)/);
      if (match) {
        const componentId = match[1];
        categorizeComponent('statusComponent', componentId, diff.statusComponents);
      }
    } else if (difference.includes('environments.')) {
      const match = difference.match(/environments\.([^.:]+)/);
      if (match) {
        const envId = match[1];
        categorizeComponent('environment', envId, diff.environments);
      }
    } else if (difference.includes('credentialReferences.')) {
      const match = difference.match(/credentialReferences\.([^.:]+)/);
      if (match) {
        const credId = match[1];
        categorizeComponent('credential', credId, diff.credentials);
      }
    } else if (difference.includes('contextConfig') && !difference.includes('agents.')) {
      // Only treat standalone contextConfig as separate component (legacy support)
      // Agent contextConfig changes are handled above in the agents. section
      console.log(chalk.yellow(`⚠️ Standalone contextConfig change detected: ${difference}`));
      categorizeComponent('contextConfig', 'contextConfig', diff.contextConfig);
    } else if (difference.includes('fetchDefinitions') && !difference.includes('agents.')) {
      // Only treat standalone fetchDefinitions as separate component (legacy support)
      // Agent fetchDefinitions changes are handled above in the agents. section
      const match = difference.match(/fetchDefinitions\.([^.]+)/);
      if (match) {
        const fetchId = match[1];
        console.log(chalk.yellow(`⚠️ Standalone fetchDefinitions change detected: ${difference}`));
        categorizeComponent('fetchDefinition', fetchId, diff.fetchDefinitions);
      }
    } else if (difference.includes('headers') && !difference.includes('agents.')) {
      // Only treat standalone headers as separate component (legacy support)
      // Agent headers changes are handled above in the agents. section
      const match = difference.match(/headers\.([^.]+)/);
      if (match) {
        const headerId = match[1];
        console.log(chalk.yellow(`⚠️ Standalone headers change detected: ${difference}`));
        categorizeComponent('header', headerId, diff.headers);
      }
    } else if (
      difference.startsWith('Missing ') &&
      difference.includes(' component in generated: ')
    ) {
      // Handle validation messages like "Missing artifact component in generated: citation"
      const match = difference.match(/Missing (\w+) component in generated: (.+)/);
      if (match) {
        const componentType = match[1]; // 'artifact', 'tool', 'agent', etc.
        const componentId = match[2].trim(); // 'citation'

        // Map validation component type names to our diff categories
        if (componentType === 'artifact') {
          categorizeComponent('artifactComponent', componentId, diff.artifactComponents);
        } else if (componentType === 'tool') {
          categorizeComponent('tool', componentId, diff.tools);
        } else if (componentType === 'agent') {
          categorizeComponent('agent', componentId, diff.agents);
        } else if (componentType === 'data') {
          categorizeComponent('dataComponent', componentId, diff.dataComponents);
        } else if (componentType === 'status') {
          categorizeComponent('statusComponent', componentId, diff.statusComponents);
        }
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

        if (
          !existsInProject &&
          !diffCategory.added.includes(componentId) &&
          !diffCategory.modified.includes(componentId)
        ) {
          // This is a completely new component not mentioned in validation differences
          diffCategory.added.push(componentId);
        }
      }
    };

    // Check all component types for completely new components
    checkForNewComponents(project.agents, 'agent', diff.agents);
    checkForNewComponents(project.tools, 'tool', diff.tools);
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
async function readExistingProject(projectRoot: string, debug: boolean = false): Promise<FullProjectDefinition | null> {
    const indexPath = join(projectRoot, 'index.ts');

    if (!existsSync(indexPath)) {
      return null;
    }

    try {
      // Import the project-loader utility (same as push command)
      const { loadProject } = await import('../../utils/project-loader');

      // Load the project from index.ts (same as push command)
      const project = await loadProject(projectRoot);

      // Convert to FullProjectDefinition (same as push command) with timeout to prevent hanging
      const projectDefinition = await Promise.race([
        project.getFullDefinition(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                'getFullDefinition() timed out after 30 seconds - likely circular reference or infinite loop in local project'
              )
            );
          }, 30000);
        }),
      ]);

      return projectDefinition;
    } catch (error) {
      // If there's any error parsing the existing project, treat as if it doesn't exist
      // This ensures pull-v2 can still work even if local files are malformed
      
      // Check if this is a credential error (expected for projects with credentials before .env is filled)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCredentialError = errorMessage.includes('Credential') && errorMessage.includes('not found');
      
      if (debug) {
        if (isCredentialError) {
          console.log(chalk.yellow('   ⚠ Cannot load existing project - credentials not configured:'));
          console.log(chalk.gray(`   ${errorMessage}`));
          console.log(chalk.gray('   💡 This is expected if you haven\'t added credentials to environment files yet'));
          console.log(chalk.gray('   💡 Treating as new project for comparison purposes'));
        } else {
          console.log(chalk.red('   ✗ Error parsing existing project:'));
          console.log(chalk.red(`   ${errorMessage}`));
          if (error instanceof Error && error.stack) {
            console.log(chalk.gray('   Stack trace:'));
            console.log(chalk.gray(`   ${error.stack.split('\n').slice(0, 5).join('\n   ')}`));
          }
        }
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
        componentNameMap.set(`dataComponent:${componentId}`, {
          name: uniqueName,
          type: 'dataComponent',
        });
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
        componentNameMap.set(`artifactComponent:${componentId}`, {
          name: uniqueName,
          type: 'artifactComponent',
        });
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
              componentNameMap.set(`statusComponent:${statusCompId}`, {
                name: uniqueName,
                type: 'statusComponent',
              });
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
    const {
      projectRoot,
      agentsDir,
      toolsDir,
      dataComponentsDir,
      artifactComponentsDir,
      statusComponentsDir,
      environmentsDir,
    } = paths;

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
      console.log(
        chalk.gray(
          `  File pattern: ${filePattern.hasMixedPattern ? 'Mixed' : filePattern.hasMainIndex ? 'Main index' : filePattern.hasSeparateDirectories ? 'Separate files' : 'Empty project'}`
        )
      );
    }

    // Group file updates by target file to batch them efficiently
    const fileUpdates = new Map<
      string,
      {
        filePath: string;
        modifications: Array<{
          componentType: ComponentLocation['componentType'];
          componentId: string;
          remoteData: any;
          isNew: boolean;
          changes: string[];
        }>;
      }
    >();

    // Process all component changes using hybrid generation
    await processComponentChanges(
      'tool',
      project.tools,
      diff.tools,
      existingLocations,
      fileUpdates,
      paths,
      style,
      debug,
      project,
      componentNameMap
    );
    await processComponentChanges(
      'dataComponent',
      project.dataComponents,
      diff.dataComponents,
      existingLocations,
      fileUpdates,
      paths,
      style,
      debug,
      project,
      componentNameMap
    );
    await processComponentChanges(
      'artifactComponent',
      project.artifactComponents,
      diff.artifactComponents,
      existingLocations,
      fileUpdates,
      paths,
      style,
      debug,
      project,
      componentNameMap
    );
    await processComponentChanges(
      'agent',
      project.agents,
      diff.agents,
      existingLocations,
      fileUpdates,
      paths,
      style,
      debug,
      project,
      componentNameMap
    );

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
        deleted: [],
      };
      await processComponentChanges(
        'statusComponent',
        Object.fromEntries(statusComponentsToProcess),
        statusDiff,
        existingLocations,
        fileUpdates,
        paths,
        style,
        debug,
        project,
        componentNameMap
      );
    }

    // Apply all file updates using hybrid generation
    if (fileUpdates.size > 0) {
      if (debug) {
        console.log(
          chalk.gray(`  📝 Processing ${fileUpdates.size} files with hybrid generation...`)
        );
      }

      const fileIntegrations = Array.from(fileUpdates.values()).map((update) => {
        const existingContent = existsSync(update.filePath)
          ? readFileSync(update.filePath, 'utf-8')
          : '';

        // Only use placeholders if we have real differences that require LLM
        const usePlaceholders = hasRealDifferences;

        const componentsToAdd = update.modifications
          .filter((m) => m.isNew)
          .map((m) =>
            generateComponentParts(
              m.componentType,
              m.componentId,
              m.remoteData,
              style,
              project,
              componentNameMap,
              usePlaceholders
            )
          );
        const componentsToModify = update.modifications
          .filter((m) => !m.isNew)
          .map((m) =>
            generateComponentParts(
              m.componentType,
              m.componentId,
              m.remoteData,
              style,
              project,
              componentNameMap,
              usePlaceholders
            )
          );

        if (debug) {
          const isNewFile = !existingContent;
          const hasModifications = componentsToModify.length > 0;
          const method = isNewFile
            ? '⚡ Deterministic generation'
            : hasModifications
              ? '🤖 LLM integration'
              : '⚡ Deterministic generation';
          console.log(chalk.gray(`    ${method}: ${update.filePath}`));
        }

        return {
          filePath: update.filePath,
          existingContent,
          componentsToAdd,
          componentsToModify,
          verbose: verbose,
        };
      });

      const integrationResult = await batchIntegrateComponents(fileIntegrations, debug);

      if (debug) {
        const llmUsed = fileIntegrations.some(
          (fi) =>
            fi.existingContent &&
            (fi.componentsToModify.length > 0 || fi.componentsToAdd.length > 0)
        );
        const deterministicCount = fileIntegrations.filter(
          (fi) =>
            !fi.existingContent &&
            fi.componentsToAdd.length > 0 &&
            fi.componentsToModify.length === 0
        ).length;

        console.log(
          chalk.gray(
            `  ✅ Integration complete: ${integrationResult.successful} successful, ${integrationResult.failed} failed`
          )
        );

        if (deterministicCount > 0) {
          console.log(
            chalk.gray(`  ⚡ ${deterministicCount} files generated deterministically (new files)`)
          );
        }
        if (llmUsed) {
          console.log(
            chalk.gray(
              `  🤖 LLM was used for ${fileIntegrations.length - deterministicCount} file integrations`
            )
          );
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
    fileUpdates: Map<
      string,
      {
        filePath: string;
        modifications: Array<{
          componentType: ComponentLocation['componentType'];
          componentId: string;
          remoteData: any;
          isNew: boolean;
          changes: string[];
        }>;
      }
    >,
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
        case 'tool':
          return paths.toolsDir;
        case 'dataComponent':
          return paths.dataComponentsDir;
        case 'artifactComponent':
          return paths.artifactComponentsDir;
        case 'statusComponent':
          return paths.statusComponentsDir;
        case 'agent':
          return paths.agentsDir;
        default:
          return paths.projectRoot;
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
          modifications: [],
        });
      }

      fileUpdates.get(targetFilePath)!.modifications.push({
        componentType,
        componentId,
        remoteData: componentData,
        isNew,
        changes: [], // We could add specific change details here if needed
      });

      if (debug) {
        console.log(
          chalk.gray(
            `    ${isNew ? 'Adding' : 'Modifying'} ${componentType} ${componentId} in ${targetFilePath}`
          )
        );
      }
    }
}

/**
 * Main pull-v2 command
 */
export async function pullV2Command(options: PullV2Options): Promise<void> {
  // Suppress SDK logging during pull operations for cleaner output (do this FIRST)
  const originalLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'silent';
  
  // Restore original log level on exit
  const restoreLogLevel = () => {
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  };
  
  
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  console.log(chalk.blue('\n🚀 Pull v2 - Deterministic project generation'));
  if (options.introspect) {
    console.log(chalk.gray('  Introspect mode • Complete regeneration • No diffing'));
  } else {
    console.log(chalk.gray('  Smart diffing • Targeted updates • Fast & consistent'));
  }

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
          restoreLogLevel();
          process.exit(1);
        }
      } else {
        s.stop(`Specified configuration file not found: ${configPath}`);
        restoreLogLevel();
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
      restoreLogLevel();
      process.exit(1);
    }

    s.message('Configuration loaded successfully');
    if (options.debug) {
      console.log(chalk.gray(`\n📄 Config loaded from: ${configLocation}`));
      console.log(chalk.gray(`   Tenant ID: ${config.tenantId}`));
      console.log(chalk.gray(`   Manage API: ${config.agentsManageApi.url}`));
    }

    // Determine project ID
    const projectId = options.project;
    if (!projectId) {
      s.stop('Project ID required');
      console.error(chalk.red('\n❌ Error: Project ID is required'));
      console.error(chalk.yellow('   Use: --project <project-id> or specify in current directory'));
      restoreLogLevel();
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
      
      // Hoist agent-level functionTools and functions to project level
      // functionTools/functions can exist at either project level OR agent level
      // We normalize by hoisting agent-level ones to project level for consistent processing
      if (projectData.agents) {
        for (const [agentId, agentData] of Object.entries(projectData.agents) as any[]) {
          if (agentData.functionTools) {
            projectData.functionTools = projectData.functionTools || {};
            Object.assign(projectData.functionTools, agentData.functionTools);
            if (options.debug) {
              console.log(chalk.gray(`   Hoisted functionTools from agent ${agentId}: ${Object.keys(agentData.functionTools).join(', ')}`));
            }
          }
          if (agentData.functions) {
            projectData.functions = projectData.functions || {};
            Object.assign(projectData.functions, agentData.functions);
            if (options.debug) {
              console.log(chalk.gray(`   Hoisted functions from agent ${agentId}: ${Object.keys(agentData.functions).join(', ')}`));
            }
          }
        }
      }
      
      s.message(`Project data fetched: ${projectData.name}`);
      if (options.debug) {
        console.log(chalk.gray(`\n📊 Project: ${projectData.name} (${projectData.id})`));
        console.log(chalk.gray(`   Agents: ${Object.keys(projectData.agents || {}).length}`));
        console.log(chalk.gray(`   Tools: ${Object.keys(projectData.tools || {}).length}`));
        console.log(chalk.gray(`   Functions: ${Object.keys(projectData.functions || {}).length}`));
        console.log(chalk.gray(`   FunctionTools: ${Object.keys(projectData.functionTools || {}).length}`));
        console.log(chalk.gray(`   Data Components: ${Object.keys(projectData.dataComponents || {}).length}`));
        console.log(chalk.gray(`   Artifact Components: ${Object.keys(projectData.artifactComponents || {}).length}`));
        if (projectData.functionTools) {
          console.log(chalk.yellow(`   functionTools: ${Object.keys(projectData.functionTools).join(', ')}`));
        }
        if (projectData.functions) {
          console.log(chalk.yellow(`   functions: ${Object.keys(projectData.functions).join(', ')}`));
        }
      }
    } catch (error) {
      s.stop(`Failed to fetch project: ${projectId}`);
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      restoreLogLevel();
      process.exit(1);
    }

    // Stop the fetching spinner
    s.stop('Project data fetched');
    
    // JSON output mode
    if (options.json) {
      console.log(JSON.stringify(projectData, null, 2));
      restoreLogLevel();
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
    s.stop('Project structure ready');
    
    // Read existing project if it exists (skip if introspect mode)
    if (options.debug) {
      console.log(chalk.gray('\n📂 Reading existing project from disk...'));
    }
    const existingProject = options.introspect ? null : await readExistingProject(paths.projectRoot, options.debug);
    
    if (options.debug) {
      if (existingProject) {
        console.log(chalk.green('   ✓ Existing project loaded successfully'));
      } else {
        console.log(chalk.yellow('   ⚠ No existing project found (new project or parse failed)'));
      }
    }
    
    // Introspect mode: Skip all diffing and always regenerate everything
    if (options.introspect) {
      console.log(chalk.yellow('🔍 Introspect mode: Regenerating all files from scratch (no LLM calls)'));
      
      // Clear token tracker since we won't be making any LLM calls
      tokenTracker.clear();
      
      // Get environment and style settings
      const targetEnv = options.env || 'development';
      const codeStyle = DEFAULT_CODE_STYLE;
      
      // Skip to full regeneration
      s.start('Generating all files deterministically...');
      const allFilesToGenerate = await generateAllFilesDeterministically(projectData, paths, codeStyle, options.debug);
      s.stop('All files generated');
      
      s.start('Validating generated project...');
      const tempValidationResult = await generateAndValidateInTemp(
        paths.projectRoot,
        projectData,
        allFilesToGenerate,
        codeStyle,
        undefined, // componentNameMap - let temp validation detect from files
        true // skipCopyingExistingFiles - for introspect mode, don't copy old files
      );
      s.stop('Validation complete');
      
      if (!tempValidationResult.success) {
        throw new Error(`Generated project validation failed: ${tempValidationResult.validationError}`);
      }
      
      await copyValidatedFiles(tempValidationResult.tempDir, paths.projectRoot, tempValidationResult.generatedFiles);
      cleanupTempDir(tempValidationResult.tempDir);
      
      console.log(chalk.green(`\n✅ Project regenerated successfully with introspect mode!`));
      console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
      console.log(chalk.gray(`   🌍 Environment: ${targetEnv}`));
      console.log(chalk.gray(`   🚀 Mode: Complete regeneration (no diffing)`));
      
      // Show token usage (should be zero for introspect mode)
      tokenTracker.logSummary();
      
      restoreLogLevel();
      process.exit(0);
    }
    
    // Discover existing component locations early (needed for diff creation)
    if (options.debug) {
      console.log(chalk.gray('\n🔍 Discovering component locations in project...'));
    }
    const existingLocations = await discoverComponentLocations(paths.projectRoot);
    if (options.debug) {
      console.log(chalk.gray(`   Found ${existingLocations.size} components in filesystem`));
    }
    
    // First, do a validated comparison to check if there are REAL differences
    let hasRealDifferences = true;
    let validationResult: any = null;
    
    if (existingProject) {
      if (options.debug) {
        console.log(chalk.blue('\n🔍 Starting project comparison...'));
        console.log(chalk.gray('   Comparing API project definition with local SDK project'));
        console.log(chalk.gray(`   API project has:`));
        console.log(chalk.gray(`     - Agents: ${Object.keys(projectData.agents || {}).length}`));
        console.log(chalk.gray(`     - Tools: ${Object.keys(projectData.tools || {}).length}`));
        console.log(chalk.gray(`     - Functions: ${Object.keys(projectData.functions || {}).length}`));
        console.log(chalk.gray(`     - FunctionTools: ${Object.keys(projectData.functionTools || {}).length}`));
        console.log(chalk.gray(`     - Data Components: ${Object.keys(projectData.dataComponents || {}).length}`));
        console.log(chalk.gray(`     - Artifact Components: ${Object.keys(projectData.artifactComponents || {}).length}`));
        console.log(chalk.gray(`   Local SDK project has:`));
        console.log(chalk.gray(`     - Agents: ${Object.keys(existingProject.agents || {}).length}`));
        console.log(chalk.gray(`     - Tools: ${Object.keys(existingProject.tools || {}).length}`));
        console.log(chalk.gray(`     - Functions: ${Object.keys(existingProject.functions || {}).length}`));
        console.log(chalk.gray(`     - FunctionTools: ${Object.keys(existingProject.functionTools || {}).length}`));
        console.log(chalk.gray(`     - Data Components: ${Object.keys(existingProject.dataComponents || {}).length}`));
        console.log(chalk.gray(`     - Artifact Components: ${Object.keys(existingProject.artifactComponents || {}).length}`));
      }
      
      try {
        validationResult = compareProjectDefinitions(projectData, existingProject);
        hasRealDifferences = !validationResult.matches;
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
    let diff: DetailedDiff;
    
    if (!existingProject) {
      // Check if this is a parsing failure due to placeholders vs truly new project
      const indexExists = existsSync(join(paths.projectRoot, 'index.ts'));
      
      if (indexExists) {
        
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
          functionTools: { added: [], modified: [], deleted: [] },
          credentials: { added: [], modified: [], deleted: [] },
          fetchDefinitions: { added: [], modified: [], deleted: [] },
          headers: { added: [], modified: [], deleted: [] },
        } satisfies DetailedDiff;
        validation = { matches: true, differences: [], warnings: [] };
      } else {
        // For truly new projects, mark everything as "added"
        
        // Extract all status component IDs from agents
        const statusComponentIds = new Set<string>();
        if (projectData.agents) {
          for (const agentData of Object.values(projectData.agents)) {
            if ((agentData as any).statusUpdates?.statusComponents) {
              for (const statusComp of (agentData as any).statusUpdates.statusComponents) {
                const statusCompId = statusComp.type || statusComp.id;
                if (statusCompId) {
                  statusComponentIds.add(statusCompId);
                }
              }
            }
          }
        }
        
        diff = {
          hasChanges: true,
          projectConfig: true,
          indexFile: true,
          tools: { added: Object.keys(projectData.tools || {}), modified: [], deleted: [] },
          agents: { added: Object.keys(projectData.agents || {}), modified: [], deleted: [] },
          dataComponents: { added: Object.keys(projectData.dataComponents || {}), modified: [], deleted: [] },
          artifactComponents: { added: Object.keys(projectData.artifactComponents || {}), modified: [], deleted: [] },
          statusComponents: { added: Array.from(statusComponentIds), modified: [], deleted: [] },
          environments: { added: [], modified: [], deleted: [] },
          contextConfig: { added: [], modified: [], deleted: [] },
          functionTools: { added: Object.keys(projectData.functionTools || {}), modified: [], deleted: [] },
          credentials: { added: Object.keys(projectData.credentialReferences || {}), modified: [], deleted: [] },
          fetchDefinitions: { added: [], modified: [], deleted: [] },
          headers: { added: [], modified: [], deleted: [] },
        } satisfies DetailedDiff;
        validation = { matches: false, differences: [], warnings: [] };
      }
    } else {
      // For existing projects, create diff from validation differences
      validation = validationResult;
      diff = createDetailedDiffFromValidation(validation.differences, existingLocations, projectData);
    }
    
    // Check if project-level config or index.ts needs updating
    diff.projectConfig = validation.differences.some((d: string) => 
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
      restoreLogLevel();
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
        restoreLogLevel();
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
    
    s.start('Preparing file generation...');
    
    // Convert the diff structure to added/modified components format for two-pass generation
    console.log(chalk.gray('\n🔍 DEBUG: About to convert diff to components'));
    console.log(chalk.gray(`  diff object exists: ${!!diff}`));
    if (diff) {
      console.log(chalk.gray(`  diff.hasChanges: ${diff.hasChanges}`));
      console.log(chalk.gray(`  diff.tools exists: ${!!diff.tools}`));
      console.log(chalk.gray(`  diff.tools.added: ${diff.tools?.added ? `[${diff.tools.added.join(', ')}]` : 'undefined'}`));
      console.log(chalk.gray(`  diff.agents exists: ${!!diff.agents}`));
      console.log(chalk.gray(`  diff.agents.added: ${diff.agents?.added ? `[${diff.agents.added.join(', ')}]` : 'undefined'}`));
    }
    
    const addedComponents = convertDiffToAddedComponents(diff, projectData);
    console.log(chalk.gray(`  ✓ addedComponents created: ${Object.keys(addedComponents).join(', ')}`));
    
    const modifiedComponents = convertDiffToModifiedComponents(diff, projectData, existingLocations);
    console.log(chalk.gray(`  ✓ modifiedComponents created: ${Object.keys(modifiedComponents).join(', ')}`));
    
    s.stop('Ready to generate');
    
    if (options.debug) {
      console.log(chalk.gray(`  📋 Added components: ${Object.values(addedComponents).flat().length}`));
      console.log(chalk.gray(`  🔄 Modified components: ${Object.values(modifiedComponents).flat().length}`));
    }
    
    // Retry logic for generation and validation (up to 3 attempts)
    const maxRetries = 3;
    let lastTempResult: any = null;
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(chalk.yellow(`\n🔄 Retrying generation and validation (attempt ${attempt}/${maxRetries})`));
          if (options.debug) {
            console.log(chalk.gray(`   Previous error: ${lastError}`));
          }
        }
        
        // Use two-pass generation with temp validation (spinner stopped, will use console.log)
        const twoPassResult = await generateWithTwoPassApproach(
          paths.projectRoot,
          projectData,
          addedComponents,
          modifiedComponents,
          codeStyle
        );
        
        // Combine all files for temp validation
        const allFiles = new Map<string, string>();
        for (const [path, content] of twoPassResult.newFiles) {
          allFiles.set(path, content);
        }
        for (const [path, content] of twoPassResult.modifiedFiles) {
          allFiles.set(path, content);
        }
        
        if (options.debug) {
          console.log(chalk.gray(`   newFiles: ${[...twoPassResult.newFiles.keys()].join(', ')}`));
          console.log(chalk.gray(`   modifiedFiles: ${[...twoPassResult.modifiedFiles.keys()].join(', ')}`));
          console.log(chalk.gray(`   allFiles for validation: ${[...allFiles.keys()].join(', ')}`));
        }
        
        // Generate index.ts using temp-based approach
        console.log(chalk.cyan(`\n📝 Validating generated files (attempt ${attempt}/${maxRetries})...`));
        const tempResult = await generateAndValidateInTemp(
          paths.projectRoot,
          projectData,
          allFiles,
          codeStyle,
          twoPassResult.componentNameMap
        );
        
        if (tempResult.success) {
          // Success! Break out of retry loop
          lastTempResult = tempResult;
          console.log(chalk.green(`✅ Validation passed${attempt > 1 ? ` on attempt ${attempt}/${maxRetries}` : ''}`));
          break;
        } else {
          // Validation failed - prepare for retry or final failure
          lastTempResult = tempResult;
          lastError = tempResult.validationError || 'Unknown validation error';
          
          // Clean up temp directory from failed attempt
          cleanupTempDir(tempResult.tempDir);
          
          if (attempt === maxRetries) {
            // Final attempt failed
            s.stop();
            console.error(chalk.red(`\n❌ Generated files failed validation after ${maxRetries} attempts:`));
            console.error(chalk.red(`   Final error: ${lastError}`));
            
            if (tempResult.validationDetails && options.debug) {
              console.error(chalk.gray('\nValidation details from final attempt:'));
              console.error(chalk.gray(JSON.stringify(tempResult.validationDetails, null, 2)));
            }
            
            return;
          } else {
            // Not final attempt - log error and continue
            console.log(chalk.yellow(`⚠️  Attempt ${attempt} failed: ${lastError}`));
            if (options.debug && tempResult.validationDetails) {
              console.log(chalk.gray('   Validation details:'));
              console.log(chalk.gray(JSON.stringify(tempResult.validationDetails, null, 2)));
            }
            
            // Small delay before retry to avoid rapid successive attempts
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error: any) {
        lastError = error.message || 'Unknown generation error';
        
        if (attempt === maxRetries) {
          s.stop();
          console.error(chalk.red(`\n❌ Generation failed after ${maxRetries} attempts:`));
          console.error(chalk.red(`   Final error: ${lastError}`));
          return;
        } else {
          console.log(chalk.yellow(`⚠️  Attempt ${attempt} failed with error: ${lastError}`));
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // At this point, we either succeeded or failed after all retries
    if (!lastTempResult || !lastTempResult.success) {
      // Should not reach here due to return statements above, but safety check
      console.error(chalk.red('\n❌ Unexpected error: No successful result after retries'));
      return;
    }
    
    console.log(chalk.cyan('\n💾 Copying validated files to project...'));
    
    // Copy all validated files to the actual project directory
    await copyValidatedFiles(lastTempResult.tempDir, paths.projectRoot, lastTempResult.generatedFiles);
    
    // Clean up temp directory
    cleanupTempDir(lastTempResult.tempDir);
    
    console.log(chalk.green(`✅ Successfully generated ${lastTempResult.generatedFiles.length} file(s)`));
    
    // Success message
    console.log(chalk.green(`\n✅ Project generated successfully!`));
    console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
    console.log(chalk.gray(`   🌍 Environment: ${targetEnv}`));
    
    console.log(chalk.gray('\n🔍 DEBUG: Calculating total changes'));
    console.log(chalk.gray(`  diff.hasChanges: ${diff?.hasChanges}`));
    
    if (diff && diff.hasChanges) {
      console.log(chalk.gray(`  diff.agents: ${!!diff.agents}`));
      console.log(chalk.gray(`  diff.tools: ${!!diff.tools}`));
      console.log(chalk.gray(`  diff.dataComponents: ${!!diff.dataComponents}`));
      console.log(chalk.gray(`  diff.artifactComponents: ${!!diff.artifactComponents}`));
      
      const agentsAdded = diff.agents?.added?.length || 0;
      const agentsModified = diff.agents?.modified?.length || 0;
      const toolsAdded = diff.tools?.added?.length || 0;
      const toolsModified = diff.tools?.modified?.length || 0;
      const dataAdded = diff.dataComponents?.added?.length || 0;
      const dataModified = diff.dataComponents?.modified?.length || 0;
      const artifactsAdded = diff.artifactComponents?.added?.length || 0;
      const artifactsModified = diff.artifactComponents?.modified?.length || 0;
      
      const totalChanges = agentsAdded + agentsModified + toolsAdded + toolsModified +
                          dataAdded + dataModified + artifactsAdded + artifactsModified;
      console.log(chalk.gray(`   📝 Files updated: ${totalChanges + 1} (including index.ts)`));
    }

    // Show LLM token usage and cost summary
    tokenTracker.logSummary();

    // Ensure clean exit
    restoreLogLevel();
    process.exit(0);
    
  } catch (error) {
    s.stop('Failed');
    console.error(chalk.red(`\nUnexpected error: ${error instanceof Error ? error.message : String(error)}`));
    if (options.debug) {
      console.error(chalk.red(error instanceof Error ? error.stack || '' : ''));
    }
    restoreLogLevel();
    process.exit(1);
  }
}

/**
 * Convert diff structure to added components format for two-pass generation
 */
function convertDiffToAddedComponents(
    diff: ProjectDiff,
    projectData: FullProjectDefinition
  ): { [componentType: string]: any[] } {
    console.log(chalk.gray('🔍 convertDiffToAddedComponents called'));
    console.log(chalk.gray(`  diff type: ${typeof diff}`));
    console.log(chalk.gray(`  diff.tools type: ${typeof diff?.tools}`));
    
    if (!diff) {
      console.error(chalk.red('❌ ERROR: diff is undefined in convertDiffToAddedComponents'));
      throw new Error('diff parameter is undefined');
    }
    
    const addedComponents: { [componentType: string]: any[] } = {};

    // Add tools
    console.log(chalk.gray(`  Checking diff.tools.added (exists: ${!!diff.tools}, added: ${!!diff.tools?.added})`));
    if (diff.tools && diff.tools.added && diff.tools.added.length > 0) {
      addedComponents.tools = diff.tools.added.map((toolId) => ({
        componentId: toolId,
        id: toolId,
        data: projectData.tools?.[toolId] || null, // Allow null for new components that need to be created
      }));
    }

    // Add function tools
    console.log(chalk.gray(`  Checking diff.functionTools.added (exists: ${!!diff.functionTools}, added: ${!!diff.functionTools?.added})`));
    if (diff.functionTools && diff.functionTools.added && diff.functionTools.added.length > 0) {
      // Store as 'tools' to be consistent with modified components
      if (!addedComponents.tools) {
        addedComponents.tools = [];
      }
      addedComponents.tools.push(...diff.functionTools.added.map((functionToolId) => {
        // Check project-level functionTools first
        let functionToolData = projectData.functionTools?.[functionToolId];
        let functionData = projectData.functions?.[functionToolId];
        
        // If not found at project level, check agent-level functionTools
        if (!functionToolData && projectData.agents) {
          for (const agentData of Object.values(projectData.agents)) {
            if (agentData.functionTools?.[functionToolId]) {
              functionToolData = agentData.functionTools[functionToolId];
              // Look up the function implementation using functionId
              const functionId = functionToolData.functionId || functionToolId;
              functionData = agentData.functions?.[functionId] || projectData.functions?.[functionId];
              break;
            }
          }
        }
        
        return {
          componentId: functionToolId,
          id: functionToolId,
          data: {
            id: functionToolId,
            name: functionToolData?.name || functionToolId,
            description: functionToolData?.description || `Function tool: ${functionToolId}`,
            implementation: functionData?.executeCode,
            parameters: functionData?.inputSchema,
            dependencies: functionData?.dependencies,
          }
        };
      }));
    }

    // Add agents
    console.log(chalk.gray(`  Checking diff.agents.added (exists: ${!!diff.agents}, added: ${!!diff.agents?.added})`));
    if (diff.agents && diff.agents.added && diff.agents.added.length > 0) {
      console.log(chalk.gray(`\n🔍 DEBUG: diff.agents.added contains: ${JSON.stringify(diff.agents.added)}`));
      addedComponents.agents = diff.agents.added.map((agentId) => {
        console.log(chalk.gray(`   - Processing agent: "${agentId}"`));
        const agentData = projectData.agents?.[agentId];
        console.log(chalk.gray(`   - Data found: ${!!agentData}`));
        return {
          componentId: agentId,
          id: agentId,
          data: agentData || null, // Allow null for new components that need to be created
        };
      });
    }

    // Add data components
    console.log(chalk.gray(`  Checking diff.dataComponents.added (exists: ${!!diff.dataComponents}, added: ${!!diff.dataComponents?.added})`));
    if (diff.dataComponents && diff.dataComponents.added && diff.dataComponents.added.length > 0) {
      addedComponents.dataComponents = diff.dataComponents.added.map((componentId) => ({
        componentId,
        id: componentId,
        data: projectData.dataComponents?.[componentId] || null, // Allow null for new components that need to be created
      }));
    }

    // Add artifact components
    console.log(chalk.gray(`  Checking diff.artifactComponents.added (exists: ${!!diff.artifactComponents}, added: ${!!diff.artifactComponents?.added})`));
    if (diff.artifactComponents && diff.artifactComponents.added && diff.artifactComponents.added.length > 0) {
      addedComponents.artifactComponents = diff.artifactComponents.added.map((componentId) => ({
        componentId,
        id: componentId,
        data: projectData.artifactComponents?.[componentId] || null, // Allow null for new components that need to be created
      }));
    }

    // Add status components
    console.log(chalk.gray(`  Checking diff.statusComponents.added (exists: ${!!diff.statusComponents}, added: ${!!diff.statusComponents?.added})`));
    if (diff.statusComponents?.added) {
      console.log(chalk.gray(`  diff.statusComponents.added is array: ${Array.isArray(diff.statusComponents.added)}`));
      console.log(chalk.gray(`  diff.statusComponents.added.length: ${diff.statusComponents.added.length}`));
      console.log(chalk.gray(`  diff.statusComponents.added contents: ${JSON.stringify(diff.statusComponents.added)}`));
    }
    if (diff.statusComponents && diff.statusComponents.added && diff.statusComponents.added.length > 0) {
      console.log(chalk.gray(`  Found ${diff.statusComponents.added.length} status components to add: ${JSON.stringify(diff.statusComponents.added)}`));
      addedComponents.statusComponents = diff.statusComponents.added.map((componentId) => {
        const data = findStatusComponentData(componentId, projectData);
        console.log(chalk.gray(`    - Status component ${componentId}: data found = ${!!data}`));
        if (data) {
          console.log(chalk.gray(`      Data keys: ${Object.keys(data).join(', ')}`));
        }
        return {
          componentId,
          id: componentId,
          data: data || null, // Allow null for new components that need to be created
        };
      });
      console.log(chalk.gray(`  Total status components mapped: ${addedComponents.statusComponents.length}`));
    } else {
      console.log(chalk.gray(`  ❌ NOT adding status components - condition failed`));
    }

    // Add external agents (separate from regular agents)
    console.log(chalk.gray(`  Checking external agents (projectData.externalAgents: ${!!projectData.externalAgents})`));
    if (projectData.externalAgents && Object.keys(projectData.externalAgents).length > 0) {
      addedComponents.externalAgents = Object.keys(projectData.externalAgents).map((agentId) => {
        console.log(chalk.gray(`   - Processing external agent: "${agentId}"`));
        return {
          componentId: agentId,
          id: agentId,
          data: projectData.externalAgents?.[agentId],
        };
      });
      console.log(chalk.gray(`  Total external agents: ${addedComponents.externalAgents.length}`));
    }

    return addedComponents;
}

/**
 * Convert diff structure to modified components format for two-pass generation
 */
function convertDiffToModifiedComponents(
    diff: ProjectDiff,
    projectData: FullProjectDefinition,
    existingLocations: Map<string, ComponentLocation>
  ): { [componentType: string]: ComponentFieldChange[] } {
    console.log(chalk.gray('🔍 convertDiffToModifiedComponents called'));
    
    if (!diff) {
      console.error(chalk.red('❌ ERROR: diff is undefined in convertDiffToModifiedComponents'));
      throw new Error('diff parameter is undefined');
    }
    
    const modifiedComponents: { [componentType: string]: ComponentFieldChange[] } = {};

    // Add modified tools
    console.log(chalk.gray(`  Checking diff.tools.modified (exists: ${!!diff.tools}, modified: ${!!diff.tools?.modified})`));
    if (diff.tools && diff.tools.modified && diff.tools.modified.length > 0) {
      modifiedComponents.tools = diff.tools.modified
        .map((toolId) => ({
          componentId: toolId,
          componentType: 'tool',
          changedFields: [], // TODO: Calculate field-level changes
          changeType: 'modified' as const,
          data: projectData.tools?.[toolId],
        }))
        .filter((tool) => tool.data);
    }

    // Add modified agents
    console.log(chalk.gray(`  Checking diff.agents.modified (exists: ${!!diff.agents}, modified: ${!!diff.agents?.modified})`));
    if (diff.agents && diff.agents.modified && diff.agents.modified.length > 0) {
      modifiedComponents.agents = diff.agents.modified
        .map((agentId) => ({
          componentId: agentId,
          componentType: 'agent',
          changedFields: [], // TODO: Calculate field-level changes
          changeType: 'modified' as const,
          data: projectData.agents?.[agentId],
        }))
        .filter((agent) => agent.data);
    }

    // Add modified data components
    console.log(chalk.gray(`  Checking diff.dataComponents.modified (exists: ${!!diff.dataComponents}, modified: ${!!diff.dataComponents?.modified})`));
    if (diff.dataComponents && diff.dataComponents.modified && diff.dataComponents.modified.length > 0) {
      modifiedComponents.dataComponents = diff.dataComponents.modified
        .map((componentId) => ({
          componentId,
          componentType: 'dataComponent',
          changedFields: [], // TODO: Calculate field-level changes
          changeType: 'modified' as const,
          data: projectData.dataComponents?.[componentId],
        }))
        .filter((component) => component.data);
    }

    // Add modified artifact components
    console.log(chalk.gray(`  Checking diff.artifactComponents.modified (exists: ${!!diff.artifactComponents}, modified: ${!!diff.artifactComponents?.modified})`));
    if (diff.artifactComponents && diff.artifactComponents.modified && diff.artifactComponents.modified.length > 0) {
      modifiedComponents.artifactComponents = diff.artifactComponents.modified
        .map((componentId) => ({
          componentId,
          componentType: 'artifactComponent',
          changedFields: [], // TODO: Calculate field-level changes
          changeType: 'modified' as const,
          data: projectData.artifactComponents?.[componentId],
        }))
        .filter((component) => component.data);
    }

    // Add modified function tools
    console.log(chalk.gray(`  Checking diff.functionTools.modified (exists: ${!!diff.functionTools}, modified: ${!!diff.functionTools?.modified})`));
    if (diff.functionTools && diff.functionTools.modified && diff.functionTools.modified.length > 0) {
      // Store as 'tools' to match componentType and avoid confusion
      if (!modifiedComponents.tools) {
        modifiedComponents.tools = [];
      }
      modifiedComponents.tools.push(...diff.functionTools.modified
        .map((functionToolId) => {
          // Check project-level functionTools first
          let functionToolData = projectData.functionTools?.[functionToolId];
          let functionData = projectData.functions?.[functionToolId];
          
          // If not found at project level, check agent-level functionTools
          if (!functionToolData && projectData.agents) {
            for (const agentData of Object.values(projectData.agents)) {
              if (agentData.functionTools?.[functionToolId]) {
                functionToolData = agentData.functionTools[functionToolId];
                // Look up the function implementation using functionId
                const functionId = functionToolData.functionId || functionToolId;
                functionData = agentData.functions?.[functionId] || projectData.functions?.[functionId];
                break;
              }
            }
          }
          
          return {
            componentId: functionToolId,
            componentType: 'tool', // Changed from 'function' to 'tool' to match generateComponentParts expectations
            changedFields: [], // TODO: Calculate field-level changes
            changeType: 'modified' as const,
            data: functionToolData ? {
              id: functionToolId,
              name: functionToolData.name || functionToolId,
              description: functionToolData.description || `Function tool: ${functionToolId}`,
              implementation: functionData?.executeCode,
              parameters: functionData?.inputSchema,
              dependencies: functionData?.dependencies,
            } : null
          };
        })
        .filter((component) => component.data));
    }

    return modifiedComponents;
  }

/**
 * Find status component data from agents that reference it
 */
function findStatusComponentData(
    statusComponentId: string,
    projectData: FullProjectDefinition
  ): any | null {
    if (!projectData.agents) return null;

    // Status components are embedded in agents' statusUpdates.statusComponents array
    for (const [agentId, agentData] of Object.entries(projectData.agents)) {
      if ((agentData as any).statusUpdates?.statusComponents) {
        for (const statusComp of (agentData as any).statusUpdates.statusComponents) {
          // Match by type field (like 'tool_summary') which is the identifier
          const statusCompId = statusComp.type || statusComp.id;
          if (statusCompId === statusComponentId) {
            // Return the actual status component data with proper structure
            return {
              ...statusComp,
              id: statusCompId,
              type: statusComp.type || statusComponentId,
            };
          }
        }
      }
    }

    return null;
  }
