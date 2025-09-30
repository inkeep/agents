#!/usr/bin/env node

import { program } from 'commander';
import { createAgents } from './utils.js';
import { initErrorTracking, captureError, closeSentry } from './errorTracking.js';

// Read version from package.json
const VERSION = '0.8.7';

program
  .name('create-agents')
  .description('Create an Inkeep Agent Framework directory')
  .version(VERSION)
  .argument('[directory-name]', 'Name of the directory')
  .option('--template <template>', 'Template to use')
  .option('--openai-key <openai-key>', 'OpenAI API key')
  .option('--anthropic-key <anthropic-key>', 'Anthropic API key')
  .option('--custom-project-id <custom-project-id>', 'Custom project id for experienced users who want an empty project directory')
  .option('--disable-telemetry', 'Disable error tracking and telemetry')
  .parse();

async function main() {
  // Initialize error tracking
  initErrorTracking(VERSION);

  const options = program.opts();
  const directoryName = program.args[0];

  try {
    await createAgents({
      dirName: directoryName,
      openAiKey: options.openaiKey,
      anthropicKey: options.anthropicKey,
      customProjectId: options.customProjectId,
      template: options.template,
    });
  } catch (error) {
    console.error('Failed to create directory:', error);

    // Capture error for telemetry
    if (error instanceof Error) {
      captureError(error, {
        phase: 'main',
        hasDirectoryName: !!directoryName,
        hasTemplate: !!options.template,
        hasCustomProjectId: !!options.customProjectId,
      });
    }

    await closeSentry();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('An unexpected error occurred:', error);

  // Capture unexpected error
  if (error instanceof Error) {
    captureError(error, { phase: 'unexpected' });
  }

  await closeSentry();
  process.exit(1);
});
