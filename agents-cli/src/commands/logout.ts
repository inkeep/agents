import * as p from '@clack/prompts';
import chalk from 'chalk';
import { clearCredentials, loadCredentials } from '../utils/credentials';

export async function logoutCommand(): Promise<void> {
  const s = p.spinner();

  // Check if logged in
  const credentials = await loadCredentials();
  if (!credentials) {
    console.log(chalk.yellow('You are not logged in.'));
    return;
  }

  s.start('Logging out...');

  try {
    const cleared = await clearCredentials();

    if (cleared) {
      s.stop('Logged out successfully');
      console.log(chalk.green('✓'), 'You have been logged out.');
    } else {
      s.stop('Logout completed');
      console.log(chalk.gray('No credentials were stored.'));
    }
  } catch (error) {
    s.stop('Logout failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), errorMessage);
    process.exit(1);
  }
}
