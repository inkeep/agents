import * as p from '@clack/prompts';
import chalk from 'chalk';
import open from 'open';
import {
  checkKeychainAvailability,
  getKeychainUnavailableMessage,
  loadCredentials,
  saveCredentials,
} from '../utils/credentials';
import { ProfileManager } from '../utils/profiles';

export interface LoginOptions {
  profile?: string;
}

/**
 * Format user code as XXXX-XXXX for display
 */
function formatUserCode(code: string): string {
  const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return cleaned;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the device token endpoint until authorization is complete
 */
async function pollForToken(
  cloudUrl: string,
  deviceCode: string,
  clientId: string,
  initialInterval: number
): Promise<string> {
  let interval = initialInterval;

  while (true) {
    await sleep(interval * 1000);

    const response = await fetch(`${cloudUrl}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: clientId,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      // User hasn't approved yet, keep polling
      continue;
    }

    if (data.error === 'slow_down') {
      // Back off polling interval
      interval += 5;
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization denied.');
    }

    throw new Error(data.error || data.message || 'Unknown error during authorization');
  }
}

/**
 * Fetch user info and organization after authentication
 */
async function fetchUserInfo(
  cloudUrl: string,
  accessToken: string
): Promise<{
  user: { id: string; email: string; name?: string };
  organization: { id: string; name: string; slug: string };
}> {
  // First, get the session to get user info
  const sessionResponse = await fetch(`${cloudUrl}/api/auth/get-session`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!sessionResponse.ok) {
    throw new Error('Failed to fetch user session');
  }

  const sessionData = await sessionResponse.json();
  const user = sessionData.user;

  if (!user) {
    throw new Error('No user found in session');
  }

  // Get user's organization
  const orgResponse = await fetch(`${cloudUrl}/manage/api/cli/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!orgResponse.ok) {
    throw new Error(
      'Failed to fetch organization info. Please ensure that you are a member of an organization.'
    );
  }

  const orgData = await orgResponse.json();

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    organization: orgData.organization,
  };
}

export async function loginCommand(options: LoginOptions = {}): Promise<void> {
  const profileManager = new ProfileManager();

  // Resolve profile to use
  let profileName: string;
  let credentialKey: string;
  let manageApiUrl: string;
  let manageUiUrl: string;

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
      manageUiUrl = profile.remote.manageUi;
    } else {
      const activeProfile = profileManager.getActiveProfile();
      profileName = activeProfile.name;
      credentialKey = activeProfile.credential;
      manageApiUrl = activeProfile.remote.api;
      manageUiUrl = activeProfile.remote.manageUi;
    }
  } catch {
    // No profile configured, use defaults
    profileName = 'default';
    credentialKey = 'inkeep-cloud';
    manageApiUrl = 'https://agents-api.inkeep.com';
    manageUiUrl = 'https://manage.inkeep.com';
  }

  console.log(chalk.gray(`Using profile: ${profileName}`));

  // Check if keychain is available
  const { available, reason } = await checkKeychainAvailability();
  if (!available) {
    console.error(chalk.red('Error:'), getKeychainUnavailableMessage(reason));
    console.log();
    console.log(chalk.yellow('For CI/CD environments without keychain access:'));
    console.log(chalk.gray('  Set INKEEP_API_KEY environment variable instead of using login.'));
    console.log(chalk.gray('  See: https://docs.inkeep.com/cli/cicd'));
    process.exit(1);
  }

  // Check if already logged in for this profile
  const existingCredentials = await loadCredentials(credentialKey);
  if (existingCredentials) {
    const continueLogin = await p.confirm({
      message: `Already logged in as ${chalk.cyan(existingCredentials.userEmail)} for profile '${profileName}'. Continue with new login?`,
      initialValue: false,
    });

    if (p.isCancel(continueLogin)) {
      p.cancel('Login cancelled');
      process.exit(0);
    }

    if (!continueLogin) {
      console.log(chalk.gray('Login cancelled. You are still logged in.'));
      return;
    }
  }

  const s = p.spinner();

  try {
    // Request device code
    s.start('Requesting device code...');

    const deviceCodeResponse = await fetch(`${manageApiUrl}/api/auth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'inkeep-cli' }),
    });

    if (!deviceCodeResponse.ok) {
      const errorData = await deviceCodeResponse.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to get device code: ${deviceCodeResponse.statusText}`
      );
    }

    const { device_code, user_code, interval } = await deviceCodeResponse.json();

    s.stop('Device code received');

    // Display instructions
    console.log();
    console.log(chalk.bold('To authenticate, visit:'));
    console.log(chalk.cyan(`  ${manageUiUrl}/device?user_code=${user_code}`));
    console.log();
    console.log(chalk.bold('And enter code:'));
    console.log(chalk.yellow.bold(`  ${formatUserCode(user_code)}`));
    console.log();

    // Try to open browser automatically
    try {
      await open(`${manageUiUrl}/device?user_code=${user_code}`);
      console.log(chalk.gray('  (Browser opened automatically)'));
      console.log();
    } catch {
      // Browser opening failed, user can copy the URL manually
    }

    // Poll for token
    s.start('Waiting for authorization...');
    const accessToken = await pollForToken(manageApiUrl, device_code, 'inkeep-cli', interval || 5);
    s.stop('Authorized!');

    // Fetch user info and organization
    s.start('Fetching account info...');
    const userInfo = await fetchUserInfo(manageApiUrl, accessToken);
    s.stop('Account info retrieved');

    // Store credentials under the profile's credential key
    await saveCredentials(
      {
        accessToken,
        userId: userInfo.user.id,
        userEmail: userInfo.user.email,
        organizationId: userInfo.organization.id,
        organizationName: userInfo.organization.name,
        createdAt: new Date().toISOString(),
      },
      credentialKey
    );

    // Success message
    console.log();
    console.log(chalk.green('✓'), `Logged in as ${chalk.cyan(userInfo.user.email)}`);
    console.log(chalk.green('✓'), `Organization: ${chalk.cyan(userInfo.organization.name)}`);
    console.log(chalk.green('✓'), `Profile: ${chalk.cyan(profileName)}`);
  } catch (error) {
    s.stop('Login failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), errorMessage);
    process.exit(1);
  }
}
