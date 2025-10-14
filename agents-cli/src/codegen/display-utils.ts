/**
 * Display Utilities
 *
 * Functions to display generation plans and conflict resolutions to the user
 */

import chalk from 'chalk';
import type { GenerationPlan } from './plan-builder';

/**
 * Display plan summary with conflicts
 */
export function displayPlanSummary(plan: GenerationPlan): void {
  console.log(chalk.cyan('\n📋 Generation Plan:'));
  console.log(chalk.gray(`  • Total files: ${plan.metadata.totalFiles}`));
  console.log(chalk.gray(`  • New files: ${plan.metadata.newFiles}`));
  console.log(chalk.gray(`  • Updated files: ${plan.metadata.updatedFiles}`));

  // Show conflicts if any
  if (plan.metadata.conflicts && plan.metadata.conflicts.length > 0) {
    console.log(chalk.yellow('\n⚠️  Variable Name Conflicts Resolved:'));
    for (const conflict of plan.metadata.conflicts) {
      console.log(chalk.gray(`  • ID "${conflict.id}" used by ${conflict.types.join(', ')}`));
      console.log(chalk.gray('    Resolved to:'));
      for (const [type, name] of Object.entries(conflict.resolvedNames)) {
        console.log(chalk.gray(`      - ${type}: ${name}`));
      }
    }
  }

  // Show file-by-file breakdown
  console.log(chalk.cyan('\n📄 Files to generate:'));

  // Group files by type
  const filesByType: Record<string, typeof plan.files> = {
    index: [],
    agent: [],
    tool: [],
    dataComponent: [],
    artifactComponent: [],
    statusComponent: [],
    environment: [],
  };

  for (const file of plan.files) {
    // Guard against unexpected file types
    if (!filesByType[file.type]) {
      filesByType[file.type] = [];
    }
    filesByType[file.type].push(file);
  }

  // Display each type
  if (filesByType.index.length > 0) {
    console.log(chalk.gray('\n  Index:'));
    for (const file of filesByType.index) {
      console.log(chalk.gray(`    • ${file.path}`));
    }
  }

  if (filesByType.agent.length > 0) {
    console.log(chalk.gray('\n  Agents:'));
    for (const file of filesByType.agent) {
      console.log(chalk.gray(`    • ${file.path}`));
      for (const entity of file.entities) {
        const badge = entity.id !== entity.variableName ? ` (id: "${entity.id}")` : '';
        console.log(chalk.gray(`        - ${entity.variableName}${badge}`));
      }
    }
  }

  if (filesByType.tool.length > 0) {
    console.log(chalk.gray('\n  Tools:'));
    for (const file of filesByType.tool) {
      console.log(chalk.gray(`    • ${file.path}`));
      for (const entity of file.entities) {
        const badge = entity.id !== entity.variableName ? ` (id: "${entity.id}")` : '';
        console.log(chalk.gray(`        - ${entity.variableName}${badge}`));
      }
    }
  }

  if (filesByType.dataComponent.length > 0) {
    console.log(chalk.gray('\n  Data Components:'));
    for (const file of filesByType.dataComponent) {
      console.log(chalk.gray(`    • ${file.path}`));
      for (const entity of file.entities) {
        console.log(chalk.gray(`        - ${entity.variableName}`));
      }
    }
  }

  if (filesByType.artifactComponent.length > 0) {
    console.log(chalk.gray('\n  Artifact Components:'));
    for (const file of filesByType.artifactComponent) {
      console.log(chalk.gray(`    • ${file.path}`));
      for (const entity of file.entities) {
        console.log(chalk.gray(`        - ${entity.variableName}`));
      }
    }
  }

  if (filesByType.statusComponent.length > 0) {
    console.log(chalk.gray('\n  Status Components:'));
    for (const file of filesByType.statusComponent) {
      console.log(chalk.gray(`    • ${file.path}`));
      for (const entity of file.entities) {
        console.log(chalk.gray(`        - ${entity.variableName}`));
      }
    }
  }

  if (filesByType.environment.length > 0) {
    console.log(chalk.gray('\n  Environments:'));
    for (const file of filesByType.environment) {
      console.log(chalk.gray(`    • ${file.path}`));
    }
  }
}

/**
 * Display pattern detection summary
 */
export function displayPatternSummary(patterns: any): void {
  console.log(chalk.cyan('\n🔍 Detected Patterns:'));

  console.log(chalk.gray('  File Structure:'));
  console.log(chalk.gray(`    • Tools: ${patterns.fileStructure.toolsLocation}`));
  console.log(chalk.gray(`    • Agents: ${patterns.fileStructure.agentsLocation}`));
  console.log(chalk.gray(`    • File naming: ${patterns.fileStructure.preferredFileNaming}`));

  console.log(chalk.gray('  Code Style:'));
  console.log(chalk.gray(`    • Exports: ${patterns.codeStyle.exportNaming}`));
  console.log(chalk.gray(`    • Multi-line strings: ${patterns.codeStyle.multiLineStrings}`));
  console.log(chalk.gray(`    • Imports: ${patterns.codeStyle.importStyle}`));

  console.log(chalk.gray('  Naming Conventions:'));
  console.log(chalk.gray(`    • Agent suffix: "${patterns.namingConventions.agentSuffix}"`));
  console.log(chalk.gray(`    • SubAgent suffix: "${patterns.namingConventions.subAgentSuffix}"`));

  if (patterns.examples.mappings && patterns.examples.mappings.length > 0) {
    console.log(
      chalk.gray(`  Found ${patterns.examples.mappings.length} existing variable mappings`)
    );
  }
}

/**
 * Display recommended pattern (when no existing code detected)
 */
export function displayRecommendedPattern(): void {
  console.log(chalk.cyan('\n📝 Using Recommended Pattern:'));
  console.log(chalk.gray('  File Structure:'));
  console.log(chalk.gray('    • Tools: separate (tools/ directory)'));
  console.log(chalk.gray('    • Agents: flat (agents/ directory)'));
  console.log(chalk.gray('    • File naming: kebab-case'));
  console.log(chalk.gray('  Code Style:'));
  console.log(chalk.gray('    • Exports: camelCase'));
  console.log(chalk.gray('    • Multi-line strings: template-literals'));
  console.log(chalk.gray('    • Imports: named'));
  console.log(chalk.gray('  Naming:'));
  console.log(chalk.gray('    • Agent suffix: "Agent"'));
  console.log(chalk.gray('    • SubAgent suffix: "SubAgent"'));
}

/**
 * Display generation progress
 */
export function displayGenerationProgress(current: number, total: number, fileName: string): void {
  const percentage = Math.round((current / total) * 100);
  console.log(chalk.gray(`  [${current}/${total}] ${percentage}% - ${fileName}`));
}

/**
 * Display generation complete summary
 */
export function displayGenerationComplete(plan: GenerationPlan, duration: number): void {
  console.log(chalk.green('\n✨ Files generated successfully!'));
  console.log(chalk.gray(`  • Duration: ${(duration / 1000).toFixed(2)}s`));
  console.log(chalk.gray(`  • Files: ${plan.metadata.totalFiles}`));

  // Calculate average per file
  const avgPerFile = duration / plan.metadata.totalFiles;
  console.log(chalk.gray(`  • Average: ${(avgPerFile / 1000).toFixed(2)}s per file`));
}

/**
 * Display conflict warning before generation
 */
export function displayConflictWarning(conflicts: GenerationPlan['metadata']['conflicts']): void {
  if (!conflicts || conflicts.length === 0) {
    return;
  }

  console.log(chalk.yellow('\n⚠️  Variable Name Conflicts:'));
  console.log(chalk.yellow('The following IDs are used by multiple entity types:'));

  for (const conflict of conflicts) {
    console.log(chalk.yellow(`\n  ID: "${conflict.id}"`));
    console.log(chalk.gray(`  Used by: ${conflict.types.join(', ')}`));
    console.log(chalk.gray('  Variable names assigned:'));
    for (const [type, name] of Object.entries(conflict.resolvedNames)) {
      console.log(chalk.gray(`    - ${type}: ${name}`));
    }
  }

  console.log(chalk.yellow('\nThese conflicts have been automatically resolved with suffixes.'));
  console.log(chalk.gray('This is normal and ensures TypeScript compilation succeeds.\n'));
}

/**
 * Display file structure tree
 */
export function displayFileStructureTree(plan: GenerationPlan, projectRoot: string): void {
  console.log(chalk.cyan('\n📁 Generated structure:'));
  console.log(chalk.gray(`  ${projectRoot}/`));

  // Group by directory
  const byDirectory: Record<string, string[]> = {};

  for (const file of plan.files) {
    const parts = file.path.split('/');
    const dir = parts.length > 1 ? parts[0] : '.';
    const fileName = parts[parts.length - 1];

    if (!byDirectory[dir]) {
      byDirectory[dir] = [];
    }
    byDirectory[dir].push(fileName);
  }

  // Display tree
  const dirs = Object.keys(byDirectory).sort();
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const files = byDirectory[dir].sort();
    const isLast = i === dirs.length - 1;

    if (dir === '.') {
      // Root files
      for (const file of files) {
        console.log(chalk.gray(`  ├── ${file}`));
      }
    } else {
      // Directory
      console.log(chalk.gray(`  ├── ${dir}/`));
      for (let j = 0; j < files.length; j++) {
        const file = files[j];
        const isLastFile = j === files.length - 1;
        const prefix = isLast ? '      ' : '  │   ';
        const branch = isLastFile ? '└──' : '├──';
        console.log(chalk.gray(`${prefix}${branch} ${file}`));
      }
    }
  }
}
