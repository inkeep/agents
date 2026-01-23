// ============================================================
// src/lib/nango.ts
// Nango credential store integration using official SDK
// ============================================================

/**
 * TODO: Replace with actual agents-core import once monorepo is set up:
 * import { NangoCredentialStore } from '@inkeep/agents-core/credentials';
 */

import { Nango } from '@nangohq/node';
import { getEnv } from './env';

// ============================================================
// Types
// ============================================================

interface NangoConnectionCredentials {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  scope?: string;
}

// ============================================================
// Client Singleton
// ============================================================

let nangoClient: Nango | null = null;

/**
 * Get the Nango client singleton
 * Aligned with existing NangoCredentialStore patterns
 */
export function getNango(): Nango {
  if (!nangoClient) {
    const env = getEnv();
    nangoClient = new Nango({
      secretKey: env.NANGO_SECRET_KEY,
      host: env.NANGO_SERVER_URL,
    });
  }
  return nangoClient;
}

// ============================================================
// Token Retrieval
// ============================================================

/**
 * Get Slack bot token using the Nango connection ID stored on the workspace
 *
 * KEY POINT: We do NOT derive connectionId from teamId.
 * Nango Connect Sessions generate random connectionIds which we store
 * on the workspace record (nangoConnectionId field).
 *
 * @param nangoConnectionId - The Nango-generated connection ID from workspace record
 */
export async function getSlackBotTokenByConnectionId(
  nangoConnectionId: string
): Promise<string | null> {
  try {
    const nango = getNango();
    const env = getEnv();

    // Add timeout for external API call
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Nango API timeout')), 5000)
    );

    const connectionPromise = nango.getConnection(env.NANGO_INTEGRATION_ID, nangoConnectionId);

    const connection = await Promise.race([connectionPromise, timeoutPromise]);
    const credentials = connection.credentials as NangoConnectionCredentials;

    return credentials?.access_token ?? null;
  } catch (_error) {
    // Log error but don't expose internal details (truncate connection ID)
    console.error(
      `[Nango] Failed to get bot token for connection: ${nangoConnectionId.substring(0, 8)}...`
    );
    return null;
  }
}

// ============================================================
// Connection Management
// ============================================================

/**
 * Get full connection details (for debugging/admin)
 */
export async function getConnectionDetails(nangoConnectionId: string) {
  try {
    const nango = getNango();
    const env = getEnv();

    return await nango.getConnection(env.NANGO_INTEGRATION_ID, nangoConnectionId);
  } catch (error) {
    console.error('[Nango] Failed to get connection details:', error);
    return null;
  }
}

/**
 * Delete a Nango connection (used when uninstalling)
 */
export async function deleteConnection(nangoConnectionId: string): Promise<boolean> {
  try {
    const nango = getNango();
    const env = getEnv();

    await nango.deleteConnection(env.NANGO_INTEGRATION_ID, nangoConnectionId);
    console.log(`[Nango] Deleted connection: ${nangoConnectionId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    console.error('[Nango] Failed to delete connection:', error);
    return false;
  }
}

/**
 * List all Slack connections (for admin/debugging)
 */
export async function listConnections() {
  try {
    const nango = getNango();
    const env = getEnv();

    const result = await nango.listConnections();
    return result.connections.filter(
      (conn) => conn.provider_config_key === env.NANGO_INTEGRATION_ID
    );
  } catch (error) {
    console.error('[Nango] Failed to list connections:', error);
    return [];
  }
}

// ============================================================
// Connect Sessions (OAuth Flow)
// ============================================================

/**
 * Create a Connect Session for OAuth flow
 *
 * This is the recommended Nango flow:
 * 1. Backend creates a Connect Session with end_user context
 * 2. Frontend redirects to the returned connect_link
 * 3. Nango handles OAuth and sends webhook with the new connectionId
 * 4. We store that connectionId on the workspace record
 *
 * @param options.endUserId - Unique identifier for the installing user/org (e.g., tenantId:projectId)
 * @param options.organization - Optional organization context
 * @param options.metadata - Optional metadata to attach to the connection
 */
export async function createConnectSession(options: {
  endUserId: string;
  organization?: {
    id: string;
    displayName?: string;
  };
  metadata?: Record<string, string>;
}): Promise<{ sessionToken: string; connectUrl: string } | null> {
  try {
    const nango = getNango();
    const env = getEnv();

    // Add timeout for external API call
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Nango API timeout')), 10000)
    );

    // Create session using Nango's Connect Sessions API
    // Docs: https://docs.nango.dev/guides/authorize/overview
    const sessionPromise = nango.createConnectSession({
      end_user: {
        id: options.endUserId,
        ...(options.organization && { organization: options.organization }),
      },
      allowed_integrations: [env.NANGO_INTEGRATION_ID],
    });

    const session = await Promise.race([sessionPromise, timeoutPromise]);

    console.log(`[Nango] Created connect session for: ${options.endUserId}`);

    return {
      sessionToken: session.data.token,
      connectUrl: `https://connect.nango.dev/${session.data.token}`,
    };
  } catch (_error) {
    console.error('[Nango] Failed to create connect session');
    return null;
  }
}

// ============================================================
// Metadata Operations
// ============================================================

/**
 * Get connection metadata
 */
export async function getConnectionMetadata(
  nangoConnectionId: string
): Promise<Record<string, unknown> | null> {
  try {
    const nango = getNango();
    const env = getEnv();

    const connection = await nango.getConnection(env.NANGO_INTEGRATION_ID, nangoConnectionId);

    return (connection.metadata as Record<string, unknown>) || null;
  } catch (error) {
    console.error('[Nango] Failed to get connection metadata:', error);
    return null;
  }
}

/**
 * Update connection metadata
 */
export async function updateConnectionMetadata(
  nangoConnectionId: string,
  metadata: Record<string, unknown>
): Promise<boolean> {
  try {
    const nango = getNango();
    const env = getEnv();

    await nango.updateMetadata(env.NANGO_INTEGRATION_ID, nangoConnectionId, metadata);

    console.log(`[Nango] Updated metadata for connection: ${nangoConnectionId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    console.error('[Nango] Failed to update connection metadata:', error);
    return false;
  }
}

// ============================================================
// Webhook Verification
// ============================================================

/**
 * Verify incoming Nango webhook request
 * Uses HMAC-SHA256 signature verification
 *
 * @param rawBody - Raw request body as string
 * @param signature - X-Nango-Signature header value
 */
export async function verifyNangoWebhook(
  rawBody: string,
  signature: string
): Promise<{ verified: boolean; payload: unknown }> {
  const env = getEnv();
  const verifySecret = env.NANGO_WEBHOOK_VERIFY_SECRET;

  if (!verifySecret) {
    console.warn('⚠️  NANGO_WEBHOOK_VERIFY_SECRET not set - skipping verification');
    return { verified: false, payload: JSON.parse(rawBody) };
  }

  try {
    const crypto = await import('node:crypto');

    const expectedSignature = crypto
      .createHmac('sha256', verifySecret)
      .update(rawBody)
      .digest('hex');

    const verified = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!verified) {
      console.warn('[Nango] Webhook signature mismatch');
    }

    return { verified, payload: JSON.parse(rawBody) };
  } catch (error) {
    console.error('[Nango] Webhook verification failed:', error);
    return { verified: false, payload: null };
  }
}

// ============================================================
// Aliases (for backward compatibility)
// ============================================================

export {
  deleteConnection as deleteNangoConnection,
  getConnectionMetadata as getNangoConnectionMetadata,
  updateConnectionMetadata as updateNangoConnectionMetadata,
  createConnectSession as createNangoConnectSession,
};
