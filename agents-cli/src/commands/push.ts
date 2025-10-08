import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Project } from '@inkeep/agents-sdk';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { env } from '../env';
import { initializeCommand } from '../utils/cli-pipeline';
import { loadEnvironmentCredentials } from '../utils/environment-loader';
import { importWithTypeScriptSupport } from '../utils/tsx-loader';

export interface PushOptions {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
}

/**
 * Load and validate project from index.ts
 */
async function loadProject(projectDir: string) {
  const indexPath = join(projectDir, 'index.ts');

  if (!existsSync(indexPath)) {
    throw new Error(`index.ts not found in project directory: ${projectDir}`);
  }

  // Import the module with TypeScript support
  const module = await importWithTypeScriptSupport(indexPath);

  // Find the first export with __type = "project"
  const exports = Object.keys(module);
  for (const exportKey of exports) {
    const value = module[exportKey];
    if (value && typeof value === 'object' && value.__type === 'project') {
      return value as Project;
    }
  }

  throw new Error(
    'No project export found in index.ts. Expected an export with __type = "project"'
  );
}

export async function pushCommand(options: PushOptions) {
  // Use standardized CLI pipeline for initialization
  const { config } = await initializeCommand({
    configPath: options.config,
    showSpinner: true,
    spinnerText: 'Loading configuration...',
    logConfig: true,
  });

  // Declare spinner at function scope so it's accessible in catch block
  let spinner: Ora | undefined;

  try {
    // Determine project directory - look for index.ts in current directory
    spinner = ora('Detecting project...').start();
    let projectDir: string;

    if (options.project) {
      // If project path is explicitly specified, use it
      projectDir = resolve(process.cwd(), options.project);
      if (!existsSync(join(projectDir, 'index.ts'))) {
        spinner.fail(`No index.ts found in specified project directory: ${projectDir}`);
        process.exit(1);
      }
    } else {
      // Look for index.ts in current directory
      const currentDir = process.cwd();
      if (existsSync(join(currentDir, 'index.ts'))) {
        projectDir = currentDir;
      } else {
        spinner.fail('No index.ts found in current directory');
        console.error(
          chalk.yellow(
            'Please run this command from a directory containing index.ts or use --project <path>'
          )
        );
        process.exit(1);
      }
    }

    spinner.succeed(`Project found: ${projectDir}`);

    // Set environment if provided
    if (options.env) {
      // Note: Setting process.env directly here because it needs to be available for child processes
      process.env.INKEEP_ENV = options.env;
      spinner.text = `Setting environment to '${options.env}'...`;
    }

    // Set environment variables for the SDK to use during project construction
    // This ensures the project is created with the correct tenant ID from the start
    const originalTenantId = process.env.INKEEP_TENANT_ID;
    const originalApiUrl = process.env.INKEEP_API_URL;

    process.env.INKEEP_TENANT_ID = config.tenantId;
    process.env.INKEEP_API_URL = config.agentsManageApiUrl;

    // Load project from index.ts
    spinner.text = 'Loading project from index.ts...';
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

    spinner.succeed('Project loaded successfully');

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
      spinner.text = `Loading credentials for environment '${options.env}'...`;

      try {
        const credentials = await loadEnvironmentCredentials(projectDir, options.env);
        project.setCredentials(credentials);

        spinner.text = 'Project loaded with credentials';
        console.log(chalk.gray(`  • Environment: ${options.env}`));
        console.log(chalk.gray(`  • Credentials loaded: ${Object.keys(credentials).length}`));
      } catch (error: any) {
        spinner.fail('Failed to load environment credentials');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }

    // Dump project data to JSON file if --json flag is set
    if (options.json) {
      spinner.text = 'Generating project data JSON...';

      try {
        // Generate the project definition without initializing
        const projectDefinition = await (project as any).toFullProjectDefinition();

        // Create the JSON file path
        const jsonFilePath = join(projectDir, `project.json`);

        // Write the project data to JSON file
        const fs = await import('node:fs/promises');
        await fs.writeFile(jsonFilePath, JSON.stringify(projectDefinition, null, 2));

        spinner.succeed(`Project data saved to ${jsonFilePath}`);
        console.log(chalk.gray(`  • File: ${jsonFilePath}`));
        console.log(chalk.gray(`  • Size: ${JSON.stringify(projectDefinition).length} bytes`));

        // Show a summary of what was saved
        const graphCount = Object.keys(projectDefinition.graphs || {}).length;
        const toolCount = Object.keys(projectDefinition.tools || {}).length;
        const agentCount = Object.values(projectDefinition.graphs || {}).reduce(
          (total: number, graph: any) => {
            return total + Object.keys(graph.agents || {}).length;
          },
          0
        );

        console.log(chalk.cyan('\n📊 Project Data Summary:'));
        console.log(chalk.gray(`  • Graphs: ${graphCount}`));
        console.log(chalk.gray(`  • Tools: ${toolCount}`));
        console.log(chalk.gray(`  • Agents: ${agentCount}`));

        // Exit after generating JSON (don't initialize the project)
        console.log(chalk.green('\n✨ JSON file generated successfully!'));
        process.exit(0);
      } catch (error: any) {
        spinner.fail('Failed to generate JSON file');
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }

    // Initialize the project (this will push to the backend)
    spinner.start('Initializing project...');
    await project.init();

    // Get project details
    const projectId = project.getId();
    const projectName = project.getName();
    const stats = project.getStats();

    spinner.succeed(`Project "${projectName}" (${projectId}) pushed successfully`);

    // Display summary
    console.log(chalk.cyan('\n📊 Project Summary:'));
    console.log(chalk.gray(`  • Project ID: ${projectId}`));
    console.log(chalk.gray(`  • Name: ${projectName}`));
    console.log(chalk.gray(`  • Graphs: ${stats.graphCount}`));
    console.log(chalk.gray(`  • Tenant: ${stats.tenantId}`));

    // Display graph details if any
    const graphs = project.getGraphs();
    if (graphs.length > 0) {
      console.log(chalk.cyan('\n📊 Graph Details:'));
      for (const graph of graphs) {
        const graphStats = graph.getStats();
        console.log(
          chalk.gray(`  • ${graph.getName()} (${graph.getId()}): ${graphStats.agentCount} agents`)
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
          const credType = (credData as any).type || 'unknown';
          const storeId = (credData as any).credentialStoreId || 'unknown';

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

    // Provide next steps
    console.log(chalk.green('\n✨ Next steps:'));
    console.log(chalk.gray(`  • Test your project: inkeep chat`));
    console.log(chalk.gray(`  • View all graphs: inkeep list-graphs`));

    // Force exit to avoid hanging due to OpenTelemetry or other background tasks
    process.exit(0);
  } catch (_error: unknown) {
    if (spinner) {
      spinner.fail('Failed to push project');
    }
    const error = _error as Error;
    console.error(chalk.red('Error:'), error.message);

    if (error.stack && env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}
