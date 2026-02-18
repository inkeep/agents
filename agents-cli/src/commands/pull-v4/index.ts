/**
 * Pull v3 - Clean, efficient project generation
 *
 * Step 1: Validate and compile existing code
 * Step 2: Compare project with DB to detect ALL changes
 * Step 3: Classify changes as new vs modified components
 * Step 4: Generate new components deterministically
 * Step 5: Use LLM to correct modified components
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import chalk from 'chalk';

// Increase max listeners to prevent warnings during complex CLI flows
// This is needed because @clack/prompts + multiple interactive prompts + spinners all add listeners
EventEmitter.defaultMaxListeners = 20;

/**
 * Clean up stdin state between interactive prompts to prevent listener leaks
 */
function resetStdinState(): void {
  process.stdin.removeAllListeners('data');
  process.stdin.removeAllListeners('keypress');
  process.stdin.removeAllListeners('end');
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  if (!process.stdin.isPaused()) {
    process.stdin.pause();
  }
}

import { ManagementApiClient } from '../../api';
import { performBackgroundVersionCheck } from '../../utils/background-version-check';
import { initializeCommand } from '../../utils/cli-pipeline';
import { loadProject } from '../../utils/project-loader';
import {
  checkAndPromptForStaleComponentCleanup,
  cleanupStaleComponents,
  copyProjectToTemp,
} from './component-updater';
import { introspectGenerate } from './introspect-generator';
import { compareProjects } from './project-comparator';
import { extractSubAgents } from './utils/component-registry';

export interface PullV3Options {
  project?: string;
  config?: string;
  profile?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  force?: boolean;
  introspect?: boolean;
  all?: boolean;
  tag?: string;
  quiet?: boolean;
  /** Internal: used for batch operations to return results instead of calling process.exit() */
  _batchMode?: boolean;
}

export interface PullResult {
  success: boolean;
  skipped?: boolean;
  upToDate?: boolean;
  error?: string;
}

interface BatchPullResult {
  projectId: string;
  projectName?: string;
  targetDir: string;
  success: boolean;
  error?: string;
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
  skillsDir: string;
}

/**
 * Create project directory structure
 */
function createProjectStructure(projectDir: string): ProjectPaths {
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
    skillsDir: join(projectRoot, 'skills'),
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
export function enrichCanDelegateToWithTypes(project: FullProjectDefinition): void {
  // Get all available component IDs by type
  const agentIds = new Set(project.agents ? Object.keys(project.agents) : []);
  const subAgentIds = new Set(Object.keys(extractSubAgents(project)));
  const externalAgentIds = new Set(
    project.externalAgents ? Object.keys(project.externalAgents) : []
  );

  // Function to enrich a canDelegateTo array
  const enrichCanDelegateToArray = (canDelegateTo: any[]) => {
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
        continue; // Leave as string if we can't determine the type
      }

      // Replace the string with the enriched object
      canDelegateTo[i] = enrichedItem;
    }
  };

  // Process all agents
  if (project.agents) {
    for (const agentData of Object.values(project.agents)) {
      // Process subAgents within agents
      if (agentData.subAgents) {
        for (const subAgentData of Object.values(agentData.subAgents)) {
          if (subAgentData.canDelegateTo) {
            enrichCanDelegateToArray(subAgentData.canDelegateTo);
          }
        }
      }
    }
  }
}

/**
 * Read existing project from filesystem if it exists
 */
async function readExistingProject(projectRoot: string): Promise<FullProjectDefinition | null> {
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
  } catch {
    // If there's any error parsing the existing project, treat as if it doesn't exist
    return null;
  }
}

/**
 * Main pull-v3 command
 * @returns PullResult when in batch mode, otherwise void (exits process)
 */
export async function pullV4Command(options: PullV3Options): Promise<PullResult | undefined> {
  // Handle --all flag for batch operations
  if (options.all) {
    await pullAllProjects(options);
    return;
  }

  const batchMode = options._batchMode ?? false;

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

  // Background version check (skip in batch mode - already done)
  if (!batchMode) {
    performBackgroundVersionCheck();
  }

  console.log(chalk.blue('\nInkeep Pull:'));
  if (options.introspect) {
    console.log(chalk.gray('  Introspect mode • Complete regeneration • No comparison needed'));
  } else {
    console.log(chalk.gray('  Smart comparison • Detect all changes • Targeted updates'));
  }

  const s = p.spinner();

  try {
    // Step 1: Load configuration (same as push command)
    const { config, isCI } = await initializeCommand({
      configPath: options.config,
      profileName: options.profile,
      tag: options.tag,
      showSpinner: true,
      spinnerText: 'Loading configuration...',
      logConfig: true,
      quiet: options.quiet,
    });

    // Step 2: Determine project directory and ID
    s.start('Detecting project...');
    let projectDir: string;
    let projectId: string;
    let localProjectForId: any = null;

    const currentDir = process.cwd();
    const hasIndexInCurrent = existsSync(join(currentDir, 'index.ts'));

    if (hasIndexInCurrent) {
      // We're in a project directory
      projectDir = currentDir;

      s.start('Loading local project...');
      try {
        localProjectForId = await loadProject(projectDir);
        const localProjectId = localProjectForId.getId();

        if (options.project) {
          // Validate that --project matches local project ID
          if (localProjectId !== options.project) {
            s.stop('Project ID mismatch');
            console.error(
              chalk.red(
                `Local project ID "${localProjectId}" doesn't match --project "${options.project}"`
              )
            );
            console.error(
              chalk.yellow('Either remove --project flag or ensure it matches the local project ID')
            );
            if (batchMode) {
              return { success: false, error: 'Project ID mismatch' };
            }
            process.exit(1);
          }
        }

        projectId = localProjectId;
        s.stop(`Using local project: ${projectId}`);
      } catch (error) {
        s.stop('Failed to load local project');
        throw new Error(
          `Could not load local project: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      // No index.ts in current directory
      if (!options.project) {
        s.stop('No index.ts found in current directory');
        console.error(
          chalk.yellow(
            'Please run this command from a directory containing index.ts or use --project <project-id>'
          )
        );
        if (batchMode) {
          return { success: false, error: 'No index.ts found and no --project specified' };
        }
        process.exit(1);
      }

      // Try --project as directory path first
      const projectPath = resolve(currentDir, options.project);
      const hasIndexInPath = existsSync(join(projectPath, 'index.ts'));

      if (hasIndexInPath) {
        // --project is a valid directory path
        projectDir = projectPath;
        s.start('Loading project from specified path...');
        try {
          localProjectForId = await loadProject(projectDir);
          projectId = localProjectForId.getId();
          s.stop(`Using project from path: ${projectId}`);
        } catch (error) {
          s.stop('Failed to load project from path');
          throw new Error(
            `Could not load project from ${projectPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        // Treat --project as project ID, create subdirectory
        projectId = options.project;
        projectDir = join(currentDir, projectId);
        s.stop(`Creating new project directory: ${projectDir}`);
      }
    }

    // Step 4: Fetch project data from API
    s.start(`Fetching project: ${projectId}`);

    const apiClient = await ManagementApiClient.create(
      config.agentsApiUrl,
      options.config,
      config.tenantId,
      projectId,
      isCI,
      config.agentsApiKey
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
        }
      }
    }

    // Filter out project-level tools from individual agents
    // The API includes project-level tools in each agent's tools field, but our generated
    // code structure keeps tools separate and imports them via canUse relationships
    if (remoteProject.agents && remoteProject.tools) {
      const projectToolIds = Object.keys(remoteProject.tools);

      for (const agentData of Object.values(remoteProject.agents) as any[]) {
        if (agentData.tools) {
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
        }
      }
    }

    // Enrich canDelegateTo references with component type information
    enrichCanDelegateToWithTypes(remoteProject);

    s.message('Project data fetched');

    if (options.json) {
      console.log(JSON.stringify(remoteProject, null, 2));
      restoreLogLevel();
      return;
    }

    // Step 5: Set up project structure
    const paths = createProjectStructure(projectDir);

    if (remoteProject.skills && Object.keys(remoteProject.skills).length) {
      const { generateSkills } = await import('./components/skill-generator');
      await generateSkills(remoteProject.skills, paths.skillsDir);
    }

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
      if (batchMode) {
        return { success: true };
      }
      process.exit(0);
    }

    // Step 7: Read existing project and compare
    // s.start('Reading existing project...');
    const localProject = await readExistingProject(paths.projectRoot);

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
        nameGroups.get(comp.name)?.push(comp);
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
    const comparison = await compareProjects(localProject, remoteProject, options.debug);

    if (!comparison.hasChanges && !options.force) {
      s.stop();
      console.log(chalk.green('✅ Project is already up to date'));
      console.log(chalk.gray('   No differences detected between local and remote projects'));
      restoreLogLevel();
      if (batchMode) {
        return { success: true, upToDate: true };
      }
      process.exit(0);
    }

    s.message(`Detected ${comparison.changeCount} differences`);

    // Step 11: Create temp directory and copy existing project (or start empty)
    const tempDirName = `.temp-validation-${Date.now()}`;
    s.start('Preparing temp directory...');

    let performedCleanup = false;

    if (localProject) {
      // Copy existing project to temp directory
      copyProjectToTemp(paths.projectRoot, tempDirName);
      console.log(chalk.green(`✅ Existing project copied to temp directory`));

      // Check for stale components and ask user permission to clean them up (in temp directory first)
      s.start('Checking for stale components...');
      const shouldCleanupStale = await checkAndPromptForStaleComponentCleanup(
        remoteProject,
        localRegistry
      );

      // Reset stdin state after interactive prompt to prevent listener leaks
      resetStdinState();

      if (shouldCleanupStale) {
        s.start('Cleaning up stale components from temp directory...');
        await cleanupStaleComponents(paths.projectRoot, tempDirName, remoteProject, localRegistry);
        console.log(chalk.green(`✅ Stale components cleaned up from temp directory`));
        performedCleanup = true;
      }
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

    let newComponentResults: any[] = [];
    if (newComponentCount > 0) {
      s.start('Creating new component files in temp directory...');
      const { createNewComponents } = await import('./new-component-generator');
      newComponentResults = await createNewComponents(
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
          nameGroups.get(comp.name)?.push(comp);
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
      // Stop spinner - updateModifiedComponents will log its own progress
      s.stop();
      const { updateModifiedComponents } = await import('./component-updater');

      // Transform new component results for LLM context
      const newComponentsForContext =
        newComponentResults && newComponentResults.length > 0
          ? newComponentResults
              .filter((result) => result.success)
              .map((result) => ({
                componentId: result.componentId,
                componentType: result.componentType,
                filePath: result.filePath.replace(`${paths.projectRoot}/`, ''), // Convert to relative path
              }))
          : undefined;

      await updateModifiedComponents(
        comparison,
        remoteProject,
        localRegistry,
        paths.projectRoot,
        options.debug,
        tempDirName, // Use the temp directory we created
        newComponentsForContext
      );
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
    if (newComponentCount > 0 || modifiedCount > 0 || performedCleanup) {
      // Stop spinner before validation - validateTempDirectory handles its own user interaction
      s.stop('Running validation on complete project...');
      const { validateTempDirectory } = await import('./project-validator');
      const validationResult = await validateTempDirectory(
        paths.projectRoot,
        tempDirName,
        remoteProject,
        { skipExit: batchMode }
      );
      if (batchMode) {
        restoreLogLevel();
        return { success: validationResult.success, upToDate: validationResult.upToDate };
      }
      // Note: validateTempDirectory calls process.exit() internally when not in batch mode
    } else {
      s.stop();
      console.log(chalk.green('\n✅ No changes detected - project is up to date'));
    }

    restoreLogLevel();
    if (batchMode) {
      return { success: true };
    }
    process.exit(0);
  } catch (error) {
    s.stop();
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    if (options.debug && error instanceof Error) {
      console.error(chalk.red(error.stack || ''));
    }
    restoreLogLevel();
    if (batchMode) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
    process.exit(1);
  }
}

/**
 * Pull all projects for the current tenant
 * Uses smart comparison with LLM merging for existing projects, introspect for new projects
 */
async function pullAllProjects(options: PullV3Options): Promise<void> {
  console.log(chalk.blue('\n🔄 Batch Pull: Sequential processing with smart comparison\n'));
  console.log(
    chalk.gray('  • Existing projects: Smart comparison + LLM merging + confirmation prompts')
  );
  console.log(chalk.gray('  • New projects: Fresh generation with introspect mode\n'));

  // Background version check (only once for batch)
  performBackgroundVersionCheck();

  // Load configuration first
  const { config, isCI } = await initializeCommand({
    configPath: options.config,
    profileName: options.profile,
    tag: options.tag,
    showSpinner: true,
    spinnerText: 'Loading configuration...',
    logConfig: true,
    quiet: options.quiet,
  });

  const s = p.spinner();

  try {
    // Fetch all projects from the API
    s.start('Fetching project list from API...');
    const apiClient = await ManagementApiClient.create(
      config.agentsApiUrl,
      options.config,
      config.tenantId,
      undefined,
      isCI,
      config.agentsApiKey
    );

    const projects = await apiClient.listAllProjects();
    s.stop(`Found ${projects.length} project(s)`);

    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found for this tenant.'));
      process.exit(0);
    }

    // Categorize projects
    const existingProjects: typeof projects = [];
    const newProjects: typeof projects = [];

    for (const project of projects) {
      const targetDir = join(process.cwd(), project.id);
      if (existsSync(join(targetDir, 'index.ts'))) {
        existingProjects.push(project);
      } else {
        newProjects.push(project);
      }
    }

    console.log(chalk.gray('\nProjects to pull:\n'));
    if (existingProjects.length > 0) {
      console.log(chalk.cyan('  Existing (smart comparison):'));
      for (const project of existingProjects) {
        console.log(chalk.gray(`    • ${project.name || project.id} (${project.id})`));
      }
    }
    if (newProjects.length > 0) {
      console.log(chalk.cyan('  New (introspect):'));
      for (const project of newProjects) {
        console.log(chalk.gray(`    • ${project.name || project.id} (${project.id})`));
      }
    }
    console.log();

    const results: BatchPullResult[] = [];
    const total = projects.length;

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const progress = `[${i + 1}/${total}]`;

      console.log(chalk.cyan(`\n${'─'.repeat(60)}`));
      console.log(chalk.cyan(`${progress} Pulling ${project.name || project.id}...`));

      const result = await pullSingleProject(project.id, project.name, options, config, isCI);
      results.push(result);

      if (result.success) {
        console.log(
          chalk.green(`\n  ✓ ${result.projectName || result.projectId} → ${result.targetDir}`)
        );
      } else {
        console.log(chalk.red(`\n  ✗ ${result.projectName || result.projectId}: ${result.error}`));
      }
    }

    // Print summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(chalk.cyan(`\n${'═'.repeat(60)}`));
    console.log(chalk.cyan('📊 Batch Pull Summary:'));
    console.log(chalk.green(`  ✓ Succeeded: ${succeeded}`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ Failed: ${failed}`));

      console.log(chalk.red('\nFailed projects:'));
      for (const result of results) {
        if (!result.success) {
          console.log(chalk.red(`  • ${result.projectId}: ${result.error}`));
        }
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    s.stop();
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Pull a single project (used by batch operations)
 * Uses smart comparison flow for existing projects, introspect for new projects
 */
async function pullSingleProject(
  projectId: string,
  projectName: string | undefined,
  options: PullV3Options,
  config: any,
  isCI?: boolean
): Promise<BatchPullResult> {
  const targetDir = join(process.cwd(), projectId);
  const hasExistingProject = existsSync(join(targetDir, 'index.ts'));

  try {
    if (hasExistingProject) {
      // Project exists locally - use smart comparison flow with LLM merging and user prompts
      console.log(chalk.gray(`   📂 Existing project found - using smart comparison mode`));

      // Save current directory and change to project directory
      const originalDir = process.cwd();
      process.chdir(targetDir);

      try {
        // Call the main pull command in batch mode (returns results instead of exiting)
        const result = await pullV3Command({
          ...options,
          project: projectId,
          all: false, // Don't recurse into batch mode
          _batchMode: true,
        });

        // Restore original directory
        process.chdir(originalDir);

        if (result && typeof result === 'object') {
          return {
            projectId,
            projectName,
            targetDir,
            success: result.success,
            error: result.error,
          };
        }

        return {
          projectId,
          projectName,
          targetDir,
          success: true,
        };
      } catch (error) {
        // Restore original directory even on error
        process.chdir(originalDir);
        throw error;
      }
    }

    // No existing project - use introspect mode to generate fresh
    console.log(chalk.gray(`   🆕 New project - using introspect mode`));

    // Suppress SDK logging
    const originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'silent';

    const restoreLogLevel = () => {
      if (originalLogLevel !== undefined) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    };

    // Fetch project data from API
    const apiClient = await ManagementApiClient.create(
      config.agentsApiUrl,
      options.config,
      config.tenantId,
      projectId,
      isCI,
      config.agentsApiKey
    );

    const remoteProject = await apiClient.getFullProject(projectId);

    // Create project structure
    const paths = createProjectStructure(targetDir);

    // Generate all files using introspect mode for new projects
    await introspectGenerate(
      remoteProject,
      paths,
      options.env || 'development',
      false // debug
    );

    restoreLogLevel();

    return {
      projectId,
      projectName: projectName || remoteProject.name,
      targetDir,
      success: true,
    };
  } catch (error) {
    return {
      projectId,
      projectName,
      targetDir,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
