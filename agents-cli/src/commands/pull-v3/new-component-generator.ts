/**
 * New Component Generator - Create brand new files for components that don't exist
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
// Import generators from pull-v3 components
import { generateAgentFile } from './components/agent-generator';
import { generateArtifactComponentFile } from './components/artifact-component-generator';
import { generateContextConfigFile } from './components/context-config-generator';
import { generateCredentialFile } from './components/credential-generator';
import { generateDataComponentFile } from './components/data-component-generator';
import { generateEnvironmentFile } from './components/environment-generator';
import { generateExternalAgentFile } from './components/external-agent-generator';
import { generateFunctionToolFile } from './components/function-tool-generator';
import {
  generateEnvironmentAwareMcpToolFile,
  generateMcpToolFile,
} from './components/mcp-tool-generator';
import { generateStatusComponentFile } from './components/status-component-generator';
import { generateSubAgentFile } from './components/sub-agent-generator';
import type { ProjectComparison } from './project-comparator';
import type { ComponentRegistry, ComponentType } from './utils/component-registry';
import { findSubAgentWithParent } from './utils/component-registry';
import { toCamelCase } from './utils/generator-utils';

interface ProjectPaths {
  projectRoot: string;
  agentsDir: string;
  toolsDir: string;
  dataComponentsDir: string;
  artifactComponentsDir: string;
  statusComponentsDir: string;
  environmentsDir: string;
  credentialsDir: string;
  contextConfigsDir: string;
  externalAgentsDir: string;
}

interface NewComponentResult {
  componentId: string;
  componentType: string;
  filePath: string;
  variableName: string;
  success: boolean;
  error?: string;
}

/**
 * Convert component ID to kebab-case filename
 */
function toKebabCase(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[_]/g, '-');
}

// Removed generateVariableName - registry handles all naming with conflict resolution

/**
 * Determine file path for new component based on type and existing structure
 */
function determineNewFilePath(
  componentType: string,
  componentId: string,
  paths: ProjectPaths
): string {
  const fileName = `${toKebabCase(componentId)}.ts`;

  switch (componentType) {
    case 'agent':
      return join(paths.agentsDir, fileName);
    case 'tool':
      return join(paths.toolsDir, fileName);
    case 'dataComponent':
      return join(paths.dataComponentsDir, fileName);
    case 'artifactComponent':
      return join(paths.artifactComponentsDir, fileName);
    case 'statusComponent':
      return join(paths.statusComponentsDir, fileName);
    case 'environment':
      return join(paths.environmentsDir, `${toKebabCase(componentId)}.env.ts`);
    case 'subAgent':
      return join(paths.agentsDir, 'sub-agents', fileName);
    case 'externalAgent':
      return join(paths.externalAgentsDir, fileName);
    case 'functions':
    case 'functionTool': {
      // Functions might go in tools/functions/ or just tools/
      const functionsDir = join(paths.toolsDir, 'functions');
      return join(functionsDir, fileName);
    }
    case 'credential':
      return join(paths.credentialsDir, fileName);
    case 'contextConfig':
      return join(paths.contextConfigsDir, fileName);
    default:
      throw new Error(`Unknown component type for new file: ${componentType}`);
  }
}

/**
 * Generate component content using appropriate generator
 */
function generateComponentContent(
  componentType: string,
  componentId: string,
  componentData: any,
  componentRegistry: ComponentRegistry
): string {
  // Default code style for components that need it
  const defaultStyle = {
    quotes: 'single' as const,
    indentation: '  ',
    semicolons: true,
  };

  switch (componentType) {
    case 'agent':
      return generateAgentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'subAgent': {
      // Extract parent info for contextConfig handling
      const parentAgentId = componentData._parentAgentId;
      const contextConfigData = componentData._contextConfigData;
      // Remove temporary fields
      const cleanComponentData = { ...componentData };
      delete cleanComponentData._parentAgentId;
      delete cleanComponentData._contextConfigData;

      return generateSubAgentFile(
        componentId,
        cleanComponentData,
        defaultStyle,
        componentRegistry,
        parentAgentId,
        contextConfigData
      );
    }
    case 'tool': {
      // Check if this is an environment-aware MCP tool
      if (componentData && componentData._isEnvironmentAware) {
        const mcpKey = componentData._mcpKey;
        delete componentData._isEnvironmentAware;
        delete componentData._mcpKey;
        return generateEnvironmentAwareMcpToolFile(
          componentId,
          mcpKey,
          defaultStyle,
          componentRegistry
        );
      }
      return generateMcpToolFile(componentId, componentData, defaultStyle, componentRegistry);
    }
    case 'dataComponent':
      return generateDataComponentFile(componentId, componentData, defaultStyle);
    case 'artifactComponent':
      return generateArtifactComponentFile(componentId, componentData, defaultStyle);
    case 'statusComponent':
      return generateStatusComponentFile(componentId, componentData, defaultStyle);
    case 'environment':
      return generateEnvironmentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'externalAgent':
      return generateExternalAgentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'functions':
    case 'functionTool':
      return generateFunctionToolFile(componentId, componentData, defaultStyle);
    case 'credential':
      return generateCredentialFile(componentId, componentData, defaultStyle);
    case 'contextConfig': {
      // Extract agent ID if stored in componentData
      const agentId = componentData._agentId;
      // Remove the temporary _agentId field before passing to generator
      const cleanComponentData = { ...componentData };
      delete cleanComponentData._agentId;
      return generateContextConfigFile(
        componentId,
        cleanComponentData,
        defaultStyle,
        componentRegistry,
        agentId
      );
    }
    default:
      throw new Error(`No generator for component type: ${componentType}`);
  }
}

/**
 * Create new component files for components that don't exist locally
 */
export async function createNewComponents(
  comparison: ProjectComparison,
  remoteProject: FullProjectDefinition,
  localRegistry: ComponentRegistry,
  paths: ProjectPaths,
  environment: string,
  tempDirName?: string
): Promise<NewComponentResult[]> {
  const results: NewComponentResult[] = [];

  if (!comparison.hasChanges) {
    return results;
  }

  // Determine target paths - use temp directory if provided
  const targetPaths = tempDirName
    ? {
        projectRoot: join(paths.projectRoot, tempDirName),
        agentsDir: join(paths.projectRoot, tempDirName, 'agent'),
        toolsDir: join(paths.projectRoot, tempDirName, 'tool'),
        dataComponentsDir: join(paths.projectRoot, tempDirName, 'data-component'),
        artifactComponentsDir: join(paths.projectRoot, tempDirName, 'artifact-component'),
        statusComponentsDir: join(paths.projectRoot, tempDirName, 'status-component'),
        environmentsDir: join(paths.projectRoot, tempDirName, 'environment'),
        credentialsDir: join(paths.projectRoot, tempDirName, 'credential'),
        contextConfigsDir: join(paths.projectRoot, tempDirName, 'context-config'),
        externalAgentsDir: join(paths.projectRoot, tempDirName, 'external-agent'),
      }
    : paths;

  const actionText = tempDirName
    ? 'Creating component files in temp directory...'
    : 'Creating new component files...';
  console.log(chalk.cyan(`\n🆕 ${actionText}`));

  // Always ensure environment file exists for new projects
  if (!comparison.componentChanges.environments?.added.includes(environment)) {
    if (!comparison.componentChanges.environments) {
      comparison.componentChanges.environments = { added: [], modified: [], deleted: [] };
    }
    comparison.componentChanges.environments.added.push(environment);
  }

  // Define dependency order - components earlier in the list should be created first
  const creationOrder: (keyof ProjectComparison['componentChanges'])[] = [
    'credential',
    'environment',
    'contextConfig', // Can be created early - just config objects
    'functionTool', // Create functionTools before functions to avoid conflicts
    'functions',
    'tool',
    'dataComponent',
    'artifactComponent',
    'statusComponent',
    'externalAgent',
    'subAgent', // Create subAgents before main agents so they can be referenced
    'agent', // Create agents last so they can reference everything
  ];

  // Step 1: Register all new components in the registry first
  console.log(chalk.cyan('📝 Registering all new components in registry...'));
  for (const componentType of creationOrder) {
    const changes =
      comparison.componentChanges[componentType as keyof typeof comparison.componentChanges];
    if (!changes) continue;
    const addedComponents = changes.added || [];

    for (const componentId of addedComponents) {
      // Check if component already exists locally
      const existsLocally = localRegistry.get(componentId, componentType as any);
      if (existsLocally) continue;

      // Register the component with its expected file path and variable name
      const filePath = determineNewFilePath(componentType, componentId, targetPaths);
      const relativePath = filePath.replace(
        (tempDirName ? targetPaths.projectRoot : paths.projectRoot) + '/',
        ''
      );

      // Special handling for contextConfigs to use agent-based names
      let explicitVariableName: string | undefined;
      if (componentType === 'contextConfig') {
        const contextResult = findContextConfigData(remoteProject, componentId);
        if (contextResult) {
          explicitVariableName = `${toCamelCase(contextResult.agentId)}Context`;
        }
        // If no contextResult, let registry generate unique name
      }

      localRegistry.register(
        componentId,
        componentType, // componentType now matches ComponentType directly
        relativePath,
        explicitVariableName, // Only provide explicit name for contextConfigs, undefined for others
        false // isInline = false (new exported component)
      );
    }
  }

  // Step 2: Now generate all the files, knowing all components are registered
  console.log(chalk.cyan('🔨 Generating component files...'));
  for (const componentType of creationOrder) {
    const changes =
      comparison.componentChanges[componentType as keyof typeof comparison.componentChanges];
    if (!changes) continue;
    const addedComponents = changes.added || [];

    if (addedComponents.length === 0) continue;

    const remoteComponents = (remoteProject as any)[componentType] || {};

    for (const componentId of addedComponents) {
      try {
        // Check if component file already exists on disk (not just in registry)
        const filePath = determineNewFilePath(componentType, componentId, targetPaths);
        if (existsSync(filePath)) {
          // Component file already exists on disk - skip
          continue;
        }

        // Get component data based on component type
        let componentData: any = null;

        if (componentType === 'statusComponent') {
          // Status components are nested in agents - find them
          componentData = findStatusComponentData(remoteProject, componentId);
        } else if (componentType === 'credential') {
          // Credentials might be in credentialReferences
          componentData = remoteProject.credentialReferences?.[componentId];
        } else if (componentType === 'contextConfig') {
          // Context configs are nested in agents - store both contextConfig and agentId
          const contextResult = findContextConfigData(remoteProject, componentId);
          if (contextResult) {
            componentData = contextResult.contextConfig;
            // Store agent ID for later use in generation
            componentData._agentId = contextResult.agentId;
          }
        } else if (componentType === 'functions') {
          // Functions are in the functions collection
          componentData = remoteProject.functions?.[componentId];
        } else if (componentType === 'functionTool') {
          // Function tools might be in functions or functionTools
          const functionToolData =
            remoteProject.functionTools?.[componentId] || remoteProject.functions?.[componentId];

          // If functionTool has a functionId reference, merge with the actual function data
          if (
            functionToolData &&
            'functionId' in functionToolData &&
            functionToolData.functionId &&
            remoteProject.functions?.[functionToolData.functionId]
          ) {
            const functionData = remoteProject.functions[functionToolData.functionId];
            // Merge function data into functionTool data, but preserve functionTool metadata
            componentData = { ...functionData, ...functionToolData };
          } else {
            componentData = functionToolData;
          }
        } else if (componentType === 'subAgent') {
          // Sub-agents are nested within agents - get with parent info for contextConfig
          const subAgentInfo = findSubAgentWithParent(remoteProject, componentId);
          if (subAgentInfo) {
            componentData = subAgentInfo.subAgentData;
            // Store parent info for generator
            componentData._parentAgentId = subAgentInfo.parentAgentId;
            componentData._contextConfigData = subAgentInfo.contextConfigData;
          } else {
            componentData = null;
          }
        } else if (componentType === 'environment') {
          // Environments are generated programmatically based on environment name
          componentData = {
            name: `${componentId} Environment`,
            description: `Environment configuration for ${componentId}`,
            credentials: remoteProject.credentialReferences
              ? Object.keys(remoteProject.credentialReferences)
              : [],
          };
        } else {
          // Standard top-level lookup
          componentData = remoteComponents[componentId];
        }

        if (!componentData) {
          results.push({
            componentId,
            componentType,
            filePath: '',
            variableName: '',
            success: false,
            error: 'No data found in remote project',
          });
          continue;
        }

        // File path was already determined above for existence check

        // Ensure directory exists
        try {
          mkdirSync(dirname(filePath), { recursive: true });
        } catch (dirError) {
          throw dirError;
        }

        // Generate component content
        let content: string;
        try {
          content = generateComponentContent(
            componentType,
            componentId,
            componentData,
            localRegistry
          );
        } catch (genError) {
          throw genError;
        }

        // Write file
        writeFileSync(filePath, content, 'utf8');

        // Get the variable name that was already registered
        const registryEntry = localRegistry.get(componentId, componentType);
        if (!registryEntry) {
          throw new Error(
            `Component ${componentId} (${componentType}) was not registered in the registry`
          );
        }
        const variableName = registryEntry.name;

        results.push({
          componentId,
          componentType,
          filePath,
          variableName,
          success: true,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          componentId,
          componentType,
          filePath: '',
          variableName: '',
          success: false,
          error: errorMsg,
        });
      }
    }
  }

  // After all components are created, generate environment index file if environments were created
  const createdEnvironments = results.filter((r) => r.success && r.componentType === 'environment');
  if (createdEnvironments.length > 0) {
    try {
      console.log(chalk.cyan('📝 Generating environments index file...'));
      const { generateEnvironmentIndexFile } = await import('./components/environment-generator');
      const environmentIds = createdEnvironments.map((r) => r.componentId);
      const defaultStyle = { quotes: 'single' as const, indentation: '  ', semicolons: true };
      const indexContent = generateEnvironmentIndexFile(environmentIds, defaultStyle);
      const indexPath = join(targetPaths.environmentsDir, 'index.ts');

      mkdirSync(dirname(indexPath), { recursive: true });
      writeFileSync(indexPath, indexContent, 'utf8');

      console.log(chalk.green('✅ Environment index file created'));
    } catch (error) {
      console.log(
        chalk.yellow(
          '⚠️ Failed to create environment index file:',
          error instanceof Error ? error.message : String(error)
        )
      );
    }
  }

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(chalk.green(`\n✅ Created ${successful.length} new component files`));
  if (failed.length > 0) {
    console.log(chalk.red(`❌ ${failed.length} components failed`));
  }

  if (failed.length > 0) {
    console.log(chalk.red('\n❌ Failed to create:'));
    failed.forEach((result) => {
      console.log(chalk.red(`  ${result.componentType}:${result.componentId} - ${result.error}`));
    });
  }

  return results;
}

/**
 * Find status component data by ID from project agents
 */
function findStatusComponentData(
  project: FullProjectDefinition,
  statusId: string
): any | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.statusUpdates && agentData.statusUpdates.statusComponents) {
        for (const statusComp of agentData.statusUpdates.statusComponents) {
          let compId: string | undefined;

          if (typeof statusComp === 'string') {
            compId = statusComp;
          } else if (typeof statusComp === 'object' && statusComp) {
            compId = statusComp.type;
          }

          if (compId === statusId) {
            return typeof statusComp === 'string'
              ? { id: statusId, type: statusId, description: `Status component for ${statusId}` }
              : statusComp;
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Find context config data by ID from project agents
 */
function findContextConfigData(
  project: FullProjectDefinition,
  contextId: string
): { contextConfig: any; agentId: string } | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.contextConfig) {
        // Check if this contextConfig matches by its actual ID
        if (agentData.contextConfig.id === contextId) {
          return { contextConfig: agentData.contextConfig, agentId };
        }
      }
    }
  }
  return undefined;
}

/**
 * Find sub-agent data by ID from project agents
 */
function findSubAgentData(project: FullProjectDefinition, subAgentId: string): any | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.subAgents && agentData.subAgents[subAgentId]) {
        return agentData.subAgents[subAgentId];
      }
    }
  }
  return undefined;
}
