import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { env } from '../env';
import { performBackgroundVersionCheck } from '../utils/background-version-check';
import { initializeCommand } from '../utils/cli-pipeline';
import { findAllConfigFiles, findConfigFile } from '../utils/config';
import { loadEnvironmentCredentials } from '../utils/environment-loader';
import { loadProject } from '../utils/project-loader';

export interface PushOptions {
  project?: string;
  config?: string;
  profile?: string;
  env?: string;
  json?: boolean;
  all?: boolean;
  tag?: string;
  quiet?: boolean;
}

interface BatchPushResult {
  projectDir: string;
  projectId?: string;
  projectName?: string;
  success: boolean;
  error?: string;
}

export async function pushCommand(options: PushOptions): Promise<void> {
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  // Handle --all flag for batch operations
  if (options.all) {
    await pushAllProjects(options);
    return;
  }

  // Use standardized CLI pipeline for initialization
  const { config } = await initializeCommand({
    configPath: options.config,
    profileName: options.profile,
    tag: options.tag,
    showSpinner: true,
    spinnerText: 'Loading configuration...',
    logConfig: true,
    quiet: options.quiet,
  });

  // Declare spinner at function scope so it's accessible in catch block
  const s = p.spinner();

  try {
    // Determine project directory - look for index.ts in current directory
    s.start('Detecting project...');
    let projectDir: string;

    if (options.project) {
      // If project path is explicitly specified, use it
      projectDir = resolve(process.cwd(), options.project);
      if (!existsSync(join(projectDir, 'index.ts'))) {
        s.stop(`No index.ts found in specified project directory: ${projectDir}`);
        process.exit(1);
      }
    } else {
      // Look for index.ts in current directory first
      const currentDir = process.cwd();
      if (existsSync(join(currentDir, 'index.ts'))) {
        projectDir = currentDir;
      } else {
        // Try to find config file and use its directory
        const configFile = findConfigFile(currentDir, options.tag);
        if (configFile) {
          const configDir = dirname(configFile);
          if (existsSync(join(configDir, 'index.ts'))) {
            projectDir = configDir;
          } else {
            s.stop('No index.ts found in config directory');
            console.error(
              chalk.yellow(
                'Please run this command from a directory containing index.ts or use --project <path>'
              )
            );
            process.exit(1);
          }
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
    }

    s.stop(`Project found: ${projectDir}`);

    // Set environment if provided
    if (options.env) {
      // Note: Setting process.env directly here because it needs to be available for child processes
      process.env.INKEEP_ENV = options.env;
      s.start(`Setting environment to '${options.env}'...`);
    }

    // Set environment variables for the SDK to use during project construction
    // This ensures the project is created with the correct tenant ID from the start
    const originalTenantId = process.env.INKEEP_TENANT_ID;
    const originalApiUrl = process.env.INKEEP_API_URL;

    process.env.INKEEP_TENANT_ID = config.tenantId;
    process.env.INKEEP_API_URL = config.agentsManageApiUrl;

    // Load project from index.ts
    s.start('Loading project from index.ts...');
    const project = await loadProject(projectDir);

    // Restore original environment variables
    if (originalTenantId !== undefined) {
      process.env.INKEEP_TENANT_ID = originalTenantId;
    } else {
      delete process.env.INKEEP_TENANT_ID;
    }
    if (originalApiUrl !== undefined) {
      process.env.INKEEP_API_URL = originalApiUrl;
    } else {
      delete process.env.INKEEP_API_URL;
    }

    s.stop('Project loaded successfully');

    // Set configuration on the project (still needed for consistency)
    if (typeof project.setConfig === 'function') {
      project.setConfig(
        config.tenantId,
        config.agentsManageApiUrl,
        undefined, // models - not needed here as they come from the project definition
        config.agentsManageApiKey
      );
    }

    // Load environment credentials if --env flag is provided
    if (options.env && typeof project.setCredentials === 'function') {
      s.start(`Loading credentials for environment '${options.env}'...`);

      try {
        const credentials = await loadEnvironmentCredentials(projectDir, options.env);
        project.setCredentials(credentials);

        s.stop('Project loaded with credentials');
        console.log(chalk.gray(`  • Environment: ${options.env}`));
        console.log(chalk.gray(`  • Credentials loaded: ${Object.keys(credentials).length}`));
      } catch (error: unknown) {
        s.stop('Failed to load environment credentials');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    }

    // Dump project data to JSON file if --json flag is set
    if (options.json) {
      s.start('Generating project data JSON...');

      try {
        // Generate the project definition without initializing
        const projectDefinition = await project.getFullDefinition();

        // Create the JSON file path
        const jsonFilePath = join(projectDir, `project.json`);

        // Write the project data to JSON file
        const fs = await import('node:fs/promises');
        await fs.writeFile(jsonFilePath, JSON.stringify(projectDefinition, null, 2));

        s.stop(`Project data saved to ${jsonFilePath}`);
        console.log(chalk.gray(`  • File: ${jsonFilePath}`));
        console.log(chalk.gray(`  • Size: ${JSON.stringify(projectDefinition).length} bytes`));

        // Show a summary of what was saved
        const agentCount = Object.keys(projectDefinition.agents || {}).length;
        const toolCount = Object.keys(projectDefinition.tools || {}).length;
        const subAgentCount = Object.values(projectDefinition.agents || {}).reduce(
          (total, agent) => {
            return total + Object.keys(agent.subAgents || {}).length;
          },
          0
        );

        console.log(chalk.cyan('\n📊 Project Data Summary:'));
        console.log(chalk.gray(`  • Agent: ${agentCount}`));
        console.log(chalk.gray(`  • Tools: ${toolCount}`));
        console.log(chalk.gray(`  • SubAgent: ${subAgentCount}`));

        // Exit after generating JSON (don't initialize the project)
        console.log(chalk.green('\n✨ JSON file generated successfully!'));
        process.exit(0);
      } catch (error: unknown) {
        s.stop('Failed to generate JSON file');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    }

    // Initialize the project (this will push to the backend)
    s.start('Initializing project...');
    await project.init();

    // Get project details
    const projectId = project.getId();
    const projectName = project.getName();
    const stats = project.getStats();

    s.stop(`Project "${projectName}" (${projectId}) pushed successfully`);

    // Display summary
    console.log(chalk.cyan('\n📊 Project Summary:'));
    console.log(chalk.gray(`  • Project ID: ${projectId}`));
    console.log(chalk.gray(`  • Name: ${projectName}`));
    console.log(chalk.gray(`  • Agent: ${stats.agentCount}`));
    console.log(chalk.gray(`  • Tenant: ${stats.tenantId}`));

    // Display agent details if exsits
    const agents = project.getAgents();
    if (agents.length > 0) {
      console.log(chalk.cyan('\n📊 Agent Details:'));
      for (const agent of agents) {
        const agentStats = agent.getStats();
        console.log(
          chalk.gray(`  • ${agent.getName()} (${agent.getId()}): ${agentStats.agentCount} agents`)
        );
      }
    }

    // Display credential tracking information
    try {
      const credentialTracking = await project.getCredentialTracking();
      const credentialCount = Object.keys(credentialTracking.credentials).length;

      if (credentialCount > 0) {
        console.log(chalk.cyan('\n🔐 Credentials:'));
        console.log(chalk.gray(`  • Total credentials: ${credentialCount}`));

        // Show credential details
        for (const [credId, credData] of Object.entries(credentialTracking.credentials)) {
          const usageInfo = credentialTracking.usage[credId] || [];
          const credType = credData.type || 'unknown';
          const storeId = credData.credentialStoreId || 'unknown';

          console.log(chalk.gray(`  • ${credId} (${credType}, store: ${storeId})`));

          if (usageInfo.length > 0) {
            const usageByType: Record<string, number> = {};
            for (const usage of usageInfo) {
              usageByType[usage.type] = (usageByType[usage.type] || 0) + 1;
            }

            const usageSummary = Object.entries(usageByType)
              .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
              .join(', ');

            console.log(chalk.gray(`      Used by: ${usageSummary}`));
          }
        }
      }
    } catch (_error) {
      // Silently fail if credential tracking is not available
      if (env.DEBUG) {
        console.error(chalk.yellow('Could not retrieve credential tracking information'));
      }
    }

    // Display project URL if available
    if (config.manageUiUrl) {
      const projectUrl = `${config.manageUiUrl}/${config.tenantId}/projects/${projectId}`;
      console.log(chalk.cyan('\n🔗 Project URL:'));
      console.log(chalk.blue.underline(`  ${projectUrl}`));
    }

    // Provide next steps
    console.log(chalk.green('\n✨ Next steps:'));
    console.log(chalk.gray(`  • View all agents: inkeep list-agent`));

    // Force exit to avoid hanging due to OpenTelemetry or other background tasks
    process.exit(0);
  } catch (_error: unknown) {
    s.stop('Failed to push project');
    const error = _error as Error;
    console.error(chalk.red('Error:'), error.message);

    if (error.stack && env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}

/**
 * Check if an index.ts file exports a project (has __type = 'project')
 */
async function isProjectDirectory(dir: string): Promise<boolean> {
  const indexPath = join(dir, 'index.ts');
  if (!existsSync(indexPath)) {
    return false;
  }

  try {
    // Dynamically import to check for project export
    const { importWithTypeScriptSupport } = await import('../utils/tsx-loader');
    const module = await importWithTypeScriptSupport(indexPath);

    // Check if any export has __type = 'project'
    for (const key of Object.keys(module)) {
      const value = module[key];
      if (value && typeof value === 'object' && value.__type === 'project') {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Find all directories containing index.ts that export a project
 */
async function findAllProjectDirs(
  rootDir: string,
  excludeDirs: string[] = ['node_modules', '.git', 'dist', 'build', '.temp-validation']
): Promise<string[]> {
  const projectDirs: string[] = [];

  async function scanDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      return;
    }

    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }

    // Check if this directory has an index.ts that exports a project
    if (existsSync(join(dir, 'index.ts'))) {
      const isProject = await isProjectDirectory(dir);
      if (isProject) {
        projectDirs.push(dir);
        // Don't recurse into subdirectories of a project
        return;
      }
    }

    // Recurse into subdirectories
    for (const item of items) {
      const fullPath = join(dir, item);

      // Skip excluded directories
      if (excludeDirs.includes(item)) {
        continue;
      }

      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          await scanDirectory(fullPath);
        }
      } catch {
        // Skip files/directories we can't stat
      }
    }
  }

  await scanDirectory(rootDir);
  return projectDirs.sort();
}

/**
 * Push all projects found in current directory tree
 */
async function pushAllProjects(options: PushOptions): Promise<void> {
  console.log(chalk.blue('\n🚀 Batch Push: Finding all projects...\n'));

  // Strategy 1: Find all config files and check for index.ts in same directory
  const configFiles = findAllConfigFiles(process.cwd(), options.tag);
  const projectDirsFromConfig: string[] = [];
  for (const configFile of configFiles) {
    const dir = dirname(configFile);
    if (existsSync(join(dir, 'index.ts'))) {
      projectDirsFromConfig.push(dir);
    }
  }

  // Strategy 2: Find all index.ts files that export a project and can find a config (supports shared config)
  const allIndexDirs = await findAllProjectDirs(process.cwd());
  const projectDirsFromIndex: string[] = [];
  for (const dir of allIndexDirs) {
    // Skip if already found via config file in same directory
    if (projectDirsFromConfig.includes(dir)) {
      continue;
    }
    // Check if this directory can find a config file (walking up the tree)
    const configFile = findConfigFile(dir, options.tag);
    if (configFile) {
      projectDirsFromIndex.push(dir);
    }
  }

  // Combine both strategies
  const projectDirs = [...projectDirsFromConfig, ...projectDirsFromIndex].sort();

  if (projectDirs.length === 0) {
    const configPattern = options.tag ? `${options.tag}.__inkeep.config.ts__` : 'inkeep.config.ts';
    console.error(chalk.red('No valid projects found.'));
    console.log(
      chalk.yellow(
        `\nHint: Projects must have an index.ts file and access to an ${configPattern} file`
      )
    );
    console.log(chalk.yellow('      (either in the same directory or in a parent directory).'));
    process.exit(1);
  }

  console.log(chalk.gray(`Found ${projectDirs.length} project(s) to push:\n`));
  for (const dir of projectDirs) {
    const relativePath = dir === process.cwd() ? '.' : dir.replace(`${process.cwd()}/`, '');
    console.log(chalk.gray(`  • ${relativePath}`));
  }
  console.log();

  const results: BatchPushResult[] = [];
  const total = projectDirs.length;

  for (let i = 0; i < projectDirs.length; i++) {
    const projectDir = projectDirs[i];
    const relativePath =
      projectDir === process.cwd() ? '.' : projectDir.replace(`${process.cwd()}/`, '');
    const progress = `[${i + 1}/${total}]`;

    console.log(chalk.cyan(`${progress} Pushing ${relativePath}...`));

    const result = await pushSingleProject(projectDir, options);
    results.push(result);

    if (result.success) {
      console.log(
        chalk.green(`  ✓ ${result.projectName || result.projectId || basename(projectDir)}`)
      );
    } else {
      console.log(chalk.red(`  ✗ ${basename(projectDir)}: ${result.error}`));
    }
  }

  // Print summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(chalk.cyan('\n📊 Batch Push Summary:'));
  console.log(chalk.green(`  ✓ Succeeded: ${succeeded}`));
  if (failed > 0) {
    console.log(chalk.red(`  ✗ Failed: ${failed}`));

    console.log(chalk.red('\nFailed projects:'));
    for (const result of results) {
      if (!result.success) {
        const relativePath =
          result.projectDir === process.cwd()
            ? '.'
            : result.projectDir.replace(`${process.cwd()}/`, '');
        console.log(chalk.red(`  • ${relativePath}: ${result.error}`));
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Push a single project (used by batch operations)
 */
async function pushSingleProject(
  projectDir: string,
  options: PushOptions
): Promise<BatchPushResult> {
  try {
    // Find config file for this project directory
    const configFile = findConfigFile(projectDir, options.tag);

    // Use standardized CLI pipeline for initialization
    const { config } = await initializeCommand({
      configPath: configFile || undefined,
      profileName: options.profile,
      tag: options.tag,
      showSpinner: false,
      logConfig: false,
    });

    // Set environment variables for the SDK
    const originalTenantId = process.env.INKEEP_TENANT_ID;
    const originalApiUrl = process.env.INKEEP_API_URL;

    process.env.INKEEP_TENANT_ID = config.tenantId;
    process.env.INKEEP_API_URL = config.agentsManageApiUrl;

    // Load project from index.ts
    const project = await loadProject(projectDir);

    // Restore original environment variables
    if (originalTenantId !== undefined) {
      process.env.INKEEP_TENANT_ID = originalTenantId;
    } else {
      delete process.env.INKEEP_TENANT_ID;
    }
    if (originalApiUrl !== undefined) {
      process.env.INKEEP_API_URL = originalApiUrl;
    } else {
      delete process.env.INKEEP_API_URL;
    }

    // Set configuration on the project
    if (typeof project.setConfig === 'function') {
      project.setConfig(
        config.tenantId,
        config.agentsManageApiUrl,
        undefined,
        config.agentsManageApiKey
      );
    }

    // Load environment credentials if --env flag is provided
    if (options.env && typeof project.setCredentials === 'function') {
      const credentials = await loadEnvironmentCredentials(projectDir, options.env);
      project.setCredentials(credentials);
    }

    // Initialize the project (this will push to the backend)
    await project.init();

    return {
      projectDir,
      projectId: project.getId(),
      projectName: project.getName(),
      success: true,
    };
  } catch (error) {
    return {
      projectDir,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
