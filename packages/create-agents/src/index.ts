#!/usr/bin/env node

import { program } from 'commander';
import { createAgents } from './utils.js';

program
  .name('create-agents')
  .description('Create an Inkeep Agent Framework directory')
  .version('0.1.0')
  .argument('[directory-name]', 'Name of the directory')
  .option('--template <template>', 'Template to use')
  .option('--openai-key <openai-key>', 'OpenAI API key')
  .option('--anthropic-key <anthropic-key>', 'Anthropic API key')
  .option(
    '--custom-project-id <custom-project-id>',
    'Custom project id for experienced users who want an empty project directory'
  )
  .option('--disable-git', 'Disable git initialization')
  .option('--local-agents-prefix <local-agents-prefix>', 'Local prefix for create-agents-template')
  .option('--local-templates-prefix <local-templates-prefix>', 'Local prefix for project templates')
  .option('--skip-inkeep-cli', 'Skip installing Inkeep CLI globally')
  .parse();

async function main() {
  const options = program.opts();
  const directoryName = program.args[0];

  try {
    await createAgents({
      dirName: directoryName,
      openAiKey: options.openaiKey,
      anthropicKey: options.anthropicKey,
      customProjectId: options.customProjectId,
      template: options.template,
      disableGit: options.disableGit,
      localAgentsPrefix: options.localAgentsPrefix,
      localTemplatesPrefix: options.localTemplatesPrefix,
      skipInkeepCli: options.skipInkeepCli,
    });
  } catch (error) {
    console.error('Failed to create directory:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});
