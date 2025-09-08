import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { ManagementApiClient } from '../api.js';
import type { ValidatedConfiguration } from '../utils/config.js';
import { validateConfiguration } from '../utils/config.js';

export interface ListGraphsOptions {
  tenantId?: string;
  managementApiUrl?: string;
  configFilePath?: string;
}

export async function listGraphsCommand(options: ListGraphsOptions) {
  // Validate configuration
  let config: ValidatedConfiguration;

  try {
    config = await validateConfiguration(
      options.tenantId,
      options.managementApiUrl,
      undefined, // executionApiUrl not needed for list-graphs
      options.configFilePath
    );
  } catch (error: any) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }

  // Log configuration sources for debugging
  console.log(chalk.gray('Using configuration:'));
  console.log(chalk.gray(`  • Tenant ID: ${config.sources.tenantId}`));
  console.log(chalk.gray(`  • API URL: ${config.sources.managementApiUrl}`));
  console.log();

  const api = await ManagementApiClient.create(
    config.managementApiUrl,
    options.configFilePath,
    config.tenantId
  );
  const spinner = ora('Fetching graphs...').start();

  try {
    const graphs = await api.listGraphs();
    spinner.succeed(`Found ${graphs.length} graph(s)`);

    if (graphs.length === 0) {
      console.log(chalk.gray('No graphs found. Push a graph with: inkeep push <graph-path>'));
      return;
    }

    // Create a table to display graphs
    const table = new Table({
      head: [
        chalk.cyan('Graph ID'),
        chalk.cyan('Name'),
        chalk.cyan('Default Agent'),
        chalk.cyan('Created'),
      ],
      style: {
        head: [],
        border: [],
      },
    });

    for (const graph of graphs) {
      const createdDate = graph.createdAt
        ? new Date(graph.createdAt).toLocaleDateString()
        : 'Unknown';

      table.push([
        graph.id || '',
        graph.name || graph.id || '',
        graph.defaultAgentId || chalk.gray('None'),
        createdDate,
      ]);
    }

    console.log('\n' + table.toString());
  } catch (error) {
    spinner.fail('Failed to fetch graphs');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
