import chalk from 'chalk';
import {
  checkKeychainAvailability,
  getCredentialExpiryInfo,
  loadCredentials,
} from '../utils/credentials';
import { ProfileManager } from '../utils/profiles';

export interface StatusOptions {
  profile?: string;
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const profileManager = new ProfileManager();

  // Resolve profile to use
  let profileName: string;
  let credentialKey: string;
  let manageApiUrl: string;
  let manageUiUrl: string;
  let runApiUrl: string;
  let environment: string;

  try {
    if (options.profile) {
      const profile = profileManager.getProfile(options.profile);
      if (!profile) {
        console.error(chalk.red(`Profile '${options.profile}' not found.`));
        console.log(chalk.gray('Run "inkeep profile list" to see available profiles.'));
        process.exit(1);
      }
      profileName = options.profile;
      credentialKey = profile.credential;
      manageApiUrl = profile.remote.manageApi;
      manageUiUrl = profile.remote.manageUi;
      runApiUrl = profile.remote.runApi;
      environment = profile.environment;
    } else {
      const activeProfile = profileManager.getActiveProfile();
      profileName = activeProfile.name;
      credentialKey = activeProfile.credential;
      manageApiUrl = activeProfile.remote.manageApi;
      manageUiUrl = activeProfile.remote.manageUi;
      runApiUrl = activeProfile.remote.runApi;
      environment = activeProfile.environment;
    }
  } catch {
    // No profile configured
    console.log(chalk.yellow('No profile configured.'));
    console.log(chalk.gray('Run "inkeep profile add" to create a profile.'));
    console.log(chalk.gray('Or run "inkeep login" to authenticate with default settings.'));
    return;
  }

  console.log();
  console.log(chalk.bold('Current Profile:'), chalk.cyan(profileName));
  console.log();

  // Check keychain availability
  const { available: keychainAvailable, reason } = await checkKeychainAvailability();

  if (!keychainAvailable) {
    console.log(chalk.bold('Auth:'), chalk.yellow('keychain unavailable'));
    console.log(chalk.gray(`  Reason: ${reason || 'unknown'}`));
    console.log(chalk.gray('  For CI/CD environments, use INKEEP_API_KEY instead.'));
    console.log();
  } else {
    // Check credentials
    const credentials = await loadCredentials(credentialKey);

    if (!credentials) {
      console.log(chalk.bold('Auth:'), chalk.red('not authenticated'));
      console.log(chalk.gray(`  Credential: ${credentialKey} (not found)`));
      console.log(chalk.gray('  Run "inkeep login" to authenticate.'));
      console.log();
    } else {
      const expiryInfo = getCredentialExpiryInfo(credentials);

      if (expiryInfo.isExpired) {
        console.log(chalk.bold('Auth:'), chalk.red('expired'));
        console.log(chalk.gray(`  User: ${credentials.userEmail}`));
        if (credentials.organizationName) {
          console.log(chalk.gray(`  Organization: ${credentials.organizationName}`));
        }
        console.log(chalk.gray(`  Credential: ${credentialKey}`));
        console.log(chalk.red('  Session expired. Run "inkeep login" to re-authenticate.'));
        console.log();
      } else {
        const expiresText = expiryInfo.expiresIn
          ? chalk.gray(` (expires in ${expiryInfo.expiresIn})`)
          : '';
        console.log(chalk.bold('Auth:'), chalk.green('authenticated') + expiresText);
        console.log(chalk.gray(`  User: ${credentials.userEmail}`));
        if (credentials.organizationName) {
          console.log(chalk.gray(`  Organization: ${credentials.organizationName}`));
        }
        console.log(chalk.gray(`  Credential: ${credentialKey}`));
        console.log();
      }
    }
  }

  // Show remote URLs
  console.log(chalk.bold('Remote:'));
  console.log(chalk.gray(`  Manage API: ${manageApiUrl}`));
  console.log(chalk.gray(`  Manage UI:  ${manageUiUrl}`));
  console.log(chalk.gray(`  Run API:    ${runApiUrl}`));
  console.log();

  // Show environment
  console.log(chalk.bold('Environment:'), environment);
  console.log();
}
