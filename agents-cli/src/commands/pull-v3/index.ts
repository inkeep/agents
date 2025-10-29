/**
 * Pull v3 - Clean, efficient project generation
 * 
 * Step 1: Validate and compile existing code
 * Step 2: Compare project with DB to detect ALL changes
 * Step 3: Classify changes as new vs modified components
 * Step 4: Generate new components deterministically 
 * Step 5: Use LLM to correct modified components
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';
import { ManagementApiClient } from '../../api';
import type { NestedInkeepConfig } from '../../config';
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { loadConfig } from '../../utils/config';
import { compareProjectDefinitions } from '../../utils/json-comparison';
import { introspectGenerate } from './introspect-generator';
import { compareProjects, type ProjectComparison } from './project-comparator';
import { extractSubAgents } from './utils/component-registry';

export interface PullV3Options {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  force?: boolean;
  introspect?: boolean;
}

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
 * Create project directory structure
 */
function createProjectStructure(
  projectDir: string,
  projectId: string
): ProjectPaths {
  const projectRoot = projectDir;
  
  const paths = {
    projectRoot,
    agentsDir: join(projectRoot, 'agents'),
    toolsDir: join(projectRoot, 'tools'),
    dataComponentsDir: join(projectRoot, 'data-components'),
    artifactComponentsDir: join(projectRoot, 'artifact-components'),
    statusComponentsDir: join(projectRoot, 'status-components'),
    environmentsDir: join(projectRoot, 'environments'),
    credentialsDir: join(projectRoot, 'credentials'),
    contextConfigsDir: join(projectRoot, 'context-configs'),
    externalAgentsDir: join(projectRoot, 'external-agents'),
  };

  // Ensure all directories exist
  Object.values(paths).forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  return paths;
}

/**
 * Enrich canDelegateTo references with component type information
 */
export function enrichCanDelegateToWithTypes(project: FullProjectDefinition, debug: boolean = false): void {
  if (debug) {
    console.log(chalk.gray('🔧 Enriching canDelegateTo with type information...'));
  }

  // Get all available component IDs by type
  const agentIds = new Set(project.agents ? Object.keys(project.agents) : []);
  const subAgentIds = new Set(Object.keys(extractSubAgents(project)));
  const externalAgentIds = new Set(project.externalAgents ? Object.keys(project.externalAgents) : []);

  if (debug) {
    console.log(chalk.gray(`   Available agents: ${Array.from(agentIds).join(', ') || 'none'}`));
    console.log(chalk.gray(`   Available subAgents: ${Array.from(subAgentIds).join(', ') || 'none'}`));
    console.log(chalk.gray(`   Available externalAgents: ${Array.from(externalAgentIds).join(', ') || 'none'}`));
  }

  // Function to enrich a canDelegateTo array
  const enrichCanDelegateToArray = (canDelegateTo: any[], context: string) => {
    if (!Array.isArray(canDelegateTo)) return;

    for (let i = 0; i < canDelegateTo.length; i++) {
      const item = canDelegateTo[i];
      
      // Skip if it's already an object (already has type info)
      if (typeof item !== 'string') continue;

      const id = item as string;
      let enrichedItem: any = null;

      // Determine component type based on which collection contains this ID
      if (agentIds.has(id)) {
        enrichedItem = { agentId: id };
      } else if (subAgentIds.has(id)) {
        enrichedItem = { subAgentId: id };
      } else if (externalAgentIds.has(id)) {
        enrichedItem = { externalAgentId: id };
      } else {
        if (debug) {
          console.log(chalk.yellow(`   Warning: canDelegateTo reference "${id}" in ${context} not found in any component collection`));
        }
        continue; // Leave as string if we can't determine the type
      }

      if (debug && enrichedItem) {
        console.log(chalk.gray(`   Enriched "${id}" in ${context} -> ${JSON.stringify(enrichedItem)}`));
      }

      // Replace the string with the enriched object
      canDelegateTo[i] = enrichedItem;
    }
  };

  // Process all agents
  if (project.agents) {
    for (const [agentId, agentData] of Object.entries(project.agents)) {
      if (agentData.canDelegateTo) {
        enrichCanDelegateToArray(agentData.canDelegateTo, `agent:${agentId}`);
      }

      // Process subAgents within agents
      if (agentData.subAgents) {
        for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
          if (subAgentData.canDelegateTo) {
            enrichCanDelegateToArray(subAgentData.canDelegateTo, `subAgent:${subAgentId}`);
          }
        }
      }
    }
  }
}

/**
 * Read existing project from filesystem if it exists
 */
async function readExistingProject(projectRoot: string, debug: boolean = false): Promise<FullProjectDefinition | null> {
  const indexPath = join(projectRoot, 'index.ts');

  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    // Import the project-loader utility (same as pull-v2)
    const { loadProject } = await import('../../utils/project-loader');

    // Load the project from index.ts
    const project = await loadProject(projectRoot);

    // Convert to FullProjectDefinition with timeout to prevent hanging
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isCredentialError = errorMessage.includes('Credential') && errorMessage.includes('not found');
    
    if (debug) {
      if (isCredentialError) {
        console.log(chalk.yellow('   ⚠ Cannot load existing project - credentials not configured:'));
        console.log(chalk.gray(`   ${errorMessage}`));
        console.log(chalk.gray('   💡 This is expected if you haven\'t added credentials to environment files yet'));
      } else {
        console.log(chalk.red('   ✗ Error parsing existing project:'));
        console.log(chalk.red(`   ${errorMessage}`));
      }
    }
    return null;
  }
}

/**
 * Main pull-v3 command
 */
export async function pullV3Command(options: PullV3Options): Promise<void> {
  // Suppress SDK logging for cleaner output
  const originalLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'silent';
  
  const restoreLogLevel = () => {
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  };

  // Background version check
  performBackgroundVersionCheck();

  console.log(chalk.blue('\n🚀 Pull v3 - Clean & Efficient'));
  if (options.introspect) {
    console.log(chalk.gray('  Introspect mode • Complete regeneration • No comparison needed'));
  } else {
    console.log(chalk.gray('  Smart comparison • Detect all changes • Targeted updates'));
  }

  const s = p.spinner();

  try {
    // Step 1: Load configuration
    s.start('Loading configuration...');
    
    let config: NestedInkeepConfig | null = null;
    const searchDir = process.cwd();

    if (options.config) {
      const configPath = resolve(process.cwd(), options.config);
      if (existsSync(configPath)) {
        config = await loadProjectConfig(dirname(configPath), options.config);
      } else {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
    } else {
      // Search for config file
      const currentConfigPath = join(searchDir, 'inkeep.config.ts');
      if (existsSync(currentConfigPath)) {
        config = await loadProjectConfig(searchDir);
      } else {
        throw new Error('Could not find inkeep.config.ts');
      }
    }

    const projectId = options.project;
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    s.message('Configuration loaded');

    // Step 2: Fetch project data from API
    s.start(`Fetching project: ${projectId}`);
    
    const apiClient = await ManagementApiClient.create(
      config.agentsManageApi.url,
      options.config,
      config.tenantId,
      projectId
    );

    const remoteProject = await apiClient.getFullProject(projectId);
    
    if (options.debug && remoteProject.functions) {
      console.log(chalk.gray('   📋 Project-level functions from API:'), Object.keys(remoteProject.functions));
      Object.entries(remoteProject.functions).forEach(([id, data]: [string, any]) => {
        console.log(chalk.gray(`      ${id}: has name=${!!data.name}, has description=${!!data.description}`));
      });
    }
    
    // Normalize remote project (same as pull-v2 - hoist agent-level functionTools)
    if (remoteProject.agents) {
      for (const [agentId, agentData] of Object.entries(remoteProject.agents) as any[]) {
        if (agentData.functionTools) {
          remoteProject.functionTools = remoteProject.functionTools || {};
          Object.assign(remoteProject.functionTools, agentData.functionTools);
          if (options.debug) {
            console.log(chalk.gray(`   Hoisted functionTools from agent ${agentId}: ${Object.keys(agentData.functionTools).join(', ')}`));
          }
        }
        if (agentData.functions) {
          remoteProject.functions = remoteProject.functions || {};
          // Only hoist agent functions if project-level functions don't already exist (to preserve name/description)
          Object.entries(agentData.functions).forEach(([funcId, funcData]) => {
            if (!remoteProject.functions[funcId]) {
              remoteProject.functions[funcId] = funcData;
            } else if (options.debug) {
              console.log(chalk.gray(`   Skipping hoist of function ${funcId} - project-level version already exists with complete data`));
            }
          });
          if (options.debug) {
            const hoistedKeys = Object.keys(agentData.functions).filter(key => !remoteProject.functions[key]);
            if (hoistedKeys.length > 0) {
              console.log(chalk.gray(`   Hoisted functions from agent ${agentId}: ${hoistedKeys.join(', ')}`));
            }
          }
        }
      }
    }

    // Filter out project-level tools from individual agents
    // The API includes project-level tools in each agent's tools field, but our generated
    // code structure keeps tools separate and imports them via canUse relationships
    if (remoteProject.agents && remoteProject.tools) {
      const projectToolIds = Object.keys(remoteProject.tools);
      
      for (const [agentId, agentData] of Object.entries(remoteProject.agents) as any[]) {
        if (agentData.tools) {
          const originalToolCount = Object.keys(agentData.tools).length;
          
          // Filter out any tools that are defined at project level
          const agentSpecificTools = Object.fromEntries(
            Object.entries(agentData.tools).filter(([toolId]) => !projectToolIds.includes(toolId))
          );
          
          // Only keep tools field if there are agent-specific tools remaining
          if (Object.keys(agentSpecificTools).length > 0) {
            agentData.tools = agentSpecificTools;
          } else {
            // Remove the tools field entirely if all tools were project-level
            delete agentData.tools;
          }
          
          if (options.debug) {
            const removedCount = originalToolCount - Object.keys(agentSpecificTools).length;
            if (removedCount > 0) {
              console.log(chalk.gray(`   Filtered ${removedCount} project-level tools from agent ${agentId}`));
            }
          }
        }
      }
    }
    
    // Enrich canDelegateTo references with component type information
    enrichCanDelegateToWithTypes(remoteProject, options.debug);
    
    s.message('Project data fetched');

    if (options.json) {
      console.log(JSON.stringify(remoteProject, null, 2));
      restoreLogLevel();
      return;
    }

    // Step 3: Set up project structure
    const outputDir = (config.outputDirectory && config.outputDirectory !== 'default') 
      ? config.outputDirectory 
      : process.cwd();
    const projectDir = resolve(outputDir, projectId);
    const paths = createProjectStructure(projectDir, projectId);

    // Step 4: Introspect mode - skip comparison, regenerate everything
    if (options.introspect) {
      console.log(chalk.yellow('\n🔍 Introspect mode: Regenerating all files from scratch'));
      
      s.start('Generating all files deterministically...');
      await introspectGenerate(remoteProject, paths, options.env || 'development', options.debug || false);
      s.stop('All files generated');
      
      console.log(chalk.green('\n✅ Project regenerated successfully with introspect mode!'));
      console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
      console.log(chalk.gray(`   🌍 Environment: ${options.env || 'development'}`));
      console.log(chalk.gray(`   🚀 Mode: Complete regeneration (no comparison)`));
      
      restoreLogLevel();
      process.exit(0);
    }

    // Step 5: Read existing project and compare
    s.start('Reading existing project...');
    const localProject = await readExistingProject(paths.projectRoot, options.debug);
    
    if (!localProject) {
      s.message('No existing project found - treating as new project');
    } else {
      s.message('Existing project loaded');
    }

    // Step 6: Build local component registry to understand current project structure
    s.start('Building component registry from local files...');
    const { buildComponentRegistryFromParsing } = await import('./component-parser');
    const localRegistry = buildComponentRegistryFromParsing(paths.projectRoot, options.debug);
    s.message('Component registry built');
    

    // Step 7: Comprehensive project comparison (now with access to registry)
    s.start('Comparing projects for changes...');
    const comparison = await compareProjects(localProject, remoteProject, localRegistry, options.debug);
    
    
    if (!comparison.hasChanges && !options.force) {
      s.stop();
      console.log(chalk.green('✅ Project is already up to date'));
      console.log(chalk.gray('   No differences detected between local and remote projects'));
      restoreLogLevel();
      process.exit(0);
    }

    s.message(`Detected ${comparison.changeCount} differences`);



    // Step 8: Create temp directory and copy existing project (or start empty)
    const tempDirName = `.temp-validation-${Date.now()}`;
    s.start('Preparing temp directory...');
    
    const { copyProjectToTemp } = await import('./component-updater');
    if (localProject) {
      // Copy existing project to temp directory
      copyProjectToTemp(paths.projectRoot, tempDirName);
      console.log(chalk.green(`✅ Existing project copied to temp directory`));
    } else {
      // Start with empty temp directory for new projects
      const tempDir = join(paths.projectRoot, tempDirName);
      mkdirSync(tempDir, { recursive: true });
      console.log(chalk.green(`✅ Empty temp directory created for new project`));
    }
    
    s.message('Temp directory prepared');

    // Step 9: Add new components to temp directory
    const newComponentCount = Object.values(comparison.componentChanges)
      .reduce((sum, changes) => sum + changes.added.length, 0);
      
    if (newComponentCount > 0) {
      s.start('Creating new component files in temp directory...');
      const { createNewComponents } = await import('./new-component-generator');
      const newComponentResults = await createNewComponents(
        comparison,
        remoteProject,
        localRegistry,
        paths,
        options.env || 'development',
        tempDirName
      );
      
      const successful = newComponentResults.filter(r => r.success);
      console.log(chalk.green(`✅ Added ${successful.length} new components to temp directory`));
      s.message('New component files created');
    }

    // Step 10: Apply modified components to temp directory
    const modifiedCount = Object.values(comparison.componentChanges)
      .reduce((sum, changes) => sum + changes.modified.length, 0);
    
    
    if (modifiedCount > 0) {
      s.start('Applying modified components to temp directory...');
      const { updateModifiedComponents } = await import('./component-updater');
      const updateResults = await updateModifiedComponents(
        comparison,
        remoteProject,
        localRegistry,
        paths.projectRoot,
        options.env || 'development',
        options.debug,
        tempDirName  // Use the temp directory we created
      );
      s.message('Modified components applied');
    }

    // Step 11: Create index.ts in temp directory only
    s.start('Generating project index file in temp directory...');
    const { generateProjectIndex } = await import('./project-index-generator');
    
    // Only create in temp directory for validation
    await generateProjectIndex(join(paths.projectRoot, tempDirName), remoteProject, localRegistry, projectId);
    
    s.message('Project index file created');

    // Step 12: Run validation and user interaction on complete temp directory
    if (newComponentCount > 0 || modifiedCount > 0) {
      s.start('Running validation on complete project...');
      const { validateTempDirectory } = await import('./project-validator');
      await validateTempDirectory(paths.projectRoot, tempDirName, remoteProject);
      s.message('Validation completed');
    } else {
      console.log(chalk.green('\n✅ No changes detected - project is up to date'));
    }

    restoreLogLevel();
    process.exit(0);

  } catch (error) {
    s.stop();
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    if (options.debug && error instanceof Error) {
      console.error(chalk.red(error.stack || ''));
    }
    restoreLogLevel();
    process.exit(1);
  }
}