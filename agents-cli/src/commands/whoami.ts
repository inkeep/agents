import chalk from 'chalk';
import { loadCredentials } from '../utils/credentials';

export async function whoamiCommand(): Promise<void> {
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow('Not logged in'));
    console.log(chalk.gray('Run `inkeep login` to authenticate'));
    return;
  }

  // Check if session has expired
  let isExpired = false;
  if (credentials.expiresAt) {
    const expiresAt = new Date(credentials.expiresAt);
    isExpired = expiresAt < new Date();
  }

  console.log();
  console.log(chalk.bold('Current User:'));
  console.log(`  Email: ${chalk.cyan(credentials.userEmail)}`);

  if (credentials.organizationName) {
    console.log(`  Organization: ${chalk.cyan(credentials.organizationName)}`);
  } else if (credentials.organizationId) {
    console.log(`  Organization ID: ${chalk.cyan(credentials.organizationId)}`);
  }

  if (isExpired) {
    console.log(`  Status: ${chalk.red('Expired')}`);
    console.log();
    console.log(chalk.yellow('Your session has expired. Run `inkeep login` to re-authenticate.'));
  } else {
    console.log(`  Status: ${chalk.green('Active')}`);
    if (credentials.expiresAt) {
      const expiresAt = new Date(credentials.expiresAt);
      console.log(`  Expires: ${chalk.gray(expiresAt.toLocaleDateString())}`);
    }
  }

  if (credentials.createdAt) {
    const createdAt = new Date(credentials.createdAt);
    console.log(`  Logged in: ${chalk.gray(createdAt.toLocaleDateString())}`);
  }

  console.log();
}
