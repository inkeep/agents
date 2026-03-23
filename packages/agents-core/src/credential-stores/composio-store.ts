import { CredentialStoreType } from '../types';
import type { CredentialStore } from '../types/server';
import { getLogger } from '../utils/logger';
import {
  deleteComposioConnectedAccount,
  getComposioInstance,
} from '../utils/third-party-mcp-servers';

const logger = getLogger('composio-store');

/**
 * Composio credential store.
 *
 * Composio handles OAuth/auth internally via MCP URL query params.
 * The connected account ID is stored in the credential reference's
 * retrievalParams and injected into the URL at runtime.
 *
 * The key passed to get/has/delete is the Composio connected_account_id.
 */
export class ComposioCredentialStore implements CredentialStore {
  public readonly id: string;
  public readonly type = CredentialStoreType.composio;

  constructor(id: string) {
    this.id = id;
  }

  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<void> {}

  async has(key: string): Promise<boolean> {
    const composio = getComposioInstance();
    if (!composio) return false;

    try {
      const account = await composio.connectedAccounts.get(key);
      return account?.status === 'ACTIVE';
    } catch (error) {
      logger.warn(
        { error, connectedAccountId: key },
        'Failed to check Composio connected account status - treating as unavailable'
      );
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    return deleteComposioConnectedAccount(key);
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    if (!process.env.COMPOSIO_API_KEY) {
      return { available: false, reason: 'COMPOSIO_API_KEY not configured' };
    }
    return { available: true };
  }
}
