/**
 * New Component Generator - Create brand new files for components that don't exist
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
import { generateMcpToolFile } from './components/mcp-tool-generator';
import { generateStatusComponentFile } from './components/status-component-generator';
import { generateSubAgentFile } from './components/sub-agent-generator';
import type { ProjectComparison } from './project-comparator';
import type { ComponentRegistry, ComponentType } from './utils/component-registry';
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

/**
 * Generate variable name from component ID
 */
function generateVariableName(componentId: string): string {
  return componentId
    .toLowerCase()
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[0-9]/, '_$&');
}

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
    case 'agents':
      return join(paths.agentsDir, fileName);
    case 'tools':
      return join(paths.toolsDir, fileName);
    case 'dataComponents':
      return join(paths.dataComponentsDir, fileName);
    case 'artifactComponents':
      return join(paths.artifactComponentsDir, fileName);
    case 'statusComponents':
      return join(paths.statusComponentsDir, fileName);
    case 'environments':
      return join(paths.environmentsDir, `${toKebabCase(componentId)}.env.ts`);
    case 'subAgents':
      return join(paths.agentsDir, 'sub-agents', fileName);
    case 'externalAgents':
      return join(paths.externalAgentsDir, fileName);
    case 'functions':
    case 'functionTools': {
      // Functions might go in tools/functions/ or just tools/
      const functionsDir = join(paths.toolsDir, 'functions');
      return join(functionsDir, fileName);
    }
    case 'credentials':
      return join(paths.credentialsDir, fileName);
    case 'contextConfigs':
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
    case 'agents':
      return generateAgentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'subAgents':
      return generateSubAgentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'tools':
      return generateMcpToolFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'dataComponents':
      return generateDataComponentFile(componentId, componentData, defaultStyle);
    case 'artifactComponents':
      return generateArtifactComponentFile(componentId, componentData, defaultStyle);
    case 'statusComponents':
      return generateStatusComponentFile(componentId, componentData, defaultStyle);
    case 'environments':
      return generateEnvironmentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'externalAgents':
      return generateExternalAgentFile(componentId, componentData, defaultStyle, componentRegistry);
    case 'functions':
    case 'functionTools':
      return generateFunctionToolFile(componentId, componentData, defaultStyle);
    case 'credentials':
      return generateCredentialFile(componentId, componentData, defaultStyle);
    case 'contextConfigs': {
      // Extract agent ID if stored in componentData
      const agentId = componentData._agentId;
      // Remove the temporary _agentId field before passing to generator
      const cleanComponentData = { ...componentData };
      delete cleanComponentData._agentId;
      return generateContextConfigFile(componentId, cleanComponentData, defaultStyle, componentRegistry, agentId);
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
  tempDirName?: string,
): Promise<NewComponentResult[]> {
  const results: NewComponentResult[] = [];

  if (!comparison.hasChanges) {
    return results;
  }

  // Determine target paths - use temp directory if provided
  const targetPaths = tempDirName ? {
    projectRoot: join(paths.projectRoot, tempDirName),
    agentsDir: join(paths.projectRoot, tempDirName, 'agents'),
    toolsDir: join(paths.projectRoot, tempDirName, 'tools'),
    dataComponentsDir: join(paths.projectRoot, tempDirName, 'data-components'),
    artifactComponentsDir: join(paths.projectRoot, tempDirName, 'artifact-components'),
    statusComponentsDir: join(paths.projectRoot, tempDirName, 'status-components'),
    environmentsDir: join(paths.projectRoot, tempDirName, 'environments'),
    credentialsDir: join(paths.projectRoot, tempDirName, 'credentials'),
    contextConfigsDir: join(paths.projectRoot, tempDirName, 'context-configs'),
    externalAgentsDir: join(paths.projectRoot, tempDirName, 'external-agents'),
  } : paths;

  const actionText = tempDirName ? 'Creating component files in temp directory...' : 'Creating new component files...';
  console.log(chalk.cyan(`\n🆕 ${actionText}`));

  // Always ensure environment file exists for new projects
  if (!comparison.componentChanges.environments?.added.includes(environment)) {
    if (!comparison.componentChanges.environments) {
      comparison.componentChanges.environments = { added: [], modified: [], deleted: [] };
    }
    comparison.componentChanges.environments.added.push(environment);
  }

  // Define dependency order - components earlier in the list should be created first
  const creationOrder = [
    'credentials',
    'environments', 
    'contextConfigs',  // Can be created early - just config objects
    'functions',
    'functionTools',
    'tools',
    'dataComponents',
    'artifactComponents', 
    'statusComponents',
    'externalAgents',
    'subAgents',  // Create subAgents before main agents so they can be referenced
    'agents'      // Create agents last so they can reference everything
  ];

  // Step 1: Register all new components in the registry first
  console.log(chalk.cyan('📝 Registering all new components in registry...'));
  for (const componentType of creationOrder) {
    const changes = comparison.componentChanges[componentType as keyof typeof comparison.componentChanges];
    if (!changes) continue;
    const addedComponents = changes.added || [];

    for (const componentId of addedComponents) {
      // Check if component already exists locally
      const existsLocally = localRegistry.get(componentId);
      if (existsLocally) continue;

      // Register the component with its expected file path and variable name  
      const filePath = determineNewFilePath(componentType, componentId, targetPaths);
      const relativePath = filePath.replace((tempDirName ? targetPaths.projectRoot : paths.projectRoot) + '/', '');
      
      let variableName: string;
      if (componentType === 'contextConfigs') {
        // For contextConfigs, try to extract agent ID and use agent-based variable name
        const contextResult = findContextConfigData(remoteProject, componentId);
        if (contextResult) {
          variableName = `${toCamelCase(contextResult.agentId)}Context`;
        } else {
          variableName = generateVariableName(componentId);
        }
      } else {
        variableName = generateVariableName(componentId);
      }

      localRegistry.register(
        componentId,
        componentType.slice(0, -1) as ComponentType, // Remove 's' from plural
        relativePath,
        variableName,
        false // isInline = false (new exported component)
      );
    }
  }

  // Step 2: Now generate all the files, knowing all components are registered
  console.log(chalk.cyan('🔨 Generating component files...'));
  for (const componentType of creationOrder) {
    const changes = comparison.componentChanges[componentType as keyof typeof comparison.componentChanges];
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
        
        
        if (componentType === 'statusComponents') {
          // Status components are nested in agents - find them
          componentData = findStatusComponentData(remoteProject, componentId);
        } else if (componentType === 'credentials') {
          // Credentials might be in credentialReferences
          componentData = remoteProject.credentialReferences?.[componentId];
        } else if (componentType === 'contextConfigs') {
          // Context configs are nested in agents - store both contextConfig and agentId
          const contextResult = findContextConfigData(remoteProject, componentId);
          if (contextResult) {
            componentData = contextResult.contextConfig;
            // Store agent ID for later use in generation
            componentData._agentId = contextResult.agentId;
          }
        } else if (componentType === 'functionTools') {
          // Function tools might be in functions or functionTools
          let functionToolData = remoteProject.functionTools?.[componentId] || remoteProject.functions?.[componentId];
          
          // If functionTool has a functionId reference, merge with the actual function data
          if (functionToolData && 'functionId' in functionToolData && functionToolData.functionId && remoteProject.functions?.[functionToolData.functionId]) {
            const functionData = remoteProject.functions[functionToolData.functionId];
            // Merge function data into functionTool data
            componentData = { ...functionToolData, ...functionData };
          } else {
            componentData = functionToolData;
          }
        } else if (componentType === 'subAgents') {
          // Sub-agents are nested within agents
          componentData = findSubAgentData(remoteProject, componentId);
        } else if (componentType === 'environments') {
          // Environments are generated programmatically based on environment name
          componentData = {
            name: `${componentId} Environment`,
            description: `Environment configuration for ${componentId}`,
            credentials: remoteProject.credentialReferences ? Object.keys(remoteProject.credentialReferences) : []
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
            localRegistry,
          );
        } catch (genError) {
          throw genError;
        }

        // Write file
        writeFileSync(filePath, content, 'utf8');

        // Get the variable name that was already registered
        const registryEntry = localRegistry.get(componentId);
        const variableName = registryEntry?.name || generateVariableName(componentId);

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
  const createdEnvironments = results.filter(r => r.success && r.componentType === 'environments');
  if (createdEnvironments.length > 0) {
    try {
      console.log(chalk.cyan('📝 Generating environments index file...'));
      const { generateEnvironmentIndexFile } = await import('./components/environment-generator');
      const environmentIds = createdEnvironments.map(r => r.componentId);
      const defaultStyle = { quotes: 'single' as const, indentation: '  ', semicolons: true };
      const indexContent = generateEnvironmentIndexFile(environmentIds, defaultStyle);
      const indexPath = join(targetPaths.environmentsDir, 'index.ts');
      
      mkdirSync(dirname(indexPath), { recursive: true });
      writeFileSync(indexPath, indexContent, 'utf8');
      
      console.log(chalk.green('✅ Environment index file created'));
    } catch (error) {
      console.log(chalk.yellow('⚠️ Failed to create environment index file:', error instanceof Error ? error.message : String(error)));
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
function findStatusComponentData(project: FullProjectDefinition, statusId: string): any | undefined {
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
function findContextConfigData(project: FullProjectDefinition, contextId: string): { contextConfig: any; agentId: string } | undefined {
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.contextConfig) {
        // Check if this contextConfig matches the agent-based ID pattern
        const agentBasedId = `${agentId}Context`;
        if (agentBasedId === contextId) {
          return { contextConfig: agentData.contextConfig, agentId };
        }
        // Also check for direct ID match
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
