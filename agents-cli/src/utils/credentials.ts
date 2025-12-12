import { KeyChainStore } from '@inkeep/agents-core/credential-stores';

const CLI_SERVICE_PREFIX = 'inkeep-cli';
const CREDENTIALS_KEY = 'auth-credentials';

/**
 * CLI credentials stored in the system keychain
 */
export interface CLICredentials {
  accessToken: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  organizationName?: string;
  expiresAt?: string;
  createdAt: string;
}

// Singleton keychain store instance
let keychainStore: KeyChainStore | null = null;

function getKeychainStore(): KeyChainStore {
  if (!keychainStore) {
    keychainStore = new KeyChainStore('auth', CLI_SERVICE_PREFIX);
  }
  return keychainStore;
}

/**
 * Save CLI credentials to the system keychain
 */
export async function saveCredentials(credentials: CLICredentials): Promise<void> {
  const store = getKeychainStore();

  // Check availability first
  const { available, reason } = await store.checkAvailability();
  if (!available) {
    throw new Error(getKeychainUnavailableMessage(reason));
  }

  const credentialsJson = JSON.stringify(credentials);
  await store.set(CREDENTIALS_KEY, credentialsJson);
}

/**
 * Load CLI credentials from the system keychain
 */
export async function loadCredentials(): Promise<CLICredentials | null> {
  const store = getKeychainStore();

  const credentialsJson = await store.get(CREDENTIALS_KEY);
  if (!credentialsJson) {
    return null;
  }

  try {
    const credentials = JSON.parse(credentialsJson) as CLICredentials;

    // Validate required fields
    if (!credentials.accessToken || !credentials.userId || !credentials.userEmail) {
      return null;
    }

    return credentials;
  } catch {
    // Invalid JSON, clear and return null
    await store.delete(CREDENTIALS_KEY);
    return null;
  }
}

/**
 * Clear CLI credentials from the system keychain
 */
export async function clearCredentials(): Promise<boolean> {
  const store = getKeychainStore();
  return store.delete(CREDENTIALS_KEY);
}

/**
 * Check if valid credentials exist in the keychain
 */
export async function hasValidCredentials(): Promise<boolean> {
  const credentials = await loadCredentials();
  if (!credentials) {
    return false;
  }

  // Check if credentials have expired
  if (credentials.expiresAt) {
    const expiresAt = new Date(credentials.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }

  return true;
}

/**
 * Check if the keychain is available for storing credentials
 */
export async function checkKeychainAvailability(): Promise<{ available: boolean; reason?: string }> {
  const store = getKeychainStore();
  return store.checkAvailability();
}

/**
 * Get a helpful error message when keychain is unavailable
 */
function getKeychainUnavailableMessage(reason?: string): string {
  const platform = process.platform;
  let message = 'Unable to store credentials securely.\n\n';

  if (reason) {
    message += `Reason: ${reason}\n\n`;
  }

  message += 'The Inkeep CLI requires access to the system keychain to store your login credentials securely.\n\n';

  switch (platform) {
    case 'darwin':
      message += 'On macOS:\n';
      message += '  1. Ensure you have Keychain Access available\n';
      message += '  2. If prompted, click "Allow" or "Always Allow" to grant access\n';
      message += '  3. Check System Preferences > Security & Privacy if access was denied\n';
      break;
    case 'win32':
      message += 'On Windows:\n';
      message += '  1. Ensure Windows Credential Manager is available\n';
      message += '  2. Try running the CLI as administrator if access is denied\n';
      break;
    case 'linux':
      message += 'On Linux:\n';
      message += '  1. Ensure libsecret is installed (e.g., `sudo apt install libsecret-1-dev`)\n';
      message += '  2. Ensure a keyring service is running (GNOME Keyring, KWallet, etc.)\n';
      message += '  3. For headless servers, consider using an API key instead of `inkeep login`\n';
      break;
    default:
      message += 'Please ensure your system has a supported keychain/credential manager available.\n';
  }

  return message;
}

export { getKeychainUnavailableMessage };
