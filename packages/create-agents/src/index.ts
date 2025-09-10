#!/usr/bin/env node

import { program } from 'commander';
import { createAgents } from '@inkeep/agents-cli/commands/create';

program
  .name('create-agents')
  .description('Create an Inkeep Agent Framework project')
  .version('0.1.0')
  .argument('[project-name]', 'Name of the project')
  .option('--tenant-id <tenant-id>', 'Tenant ID')
  .option('--project-id <project-id>', 'Project ID')
  .option('--openai-key <openai-key>', 'OpenAI API key')
  .option('--anthropic-key <anthropic-key>', 'Anthropic API key')
  .option('--manage-api-port <port>', 'Management API port', '3002')
  .option('--run-api-port <port>', 'Run API port', '3003')
  .parse();

async function main() {
  const options = program.opts();
  const projectName = program.args[0];

  try {
    await createAgents({
      dirName: projectName,
      openAiKey: options.openaiKey,
      anthropicKey: options.anthropicKey,
      nangoKey: options.nangoKey,
      tenantId: options.tenantId,
      projectId: options.projectId,
      manageApiPort: options.manageApiPort,
      runApiPort: options.runApiPort,
    });
  } catch (error) {
    console.error('Failed to create project:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});
