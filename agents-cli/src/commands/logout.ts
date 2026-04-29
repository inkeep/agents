import * as p from '@clack/prompts';
import chalk from 'chalk';
import { clearCredentials, loadCredentials } from '../utils/credentials';
import { ProfileManager } from '../utils/profiles';
import { USER_AGENT } from '../utils/version-check';

export interface LogoutOptions {
  profile?: string;
}

export async function logoutCommand(options: LogoutOptions = {}): Promise<void> {
  const profileManager = new ProfileManager();
  const s = p.spinner();

  // Resolve profile to use
  let profileName: string;
  let credentialKey: string;
  let manageApiUrl: string;

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
      manageApiUrl = profile.remote.api;
    } else {
      const activeProfile = profileManager.getActiveProfile();
      profileName = activeProfile.name;
      credentialKey = activeProfile.credential;
      manageApiUrl = activeProfile.remote.api;
    }
  } catch {
    // No profile configured, use default
    profileName = 'default';
    credentialKey = 'inkeep-cloud';
    manageApiUrl = 'https://agents-api.inkeep.com';
  }

  console.log(chalk.gray(`Using profile: ${profileName}`));

  // Check if logged in for this profile
  const credentials = await loadCredentials(credentialKey);
  if (!credentials) {
    console.log(chalk.yellow(`Not logged in for profile '${profileName}'.`));
    return;
  }

  s.start('Logging out...');

  // Best-effort revoke; if it fails the server session still expires naturally.
  if (credentials.accessToken) {
    try {
      await fetch(`${manageApiUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: '{}',
      });
    } catch {
      // Continue with local cleanup.
    }
  }

  try {
    const cleared = await clearCredentials(credentialKey);

    if (cleared) {
      s.stop('Logged out successfully');
      console.log(chalk.green('✓'), `Logged out from profile '${chalk.cyan(profileName)}'.`);
      console.log(chalk.gray(`  • Credential '${credentialKey}' removed from keychain.`));
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
