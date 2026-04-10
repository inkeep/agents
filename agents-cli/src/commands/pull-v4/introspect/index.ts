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
import { styleText } from 'node:util';
import * as p from '@clack/prompts';
import type { FullProjectDefinition } from '@inkeep/agents-core';

// Increase max listeners to prevent warnings during complex CLI flows
// This is needed because @clack/prompts + multiple interactive prompts + spinners all add listeners
EventEmitter.defaultMaxListeners = 20;

import { ManagementApiClient } from '../../../api';
import { performBackgroundVersionCheck } from '../../../utils/background-version-check';
import { initializeCommand } from '../../../utils/cli-pipeline';
import { loadProject } from '../../../utils/project-loader';
import { readProjectState, writeProjectState } from '../../../utils/state';
import { withLocalStateBranch } from '../../../utils/temp-branch';
import { introspectGenerate, type ProjectPaths } from '../introspect-generator';

export interface PullV3Options {
  project?: string;
  config?: string;
  profile?: string;
  env?: string;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  force?: boolean;
  all?: boolean;
  tag?: string;
  quiet?: boolean;
  conflictStrategy?: 'ours' | 'theirs';
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

/**
 * Create project directory structure
 */
export function createProjectStructure(projectRoot: string): ProjectPaths {
  mkdirSync(projectRoot, { recursive: true });
  return {
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
}

/**
 * Enrich canDelegateTo references with component type information
 */
export function enrichCanDelegateToWithTypes(project: FullProjectDefinition): void {
  const { agents } = project;
  // Get all available component IDs by type
  const agentsIdSet = new Set(Object.keys(agents));
  const subAgentsIdSet = new Set(
    Object.values(agents).flatMap((agentData) => Object.keys(agentData.subAgents))
  );
  const externalAgentsIdSet = new Set(
    project.externalAgents ? Object.keys(project.externalAgents) : []
  );

  // Function to enrich a canDelegateTo array

  function enrichCanDelegateToArray(canDelegateTo: unknown[]): unknown[] {
    return canDelegateTo.map((item) => {
      // Skip if it's already an object (already has type info)
      if (typeof item !== 'string') return item;
      if (agentsIdSet.has(item)) return { agentId: item };
      if (subAgentsIdSet.has(item)) return { subAgentId: item };
      if (externalAgentsIdSet.has(item)) return { externalAgentId: item };
      return item;
    });
  }

  // Process all agents
  for (const { subAgents } of Object.values(project.agents)) {
    // Process subAgents within agents
    for (const subAgentData of Object.values(subAgents)) {
      if (Array.isArray(subAgentData.canDelegateTo)) {
        // @ts-expect-error
        subAgentData.canDelegateTo = enrichCanDelegateToArray(subAgentData.canDelegateTo);
      }
    }
  }
}

/**
 * Main pull v4 command
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

  console.log(styleText('blue', '\nInkeep Pull:'));
  console.log(styleText('gray', '  Smart comparison • Detect all changes • Targeted updates'));

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
    let projectDir: string;
    let projectId: string;
    let localProjectForId: any = null;

    const currentDir = process.cwd();
    const hasIndexInCurrent = existsSync(join(currentDir, 'index.ts'));

    if (hasIndexInCurrent) {
      // We're in a project directory
      projectDir = currentDir;

      try {
        localProjectForId = await loadProject(projectDir);
        const localProjectId = localProjectForId.getId();

        if (options.project) {
          // Validate that --project matches local project ID
          if (localProjectId !== options.project) {
            console.error(
              styleText(
                'red',
                `Local project ID "${localProjectId}" doesn't match --project "${options.project}"`
              )
            );
            console.error(
              styleText(
                'yellow',
                'Either remove --project flag or ensure it matches the local project ID'
              )
            );
            if (batchMode) {
              return { success: false, error: 'Project ID mismatch' };
            }
            process.exit(1);
          }
        }

        projectId = localProjectId;
        console.log(styleText('green', `◆ Using local project: ${projectId}`));
      } catch (error) {
        throw new Error(
          `Could not load local project: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      // No index.ts in current directory
      if (!options.project) {
        console.error(
          styleText(
            'yellow',
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
        try {
          localProjectForId = await loadProject(projectDir);
          projectId = localProjectForId.getId();
          console.log(styleText('green', `◆ Using project from path: ${projectId}`));
        } catch (error) {
          throw new Error(
            `Could not load project from ${projectPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        // Treat --project as project ID, create subdirectory
        projectId = options.project;
        projectDir = join(currentDir, projectId);
        console.log(styleText('green', `◆ Creating new project directory: ${projectDir}`));
      }
    }

    const existingState = readProjectState(projectId);
    const lastPulledHash = existingState?.lastPulledHash;

    if (options.debug && lastPulledHash) {
      console.log(styleText('gray', `   Last pulled hash: ${lastPulledHash}`));
    }

    const apiClient = await ManagementApiClient.create(
      config.agentsApiUrl,
      options.config,
      config.tenantId,
      projectId,
      isCI,
      config.agentsApiKey
    );

    let currentMainHash: string | undefined;
    try {
      const mainBranch = await apiClient.getBranch(projectId, 'main');
      currentMainHash = mainBranch.hash;
    } catch (error) {
      if (options.debug) {
        console.log(
          styleText(
            'gray',
            `   Could not fetch main branch hash: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
      // Non-fatal: if we can't get the hash, fall through to direct pull
    }

    if (options.debug && currentMainHash) {
      console.log(styleText('gray', `   Current main hash: ${currentMainHash}`));
    }

    let remoteProject: Awaited<ReturnType<typeof apiClient.getFullProject>> | undefined;

    if (localProjectForId && lastPulledHash) {
      const localProjectDefinition = await localProjectForId.getFullDefinition();

      // Merge main INTO temp branch so the temp branch gets a reconciled result
      // (main's changes + user's local changes). We then pull from the temp branch.
      // We must NOT merge temp into main — that would push local edits to main.
      remoteProject = await withLocalStateBranch({
        apiClient,
        projectId,
        fromCommit: lastPulledHash,
        localDefinition: localProjectDefinition,
        branchPrefix: 'cli-pull',
        fn: async (tempBranchName) => {
          const preview = await apiClient.mergePreview(projectId, {
            sourceBranch: 'main',
            targetBranch: tempBranchName,
          });

          if (preview.hasConflicts) {
            const { resolveConflictsInteractive } = await import('../merge-conflicts');
            const resolutions = await resolveConflictsInteractive(preview.conflicts, options);

            if (resolutions === null) {
              console.log(styleText('yellow', 'Pull cancelled'));
              return undefined;
            }

            await apiClient.mergeExecute(projectId, {
              sourceBranch: 'main',
              targetBranch: tempBranchName,
              sourceHash: preview.sourceHash,
              targetHash: preview.targetHash,
              resolutions,
              message: 'CLI pull: merge main into local state',
            });
          } else {
            await apiClient.mergeExecute(projectId, {
              sourceBranch: 'main',
              targetBranch: tempBranchName,
              sourceHash: preview.sourceHash,
              targetHash: preview.targetHash,
              message: 'CLI pull: merge main into local state',
            });
          }

          return await apiClient.getFullProject(projectId, tempBranchName);
        },
      });

      if (!remoteProject) {
        return;
      }
    } else {
      // Todo: we can probably just exit here because there is nothing new to pull
      remoteProject = await apiClient.getFullProject(projectId);
    }

    if (options.debug && remoteProject.functions) {
      console.log(
        styleText('gray', '   📋 Project-level functions from API:'),
        Object.keys(remoteProject.functions)
      );
      Object.entries(remoteProject.functions).forEach(([id, data]: [string, any]) => {
        console.log(
          styleText(
            'gray',
            `      ${id}: has name=${!!data.name}, has description=${!!data.description}`
          )
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
              styleText(
                'gray',
                `   Hoisted functionTools from agent ${agentId}: ${Object.keys(agentData.functionTools).join(', ')}`
              )
            );
          }
        }
        if (agentData.functions) {
          remoteProject.functions ||= {};
          const { functions } = remoteProject;
          // Only hoist agent functions if project-level functions don't already exist (clean function data)
          Object.entries(agentData.functions).forEach(([funcId, funcData]: [string, any]) => {
            // Clean function data - remove functionTool metadata that shouldn't be in functions collection
            functions[funcId] ||= {
              id: funcData.id,
              inputSchema: funcData.inputSchema,
              executeCode: funcData.executeCode,
              dependencies: funcData.dependencies,
              createdAt: '',
              updatedAt: '',
            };
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
    // @ts-expect-error -- fixme Types of property `models` are incompatible.
    enrichCanDelegateToWithTypes(remoteProject);

    console.log(styleText('green', '◆ Project data fetched'));

    if (options.json) {
      console.log(JSON.stringify(remoteProject, null, 2));
      restoreLogLevel();
      return;
    }

    // Step 5: Set up project structure
    const paths = createProjectStructure(projectDir);

    console.log(styleText('gray', 'Generating files...'));
    await introspectGenerate({
      // @ts-expect-error -- ignore Types of property 'models' are incompatible.
      project: remoteProject,
      paths,
      debug: options.debug,
    });
    console.log(styleText('green', '◆ All files generated'));

    try {
      const mainBranch = await apiClient.getBranch(projectId, 'main');
      writeProjectState(projectId, mainBranch.hash);
    } catch (error) {
      console.warn(
        styleText(
          'yellow',
          `Warning: Could not save pull state: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      console.warn(styleText('yellow', 'Future pulls may re-prompt for conflict resolution.'));
    }

    console.log(styleText('green', '\nProject synced successfully!'));
    console.log(styleText('gray', `   Location: ${paths.projectRoot}`));
    console.log(styleText('gray', `   Environment: ${options.env || 'development'}`));
    console.log(
      styleText(
        'yellow',
        '⚠️  If you encounter broken code after running `inkeep pull`, please report it at https://github.com/inkeep/agents/issues.'
      )
    );

    restoreLogLevel();
    if (batchMode) {
      return { success: true };
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.stack : String(error);
    console.error(styleText('red', `\nError: ${message}`));
    if (options.debug && error instanceof Error) {
      console.error(styleText('red', error.stack || ''));
    }
    restoreLogLevel();
    if (batchMode) {
      return { success: false, error: message };
    }
    process.exit(1);
  }
}

/**
 * Pull all projects for the current tenant
 * Uses smart comparison with LLM merging for existing projects, introspect for new projects
 */
async function pullAllProjects(options: PullV3Options): Promise<void> {
  console.log(styleText('blue', '\n🔄 Batch Pull: Sequential processing with smart comparison\n'));
  console.log(
    styleText(
      'gray',
      '  • Existing projects: Smart comparison + AST merging + confirmation prompts'
    )
  );
  console.log(styleText('gray', '  • New projects: Fresh generation with introspect mode\n'));

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

    if (!projects.length) {
      console.log(styleText('yellow', 'No projects found for this tenant.'));
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

    console.log(styleText('gray', '\nProjects to pull:\n'));
    if (existingProjects.length > 0) {
      console.log(styleText('cyan', '  Existing (smart comparison):'));
      for (const project of existingProjects) {
        console.log(styleText('gray', `    • ${project.name || project.id} (${project.id})`));
      }
    }
    if (newProjects.length > 0) {
      console.log(styleText('cyan', '  New (introspect):'));
      for (const project of newProjects) {
        console.log(styleText('gray', `    • ${project.name || project.id} (${project.id})`));
      }
    }
    console.log();

    const results: BatchPullResult[] = [];
    const total = projects.length;

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const progress = `[${i + 1}/${total}]`;

      console.log(styleText('cyan', `\n${'─'.repeat(60)}`));
      console.log(styleText('cyan', `${progress} Pulling ${project.name || project.id}...`));

      const result = await pullSingleProject(project.id, project.name, options, config, isCI);
      results.push(result);

      if (result.success) {
        console.log(
          styleText(
            'green',
            `\n  ✓ ${result.projectName || result.projectId} → ${result.targetDir}`
          )
        );
      } else {
        console.log(
          styleText('red', `\n  ✗ ${result.projectName || result.projectId}: ${result.error}`)
        );
      }
    }

    // Print summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(styleText('cyan', `\n${'═'.repeat(60)}`));
    console.log(styleText('cyan', '📊 Batch Pull Summary:'));
    console.log(styleText('green', `  ✓ Succeeded: ${succeeded}`));
    if (failed > 0) {
      console.log(styleText('red', `  ✗ Failed: ${failed}`));

      console.log(styleText('red', '\nFailed projects:'));
      for (const result of results) {
        if (!result.success) {
          console.log(styleText('red', `  • ${result.projectId}: ${result.error}`));
        }
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    s.stop();
    console.error(
      styleText('red', `\nError: ${error instanceof Error ? error.message : String(error)}`)
    );
    process.exit(1);
  }
}

/**
 * Pull a single project (used by batch operations)
 * Uses smart comparison flow for existing projects, introspect for new projects
 */
export async function pullSingleProject(
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
      console.log(styleText('gray', `   📂 Existing project found - using smart comparison mode`));

      // Save current directory and change to project directory
      const originalDir = process.cwd();
      process.chdir(targetDir);

      try {
        // Call the main pull command in batch mode (returns results instead of exiting)
        const result = await pullV4Command({
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
    console.log(styleText('gray', '   New project'));

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
    await introspectGenerate({
      // @ts-expect-error -- ignore Types of property 'models' are incompatible.
      project: remoteProject,
      paths,
    });

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
