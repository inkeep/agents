import * as p from '@clack/prompts';
import chalk from 'chalk';
import Table from 'cli-table3';
import { ManagementApiClient } from '../api';
import { initializeCommand } from '../utils/cli-pipeline';

export interface ListAgentsOptions {
  project: string; // required project ID
  config?: string;
  configFilePath?: string; // deprecated, kept for backward compatibility
}

export async function listAgentsCommand(options: ListAgentsOptions) {
  // Use standardized CLI pipeline for initialization
  const configPath = options.config || options.configFilePath;
  const { config } = await initializeCommand({
    configPath,
    showSpinner: false,
    logConfig: true,
  });

  console.log();

  const api = await ManagementApiClient.create(
    config.agentsManageApiUrl,
    configPath,
    config.tenantId,
    options.project // pass project ID as projectIdOverride
  );
  const s = p.spinner();
  s.start('Fetching agent...');

  try {
    const agents = await api.listAgents();
    s.stop(`Found ${agents.length} agent(s) in project "${options.project}"`);

    if (agents.length === 0) {
      console.log(
        chalk.gray(
          `No agent found in project "${options.project}". Define agent in your project and run: inkeep push`
        )
      );
      return;
    }

    // Create a table to display agent
    const table = new Table({
      head: [
        chalk.cyan('Agent ID'),
        chalk.cyan('Name'),
        chalk.cyan('Default Agent'),
        chalk.cyan('Created'),
      ],
      style: {
        head: [],
        border: [],
      },
    });

    for (const agent of agents) {
      const createdDate = agent.createdAt
        ? new Date(agent.createdAt).toLocaleDateString()
        : 'Unknown';

      table.push([
        agent.id || '',
        agent.name || agent.id || '',
        agent.defaultSubAgentId || chalk.gray('None'),
        createdDate,
      ]);
    }

    console.log(`\n${table.toString()}`);
  } catch (error) {
    s.stop('Failed to fetch agent');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
