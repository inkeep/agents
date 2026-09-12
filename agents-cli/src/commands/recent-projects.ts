import chalk from 'chalk';
import {
  getRecentProjects,
  pruneStaleProjects,
  removeRecentProject,
  validateRecentProjects,
} from '../utils/recent-projects';

export async function recentProjectsListCommand(): Promise<void> {
  const projects = getRecentProjects();

  if (projects.length === 0) {
    console.log(chalk.gray('No recent projects.'));
    return;
  }

  const stale = validateRecentProjects();
  const stalePaths = new Set(stale.map((s) => s.project.path));

  console.log(chalk.bold('Recent projects:\n'));

  for (const project of projects) {
    const isMissing = stalePaths.has(project.path);
    const name = isMissing ? chalk.strikethrough.red(project.name) : chalk.cyan(project.name);
    const path = isMissing
      ? chalk.red(project.path) + chalk.red(' (directory missing)')
      : chalk.gray(project.path);
    const date = chalk.gray(new Date(project.lastOpenedAt).toLocaleDateString());

    console.log(`  ${name}  ${date}`);
    console.log(`  ${path}`);
    console.log();
  }

  if (stale.length > 0) {
    console.log(
      chalk.yellow(
        `${stale.length} project(s) have missing directories. Run ${chalk.bold('inkeep recent-projects prune')} to remove them.`
      )
    );
  }
}

export async function recentProjectsRemoveCommand(projectPath: string): Promise<void> {
  const removed = removeRecentProject(projectPath);

  if (removed) {
    console.log(chalk.green('✓'), `Removed ${chalk.cyan(projectPath)} from recent projects`);
  } else {
    console.log(chalk.yellow('⚠'), `No recent project found with path: ${projectPath}`);
  }
}

export async function recentProjectsPruneCommand(): Promise<void> {
  const pruned = pruneStaleProjects();

  if (pruned.length === 0) {
    console.log(chalk.green('✓'), 'All recent project paths are valid. Nothing to prune.');
    return;
  }

  console.log(chalk.green('✓'), `Pruned ${pruned.length} stale project(s):\n`);
  for (const project of pruned) {
    console.log(`  ${chalk.strikethrough(project.name)} ${chalk.gray(project.path)}`);
  }
}
