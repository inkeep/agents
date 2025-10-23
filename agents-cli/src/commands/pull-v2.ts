/**
 * Pull v2 - Deterministic project synchronization
 * 
 * This command provides intelligent project synchronization by:
 * 1. Comparing remote project data with local codebase
 * 2. Using deterministic generation for new components
 * 3. Using targeted LLM updates for modified components
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';

// Import existing utilities
import { loadProject } from '../utils/project-loader';
import { compareProjectDefinitions, type ComparisonResult } from '../utils/json-comparison';
import { ManagementApiClient } from '../api';

// Import our deterministic pull-v2 command
import { pullV2Command } from './pull-v2/index';

interface PullV2Options {
  project?: string;
  debug?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

interface ChangeClassification {
  newComponents: ComponentChange[];
  modifiedComponents: ComponentChange[];
  removedComponents: ComponentChange[];
}

interface ComponentChange {
  type: 'agent' | 'tool' | 'dataComponent' | 'artifactComponent' | 'statusComponent' | 'environment' | 'project';
  id: string;
  path?: string;
  difference: string;
}

export const pullV2Command = new Command('pull-v2')
  .description('Intelligent project synchronization with deterministic generation')
  .option('-p, --project <id>', 'Project ID to pull')
  .option('--debug', 'Enable debug output')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--force', 'Skip confirmation prompts')
  .action(async (options: PullV2Options) => {
    console.log(chalk.blue('🔄 Pull v2 - Intelligent Project Synchronization\n'));

    try {
      // Step 1: Get project ID and validate
      const projectId = await getProjectId(options.project);
      const projectDir = process.cwd();

      // Step 2: Fetch remote project data
      const s = p.spinner();
      s.start('Fetching remote project data...');
      const remoteProjectData = await fetchProjectData(projectId);
      s.stop('Remote project data fetched');

      if (options.debug) {
        console.log(chalk.gray(`Remote project: ${remoteProjectData.name} (${remoteProjectData.id})`));
      }

      // Step 3: Check if local project exists
      const indexPath = join(projectDir, 'index.ts');
      const hasLocalProject = existsSync(indexPath);

      if (!hasLocalProject) {
        // No local project - use full deterministic generation
        console.log(chalk.yellow('No local project found. Creating new project structure...'));
        await handleNewProject(remoteProjectData, projectDir, options);
        return;
      }

      // Step 4: Load local project and compare
      s.start('Loading local project and comparing...');
      const localProject = await loadProject(projectDir);
      const localProjectData = await serializeProject(localProject);
      
      const comparisonResult = compareProjectDefinitions(remoteProjectData, localProjectData);
      s.stop('Comparison complete');

      if (options.debug) {
        console.log(chalk.gray(`Comparison result:`));
        console.log(chalk.gray(`  - Matches: ${comparisonResult.matches}`));
        console.log(chalk.gray(`  - Differences: ${comparisonResult.differences.length}`));
        console.log(chalk.gray(`  - Warnings: ${comparisonResult.warnings.length}`));
      }

      if (comparisonResult.matches) {
        console.log(chalk.green('✅ Local project is already up to date!'));
        return;
      }

      // Step 5: Classify changes
      const changes = classifyChanges(comparisonResult, remoteProjectData, localProjectData);
      
      // Step 6: Show summary and get user confirmation
      await showChangeSummary(changes, options);

      if (!options.force && !options.dryRun) {
        const confirmed = await p.confirm({
          message: 'Apply these changes?',
        });
        
        if (p.isCancel(confirmed) || !confirmed) {
          p.cancel('Operation cancelled');
          return;
        }
      }

      // Step 7: Apply changes
      if (options.dryRun) {
        console.log(chalk.blue('🔍 Dry run complete - no changes made'));
      } else {
        await applyChanges(changes, remoteProjectData, localProjectData, projectDir, options);
        console.log(chalk.green('✅ Project synchronized successfully!'));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Pull v2 failed:'), error.message);
      if (options.debug && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

/**
 * Get project ID from options or prompt user
 */
async function getProjectId(projectOption?: string): Promise<string> {
  if (projectOption) {
    return projectOption;
  }

  const projectId = await p.text({
    message: 'Enter the project ID to pull:',
    validate: (value) => (value ? undefined : 'Project ID is required'),
  });

  if (p.isCancel(projectId)) {
    p.cancel('Operation cancelled');
    process.exit(1);
  }

  return projectId;
}

/**
 * Handle creating a completely new project (no existing local code)
 */
async function handleNewProject(
  remoteProjectData: FullProjectDefinition,
  projectDir: string,
  options: PullV2Options
): Promise<void> {
  if (!options.force && !options.dryRun) {
    const confirmed = await p.confirm({
      message: `Create new project "${remoteProjectData.name}" in current directory?`,
    });
    
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Operation cancelled');
      return;
    }
  }

  if (options.dryRun) {
    console.log(chalk.blue('🔍 Would create new project structure'));
    return;
  }

  const s = p.spinner();
  s.start('Generating project structure...');
  
  await generateProjectStructure(remoteProjectData, projectDir);
  
  s.stop('Project structure created');
}

/**
 * Serialize a Project instance back to FullProjectDefinition JSON
 * This reuses the same logic as inkeep push
 */
async function serializeProject(project: any): Promise<FullProjectDefinition> {
  // TODO: Import and use the actual serialization logic from push command
  // For now, assuming the project has a .toJSON() method or similar
  if (typeof project.toJSON === 'function') {
    return project.toJSON();
  }
  
  // Fallback: try to extract data directly
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    models: project.models,
    stopWhen: project.stopWhen,
    agents: project.agents || {},
    tools: project.tools || {},
    functions: project.functions || {},
    dataComponents: project.dataComponents || {},
    artifactComponents: project.artifactComponents || {},
    statusComponents: project.statusComponents || {},
    credentialReferences: project.credentialReferences || {},
    environments: project.environments || {},
  };
}

/**
 * Classify comparison differences into actionable change types
 */
function classifyChanges(
  comparisonResult: ComparisonResult,
  remoteData: FullProjectDefinition,
  localData: FullProjectDefinition
): ChangeClassification {
  const newComponents: ComponentChange[] = [];
  const modifiedComponents: ComponentChange[] = [];
  const removedComponents: ComponentChange[] = [];

  for (const difference of comparisonResult.differences) {
    const change = parseChangeDifference(difference, remoteData, localData);
    if (change) {
      if (difference.includes('Missing') && difference.includes('in generated')) {
        newComponents.push(change);
      } else if (difference.includes('mismatch')) {
        modifiedComponents.push(change);
      }
    }
  }

  for (const warning of comparisonResult.warnings) {
    if (warning.includes('Extra') && warning.includes('in generated')) {
      const change = parseChangeDifference(warning, remoteData, localData);
      if (change) {
        removedComponents.push(change);
      }
    }
  }

  return { newComponents, modifiedComponents, removedComponents };
}

/**
 * Parse a difference string into a structured ComponentChange
 */
function parseChangeDifference(
  difference: string, 
  remoteData: FullProjectDefinition, 
  localData: FullProjectDefinition
): ComponentChange | null {
  // Parse patterns like "Missing agent in generated: agentId"
  const missingMatch = difference.match(/Missing (\w+) in generated: (.+)/);
  if (missingMatch) {
    const [, type, id] = missingMatch;
    return { type: type as any, id, difference };
  }

  // Parse patterns like "Extra tool in generated: toolId"
  const extraMatch = difference.match(/Extra (\w+) in generated: (.+)/);
  if (extraMatch) {
    const [, type, id] = extraMatch;
    return { type: type as any, id, difference };
  }

  // Parse patterns like "Value mismatch at agents.agentId.name"
  const mismatchMatch = difference.match(/Value mismatch at (\w+)\.([^.]+)/);
  if (mismatchMatch) {
    const [, type, id] = mismatchMatch;
    return { type: type as any, id, difference };
  }

  return null;
}

/**
 * Show a summary of changes to be applied
 */
async function showChangeSummary(changes: ChangeClassification, options: PullV2Options): Promise<void> {
  console.log(chalk.blue('\n📋 Change Summary:'));
  
  if (changes.newComponents.length > 0) {
    console.log(chalk.green(`\n➕ New components (${changes.newComponents.length}):`));
    for (const change of changes.newComponents) {
      console.log(chalk.gray(`  • ${change.type}: ${change.id} (deterministic generation)`));
    }
  }

  if (changes.modifiedComponents.length > 0) {
    console.log(chalk.yellow(`\n📝 Modified components (${changes.modifiedComponents.length}):`));
    for (const change of changes.modifiedComponents) {
      console.log(chalk.gray(`  • ${change.type}: ${change.id} (LLM-assisted update)`));
    }
  }

  if (changes.removedComponents.length > 0) {
    console.log(chalk.red(`\n➖ Components to remove (${changes.removedComponents.length}):`));
    for (const change of changes.removedComponents) {
      console.log(chalk.gray(`  • ${change.type}: ${change.id} (will prompt for confirmation)`));
    }
  }

  if (options.debug) {
    console.log(chalk.gray('\nDetailed differences:'));
    [...changes.newComponents, ...changes.modifiedComponents, ...changes.removedComponents]
      .forEach(change => console.log(chalk.gray(`  - ${change.difference}`)));
  }
}

/**
 * Apply all classified changes to the local project
 */
async function applyChanges(
  changes: ChangeClassification,
  remoteData: FullProjectDefinition,
  localData: FullProjectDefinition,
  projectDir: string,
  options: PullV2Options
): Promise<void> {
  const s = p.spinner();

  // Step 1: Handle new components with deterministic generation
  if (changes.newComponents.length > 0) {
    s.start('Creating new components...');
    await handleNewComponents(changes.newComponents, remoteData, projectDir, options);
    s.stop('New components created');
  }

  // Step 2: Handle modified components with LLM updates
  if (changes.modifiedComponents.length > 0) {
    s.start('Updating modified components...');
    await handleModifiedComponents(changes.modifiedComponents, remoteData, localData, projectDir, options);
    s.stop('Modified components updated');
  }

  // Step 3: Handle removed components
  if (changes.removedComponents.length > 0) {
    await handleRemovedComponents(changes.removedComponents, projectDir, options);
  }
}

/**
 * Create new components using deterministic generation
 */
async function handleNewComponents(
  newComponents: ComponentChange[],
  remoteData: FullProjectDefinition,
  projectDir: string,
  options: PullV2Options
): Promise<void> {
  // TODO: Use our existing pull-v2 generators to create new components
  console.log(chalk.gray(`  Creating ${newComponents.length} new components...`));
  
  for (const component of newComponents) {
    if (options.debug) {
      console.log(chalk.gray(`    • ${component.type}: ${component.id}`));
    }
    // TODO: Route to appropriate generator based on component.type
  }
}

/**
 * Update existing components using targeted LLM assistance
 */
async function handleModifiedComponents(
  modifiedComponents: ComponentChange[],
  remoteData: FullProjectDefinition,
  localData: FullProjectDefinition,
  projectDir: string,
  options: PullV2Options
): Promise<void> {
  // TODO: Implement LLM-assisted targeted updates
  console.log(chalk.gray(`  Updating ${modifiedComponents.length} modified components...`));
  
  for (const component of modifiedComponents) {
    if (options.debug) {
      console.log(chalk.gray(`    • ${component.type}: ${component.id}`));
    }
    // TODO: Use LLM to generate targeted updates for existing files
  }
}

/**
 * Handle removed components (prompt user for confirmation)
 */
async function handleRemovedComponents(
  removedComponents: ComponentChange[],
  projectDir: string,
  options: PullV2Options
): Promise<void> {
  if (options.force) {
    console.log(chalk.gray(`  Removing ${removedComponents.length} components...`));
    // TODO: Remove files/directories
    return;
  }

  for (const component of removedComponents) {
    const shouldRemove = await p.confirm({
      message: `Remove local ${component.type} "${component.id}"? (not present in remote)`,
    });

    if (p.isCancel(shouldRemove)) {
      continue;
    }

    if (shouldRemove) {
      console.log(chalk.gray(`  Removing ${component.type}: ${component.id}`));
      // TODO: Remove the actual file/directory
    }
  }
}