import * as p from '@clack/prompts';
import chalk from 'chalk';
import open from 'open';
import {
  checkKeychainAvailability,
  getKeychainUnavailableMessage,
  loadCredentials,
  saveCredentials,
} from '../utils/credentials';
import { loadConfig } from 'src/utils/config';

export interface LoginOptions {
  config?: string;
}

// Default cloud URL
const DEFAULT_INKEEP_CLOUD_MANAGE_API_URL = 'http://localhost:3002';
const DEFAULT_INKEEP_CLOUD_MANAGE_UI_URL = 'http://localhost:3000';

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
  const orgResponse = await fetch(`${cloudUrl}/api/cli/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!orgResponse.ok) {
    throw new Error('Failed to fetch organization info. Please ensure that you are a member of an organization.');
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
  const config = await loadConfig(options.config);
  const cloudManageApiUrl = config.agentsManageApiUrl;
  const cloudManageUiUrl = config.manageUiUrl;

  // Check if keychain is available
  const { available, reason } = await checkKeychainAvailability();
  if (!available) {
    console.error(chalk.red('Error:'), getKeychainUnavailableMessage(reason));
    process.exit(1);
  }

  // Check if already logged in
  const existingCredentials = await loadCredentials();
  if (existingCredentials) {
    const continueLogin = await p.confirm({
      message: `Already logged in as ${chalk.cyan(existingCredentials.userEmail)}. Continue with new login?`,
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

    const deviceCodeResponse = await fetch(`${cloudManageApiUrl}/api/auth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'inkeep-cli' }),
    });

    if (!deviceCodeResponse.ok) {
      const errorData = await deviceCodeResponse.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to get device code: ${deviceCodeResponse.statusText}`);
    }

    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval,
    } = await deviceCodeResponse.json();

    s.stop('Device code received');

    // Display instructions
    console.log();
    console.log(chalk.bold('To authenticate, visit:'));
    console.log(chalk.cyan(`  ${cloudManageUiUrl}/device?user_code=${user_code}`));
    console.log();
    console.log(chalk.bold('And enter code:'));
    console.log(chalk.yellow.bold(`  ${formatUserCode(user_code)}`));
    console.log();

    // Poll for token
    s.start('Waiting for authorization...');
    const accessToken = await pollForToken(cloudManageApiUrl, device_code, 'inkeep-cli', interval || 5);
    s.stop('Authorized!');

    // Fetch user info and organization
    s.start('Fetching account info...');
    const userInfo = await fetchUserInfo(cloudManageApiUrl, accessToken);
    s.stop('Account info retrieved');

    // Store credentials
    await saveCredentials({
      accessToken,
      userId: userInfo.user.id,
      userEmail: userInfo.user.email,
      organizationId: userInfo.organization.id,
      organizationName: userInfo.organization.name,
      createdAt: new Date().toISOString(),
    });

    // Success message
    console.log();
    console.log(chalk.green('✓'), `Logged in as ${chalk.cyan(userInfo.user.email)}`);
    console.log(chalk.green('✓'), `Organization: ${chalk.cyan(userInfo.organization.name)}`);
  } catch (error) {
    s.stop('Login failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Error:'), errorMessage);
    process.exit(1);
  }
}
