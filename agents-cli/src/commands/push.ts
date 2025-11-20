import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { env } from '../env';
import { performBackgroundVersionCheck } from '../utils/background-version-check';
import { initializeCommand } from '../utils/cli-pipeline';
import { loadEnvironmentCredentials } from '../utils/environment-loader';
import { loadProject } from '../utils/project-loader';
import { normalizeBaseUrl } from '../utils/url';

export interface PushOptions {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
}

export async function pushCommand(options: PushOptions) {
  // Perform background version check (non-blocking)
  performBackgroundVersionCheck();

  // Use standardized CLI pipeline for initialization
  const { config } = await initializeCommand({
    configPath: options.config,
    showSpinner: true,
    spinnerText: 'Loading configuration...',
    logConfig: true,
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
      // Look for index.ts in current directory
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

    // Display project URL
    const baseUrl = normalizeBaseUrl(config.manageUiUrl || 'http://localhost:3000');
    const projectUrl = `${baseUrl}/${config.tenantId}/projects/${projectId}`;
    console.log(chalk.cyan('\n🔗 Project URL:'));
    console.log(chalk.blue.underline(`  ${projectUrl}`));

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
