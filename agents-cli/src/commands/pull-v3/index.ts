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
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { initializeCommand } from '../../utils/cli-pipeline';
import { compareProjectDefinitions } from '../../utils/json-comparison';
import { loadProject } from '../../utils/project-loader';
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
 * Create project directory structure
 */
function createProjectStructure(projectDir: string, projectId: string): ProjectPaths {
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
  Object.values(paths).forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  return paths;
}

/**
 * Enrich canDelegateTo references with component type information
 */
export function enrichCanDelegateToWithTypes(
  project: FullProjectDefinition,
  debug: boolean = false
): void {
  if (debug) {
    console.log(chalk.gray('🔧 Enriching canDelegateTo with type information...'));
  }

  // Get all available component IDs by type
  const agentIds = new Set(project.agents ? Object.keys(project.agents) : []);
  const subAgentIds = new Set(Object.keys(extractSubAgents(project)));
  const externalAgentIds = new Set(
    project.externalAgents ? Object.keys(project.externalAgents) : []
  );

  if (debug) {
    console.log(chalk.gray(`   Available agents: ${Array.from(agentIds).join(', ') || 'none'}`));
    console.log(
      chalk.gray(`   Available subAgents: ${Array.from(subAgentIds).join(', ') || 'none'}`)
    );
    console.log(
      chalk.gray(
        `   Available externalAgents: ${Array.from(externalAgentIds).join(', ') || 'none'}`
      )
    );
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
          console.log(
            chalk.yellow(
              `   Warning: canDelegateTo reference "${id}" in ${context} not found in any component collection`
            )
          );
        }
        continue; // Leave as string if we can't determine the type
      }

      if (debug && enrichedItem) {
        console.log(
          chalk.gray(`   Enriched "${id}" in ${context} -> ${JSON.stringify(enrichedItem)}`)
        );
      }

      // Replace the string with the enriched object
      canDelegateTo[i] = enrichedItem;
    }
  };

  // Process all agents
  if (project.agents) {
    for (const [_, agentData] of Object.entries(project.agents)) {
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
async function readExistingProject(
  projectRoot: string,
  debug: boolean = false
): Promise<FullProjectDefinition | null> {
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
    const isCredentialError =
      errorMessage.includes('Credential') && errorMessage.includes('not found');

    if (debug) {
      if (isCredentialError) {
        console.log(
          chalk.yellow('   ⚠ Cannot load existing project - credentials not configured:')
        );
        console.log(chalk.gray(`   ${errorMessage}`));
        console.log(
          chalk.gray(
            "   💡 This is expected if you haven't added credentials to environment files yet"
          )
        );
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
    // Step 1: Load configuration (same as push command)
    const { config } = await initializeCommand({
      configPath: options.config,
      showSpinner: true,
      spinnerText: 'Loading configuration...',
      logConfig: true,
    });

    // Step 2: Determine project directory - match push command behavior
    s.start('Detecting project...');
    let projectDir: string;

    if (options.project) {
      // If project path is explicitly specified, use it and require index.ts
      projectDir = resolve(process.cwd(), options.project);
      if (!existsSync(join(projectDir, 'index.ts'))) {
        s.stop(`No index.ts found in specified project directory: ${projectDir}`);
        console.error(
          chalk.yellow('The specified project directory must contain an index.ts file')
        );
        process.exit(1);
      }
    } else {
      // Look for index.ts in current directory (same as push)
      const currentDir = process.cwd();
      if (existsSync(join(currentDir, 'index.ts'))) {
        projectDir = currentDir;
      } else {
        s.stop('No index.ts found in current directory');
        console.error(
          chalk.yellow(
            'Please run this command from a directory containing index.ts or use --project <path>'
          )
        );
        process.exit(1);
      }
    }

    s.stop(`Project found: ${projectDir}`);

    // Step 3: Load existing project to get project ID (like push does)
    s.start('Loading local project to get project ID...');

    let localProjectForId: any;
    let projectId: string;

    try {
      localProjectForId = await loadProject(projectDir);
      projectId = localProjectForId.getId();

      s.stop(`Project ID: ${projectId}`);
    } catch (error) {
      s.stop('Failed to load local project');
      throw new Error(
        `Could not determine project ID. Local project failed to load: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 4: Fetch project data from API
    s.start(`Fetching project: ${projectId}`);

    const apiClient = await ManagementApiClient.create(
      config.agentsManageApiUrl,
      options.config,
      config.tenantId,
      projectId
    );

    const remoteProject = await apiClient.getFullProject(projectId);

    if (options.debug && remoteProject.functions) {
      console.log(
        chalk.gray('   📋 Project-level functions from API:'),
        Object.keys(remoteProject.functions)
      );
      Object.entries(remoteProject.functions).forEach(([id, data]: [string, any]) => {
        console.log(
          chalk.gray(`      ${id}: has name=${!!data.name}, has description=${!!data.description}`)
        );
      });
    }

    // Normalize remote project (same as pull-v2 - hoist agent-level functionTools)
    if (remoteProject.agents) {
      for (const [agentId, agentData] of Object.entries(remoteProject.agents) as any[]) {
        if (agentData.functionTools) {
          remoteProject.functionTools = remoteProject.functionTools || {};
          Object.assign(remoteProject.functionTools, agentData.functionTools);
          if (options.debug) {
            console.log(
              chalk.gray(
                `   Hoisted functionTools from agent ${agentId}: ${Object.keys(agentData.functionTools).join(', ')}`
              )
            );
          }
        }
        if (agentData.functions) {
          remoteProject.functions = remoteProject.functions || {};
          // Only hoist agent functions if project-level functions don't already exist (clean function data)
          Object.entries(agentData.functions).forEach(([funcId, funcData]: [string, any]) => {
            if (!remoteProject.functions[funcId]) {
              // Clean function data - remove functionTool metadata that shouldn't be in functions collection
              remoteProject.functions[funcId] = {
                id: funcData.id,
                inputSchema: funcData.inputSchema,
                executeCode: funcData.executeCode,
                dependencies: funcData.dependencies,
              };
            }
          });
          if (options.debug) {
            const hoistedKeys = Object.keys(agentData.functions).filter(
              (key) => !remoteProject.functions[key]
            );
            if (hoistedKeys.length > 0) {
              console.log(
                chalk.gray(`   Hoisted functions from agent ${agentId}: ${hoistedKeys.join(', ')}`)
              );
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
              console.log(
                chalk.gray(`   Filtered ${removedCount} project-level tools from agent ${agentId}`)
              );
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

    // Step 5: Set up project structure
    const paths = createProjectStructure(projectDir, projectId);

    // Step 6: Introspect mode - skip comparison, regenerate everything
    if (options.introspect) {
      console.log(chalk.yellow('\n🔍 Introspect mode: Regenerating all files from scratch'));

      s.start('Generating all files deterministically...');
      await introspectGenerate(
        remoteProject,
        paths,
        options.env || 'development',
        options.debug || false
      );
      s.stop('All files generated');

      console.log(chalk.green('\n✅ Project regenerated successfully with introspect mode!'));
      console.log(chalk.gray(`   📁 Location: ${paths.projectRoot}`));
      console.log(chalk.gray(`   🌍 Environment: ${options.env || 'development'}`));
      console.log(chalk.gray(`   🚀 Mode: Complete regeneration (no comparison)`));

      restoreLogLevel();
      process.exit(0);
    }

    // Step 7: Read existing project and compare
    // s.start('Reading existing project...');
    const localProject = await readExistingProject(paths.projectRoot, options.debug);

    if (!localProject) {
      s.message('No existing project found - treating as new project');
    } else {
      s.message('Existing project loaded');
    }

    // Step 8: Build local component registry to understand current project structure
    s.start('Building component registry from local files...');
    const { buildComponentRegistryFromParsing } = await import('./component-parser');
    const localRegistry = buildComponentRegistryFromParsing(paths.projectRoot, options.debug);
    s.message('Component registry built');

    // Step 9: Debug registry to see variable name conflicts
    if (options.debug) {
      console.log(chalk.cyan('\n🔍 Component Registry Debug:'));
      const allComponents = localRegistry.getAllComponents();
      console.log(chalk.gray('   Total components registered:'), allComponents.length);

      // Group by variable name to see conflicts
      const nameGroups = new Map<string, any[]>();
      for (const comp of allComponents) {
        if (!nameGroups.has(comp.name)) {
          nameGroups.set(comp.name, []);
        }
        nameGroups.get(comp.name)!.push(comp);
      }

      // Show any conflicts
      for (const [varName, components] of nameGroups.entries()) {
        if (components.length > 1) {
          console.log(chalk.red(`   ❌ Variable name conflict: "${varName}"`));
          for (const comp of components) {
            console.log(chalk.gray(`      - ${comp.type}:${comp.id} -> ${comp.filePath}`));
          }
        } else {
          console.log(chalk.gray(`   ✅ ${varName} (${components[0].type}:${components[0].id})`));
        }
      }
    }

    // Step 10: Comprehensive project comparison (now with access to registry)
    s.start('Comparing projects for changes...');
    const comparison = await compareProjects(
      localProject,
      remoteProject,
      localRegistry,
      options.debug
    );

    if (!comparison.hasChanges && !options.force) {
      s.stop();
      console.log(chalk.green('✅ Project is already up to date'));
      console.log(chalk.gray('   No differences detected between local and remote projects'));
      restoreLogLevel();
      process.exit(0);
    }

    s.message(`Detected ${comparison.changeCount} differences`);

    // Step 11: Create temp directory and copy existing project (or start empty)
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

    // Step 12: Add new components to temp directory
    const newComponentCount = Object.values(comparison.componentChanges).reduce(
      (sum, changes) => sum + changes.added.length,
      0
    );

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

      // Debug registry after new components are generated
      if (options.debug) {
        console.log(chalk.cyan('\n🔍 Component Registry After Generation:'));
        const allComponents = localRegistry.getAllComponents();
        console.log(chalk.gray('   Total components registered:'), allComponents.length);

        // Group by variable name to see conflicts
        const nameGroups = new Map<string, any[]>();
        for (const comp of allComponents) {
          if (!nameGroups.has(comp.name)) {
            nameGroups.set(comp.name, []);
          }
          nameGroups.get(comp.name)!.push(comp);
        }

        // Show any conflicts
        for (const [varName, components] of nameGroups.entries()) {
          if (components.length > 1) {
            console.log(chalk.red(`   ❌ Variable name conflict: "${varName}"`));
            for (const comp of components) {
              console.log(chalk.gray(`      - ${comp.type}:${comp.id} -> ${comp.filePath}`));
            }
          } else {
            console.log(chalk.gray(`   ✅ ${varName} (${components[0].type}:${components[0].id})`));
          }
        }
      }

      const successful = newComponentResults.filter((r) => r.success);
      console.log(chalk.green(`✅ Added ${successful.length} new components to temp directory`));
      s.message('New component files created');
    }

    // Step 13: Apply modified components to temp directory
    const modifiedCount = Object.values(comparison.componentChanges).reduce(
      (sum, changes) => sum + changes.modified.length,
      0
    );

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
        tempDirName // Use the temp directory we created
      );
      s.message('Modified components applied');
    }

    // Step 14: Create index.ts in temp directory only
    s.start('Generating project index file in temp directory...');
    const { generateProjectIndex } = await import('./project-index-generator');

    // Only create in temp directory for validation
    await generateProjectIndex(
      join(paths.projectRoot, tempDirName),
      remoteProject,
      localRegistry,
      projectId
    );

    s.message('Project index file created');

    // Step 15: Run validation and user interaction on complete temp directory
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
