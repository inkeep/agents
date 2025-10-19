import chalk from 'chalk';
import * as p from '@clack/prompts';
import { detectPackageManager, executeUpdate, type PackageManager } from '../utils/package-manager';
import { checkForUpdate, getChangelogUrl } from '../utils/version-check';

export interface UpdateOptions {
  check?: boolean;
  force?: boolean;
}

/**
 * Update command - updates the CLI to the latest version
 */
export async function updateCommand(options: UpdateOptions = {}) {
  const s = p.spinner();
  s.start('Checking for updates...');

  try {
    // Check for updates
    const versionInfo = await checkForUpdate();
    s.stop();

    // Display current version info
    console.log(chalk.cyan('\n📦 Version Information:'));
    console.log(chalk.gray(`  • Current version: ${versionInfo.current}`));
    console.log(chalk.gray(`  • Latest version:  ${versionInfo.latest}`));

    // If only checking, exit here
    if (options.check) {
      if (versionInfo.needsUpdate) {
        console.log(chalk.yellow('\n⚠️  An update is available!'));
        console.log(chalk.gray(`  • Run ${chalk.cyan('inkeep update')} to update`));
      } else {
        console.log(chalk.green('\n✅ You are on the latest version'));
      }
      return;
    }

    // If no update needed and not forced
    if (!versionInfo.needsUpdate && !options.force) {
      console.log(chalk.green('\n✅ You are already on the latest version'));
      return;
    }

    // If force updating to the same version
    if (!versionInfo.needsUpdate && options.force) {
      console.log(chalk.yellow('\n⚠️  Forcing reinstall of current version...'));
    }

    // Display changelog link
    console.log(chalk.cyan('\n📖 Changelog:'));
    console.log(chalk.gray(`  • ${getChangelogUrl()}`));

    // Detect package manager
    s.start('Detecting package manager...');
    const detectedManager = await detectPackageManager();
    s.stop();

    let packageManager: PackageManager;

    if (!detectedManager) {
      console.log(chalk.yellow('\n⚠️  Could not auto-detect package manager'));
      const manager = await p.select({
        message: 'Which package manager did you use to install the CLI?',
        options: [
          { label: 'npm', value: 'npm' },
          { label: 'pnpm', value: 'pnpm' },
          { label: 'bun', value: 'bun' },
          { label: 'yarn', value: 'yarn' },
        ],
      }) as PackageManager;

      if (p.isCancel(manager)) {
        p.cancel('Update cancelled');
        process.exit(1);
      }

      packageManager = manager;
    } else {
      packageManager = detectedManager;
      console.log(chalk.gray(`\n🔍 Detected package manager: ${chalk.cyan(packageManager)}`));
    }

    // Confirm update unless --force flag is used
    if (!options.force) {
      const confirm = await p.confirm({
        message: `Update @inkeep/agents-cli from ${versionInfo.current} to ${versionInfo.latest}?`,
        initialValue: true,
      });

      if (p.isCancel(confirm) || !confirm) {
        p.cancel('Update cancelled');
        process.exit(1);
      }
    }

    // Execute update
    s.start(`Updating @inkeep/agents-cli to ${versionInfo.latest}...`);
    await executeUpdate(packageManager);
    s.stop(`Updated to version ${versionInfo.latest}`);

    console.log(chalk.green('\n✨ Update completed successfully!'));
    console.log(chalk.gray(`  • New version: ${versionInfo.latest}`));
    console.log(chalk.gray(`  • Package manager: ${packageManager}`));
  } catch (error) {
    s.stop('Update failed');
    console.error(chalk.red('\n❌ Error:'), (error as Error).message);

    if (
      (error as Error).message.includes('EACCES') ||
      (error as Error).message.includes('permission')
    ) {
      console.log(chalk.yellow('\n💡 Tip: Try running the command with elevated permissions:'));
      console.log(chalk.gray('  • sudo inkeep update'));
    }

    process.exit(1);
  }
}
