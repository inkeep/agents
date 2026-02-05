import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  addRepositories,
  deleteInstallation,
  getInstallationByGitHubId,
  removeRepositories,
  updateInstallationStatusByGitHubId,
} from '@inkeep/agents-core';
import type { Context } from 'hono';
import { Hono } from 'hono';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { getWebhookSecret, isWebhookConfigured } from '../config';

const logger = getLogger('github-webhooks');

export interface WebhookVerificationResult {
  success: boolean;
  error?: string;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): WebhookVerificationResult {
  if (!signature) {
    return { success: false, error: 'Missing X-Hub-Signature-256 header' };
  }

  if (!signature.startsWith('sha256=')) {
    return { success: false, error: 'Invalid signature format' };
  }

  const providedSignature = signature.slice('sha256='.length);

  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  try {
    const providedBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedBuffer.length !== expectedBuffer.length) {
      return { success: false, error: 'Invalid signature' };
    }

    const isValid = timingSafeEqual(providedBuffer, expectedBuffer);

    if (!isValid) {
      return { success: false, error: 'Invalid signature' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Invalid signature format' };
  }
}

const app = new Hono();

app.post('/', async (c) => {
  if (!isWebhookConfigured()) {
    logger.error({}, 'GitHub webhook secret not configured');
    return c.json(
      {
        error: 'GitHub webhook secret not configured',
      },
      500
    );
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('X-Hub-Signature-256');
  const eventType = c.req.header('X-GitHub-Event');
  const deliveryId = c.req.header('X-GitHub-Delivery');

  logger.info({ eventType, deliveryId }, 'Received GitHub webhook');

  const secret = getWebhookSecret();
  const verificationResult = verifyWebhookSignature(rawBody, signature, secret);

  if (!verificationResult.success) {
    logger.warn(
      { eventType, deliveryId, error: verificationResult.error },
      'Webhook signature verification failed'
    );
    return c.json(
      {
        error: verificationResult.error,
      },
      401
    );
  }

  logger.info({ eventType, deliveryId }, 'Webhook signature verified');

  if (!eventType) {
    logger.warn({ deliveryId }, 'Missing X-GitHub-Event header');
    return c.json(
      {
        error: 'Missing X-GitHub-Event header',
      },
      400
    );
  }

  // Handle specific event types
  const payload = JSON.parse(rawBody);

  if (eventType === 'installation') {
    return handleInstallationEvent(c, payload, deliveryId);
  }

  if (eventType === 'installation_repositories') {
    return handleInstallationRepositoriesEvent(c, payload, deliveryId);
  }

  logger.info({ eventType, deliveryId }, 'Received unhandled event type, acknowledging');
  return c.json({ received: true }, 200);
});

// ============================================================================
// Installation Event Types
// ============================================================================

interface GitHubAccount {
  login: string;
  id: number;
  type: 'Organization' | 'User';
}

interface GitHubInstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend' | 'new_permissions_accepted';
  installation: {
    id: number;
    account: GitHubAccount;
  };
  repositories?: GitHubRepository[];
  sender: {
    login: string;
    id: number;
  };
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubInstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: {
    id: number;
    account: GitHubAccount;
  };
  repositories_added: GitHubRepository[];
  repositories_removed: GitHubRepository[];
  sender: {
    login: string;
    id: number;
  };
}

// ============================================================================
// Installation Event Handler
// ============================================================================

async function handleInstallationEvent(
  c: Context,
  payload: GitHubInstallationPayload,
  deliveryId: string | undefined
) {
  const { action, installation } = payload;
  const installationId = String(installation.id);

  logger.info(
    {
      action,
      deliveryId,
      installationId,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    },
    'Processing installation webhook event'
  );

  try {
    switch (action) {
      case 'created': {
        // Check if this installation already exists (might have been created via callback)
        const existing = await getInstallationByGitHubId(runDbClient)(installationId);

        if (existing) {
          // If existing with 'pending' status, activate it
          if (existing.status === 'pending') {
            logger.info(
              { installationId, existingId: existing.id },
              'Activating pending installation'
            );
            await updateInstallationStatusByGitHubId(runDbClient)({
              gitHubInstallationId: installationId,
              status: 'active',
            });
          } else {
            logger.info(
              { installationId, existingId: existing.id, currentStatus: existing.status },
              'Installation already exists, no action needed'
            );
          }
        } else {
          // This shouldn't happen in normal flow (callback creates the installation)
          // but handle it defensively - we don't have tenantId from webhook
          logger.warn(
            { installationId, accountLogin: installation.account.login },
            'Received created event for unknown installation - cannot create without tenant association'
          );
        }

        // Add initial repositories if provided
        if (existing && payload.repositories && payload.repositories.length > 0) {
          const repos = payload.repositories.map((repo) => ({
            repositoryId: String(repo.id),
            repositoryName: repo.name,
            repositoryFullName: repo.full_name,
            private: repo.private,
          }));

          await addRepositories(runDbClient)({
            installationId: existing.id,
            repositories: repos,
          });

          logger.info(
            { installationId, repositoryCount: repos.length },
            'Added initial repositories from installation created event'
          );
        }
        break;
      }

      case 'deleted': {
        const existing = await getInstallationByGitHubId(runDbClient)(installationId);

        if (existing) {
          logger.info({ installationId, existingId: existing.id }, 'Deleting installation');
          await deleteInstallation(runDbClient)({
            tenantId: existing.tenantId,
            id: existing.id,
          });
        } else {
          logger.warn({ installationId }, 'Received deleted event for unknown installation');
        }
        break;
      }

      case 'suspend': {
        const existing = await getInstallationByGitHubId(runDbClient)(installationId);

        if (existing) {
          logger.info({ installationId, existingId: existing.id }, 'Suspending installation');
          await updateInstallationStatusByGitHubId(runDbClient)({
            gitHubInstallationId: installationId,
            status: 'suspended',
          });
        } else {
          logger.warn({ installationId }, 'Received suspend event for unknown installation');
        }
        break;
      }

      case 'unsuspend': {
        const existing = await getInstallationByGitHubId(runDbClient)(installationId);

        if (existing) {
          logger.info({ installationId, existingId: existing.id }, 'Unsuspending installation');
          await updateInstallationStatusByGitHubId(runDbClient)({
            gitHubInstallationId: installationId,
            status: 'active',
          });
        } else {
          logger.warn({ installationId }, 'Received unsuspend event for unknown installation');
        }
        break;
      }

      case 'new_permissions_accepted': {
        // Log for debugging, but no action needed - permissions are handled on GitHub side
        logger.info({ installationId }, 'New permissions accepted for installation');
        break;
      }

      default:
        logger.info({ action, deliveryId }, 'Received unhandled installation action');
    }

    return c.json({ received: true, action }, 200);
  } catch (error) {
    logger.error(
      { error, action, installationId, deliveryId },
      'Failed to process installation event'
    );
    // Return 200 to acknowledge receipt - GitHub will retry on 5xx
    return c.json({ received: true, error: 'Processing failed' }, 200);
  }
}

// ============================================================================
// Installation Repositories Event Handler
// ============================================================================

async function handleInstallationRepositoriesEvent(
  c: Context,
  payload: GitHubInstallationRepositoriesPayload,
  deliveryId: string | undefined
) {
  const { action, installation, repositories_added, repositories_removed } = payload;
  const installationId = String(installation.id);

  logger.info(
    {
      action,
      deliveryId,
      installationId,
      accountLogin: installation.account.login,
      addedCount: repositories_added?.length ?? 0,
      removedCount: repositories_removed?.length ?? 0,
    },
    'Processing installation_repositories webhook event'
  );

  try {
    // Find our internal installation record
    const existing = await getInstallationByGitHubId(runDbClient)(installationId);

    if (!existing) {
      logger.warn(
        { installationId, accountLogin: installation.account.login },
        'Received repository event for unknown installation'
      );
      return c.json({ received: true, warning: 'Unknown installation' }, 200);
    }

    // Ignore events for deleted installations
    if (existing.status === 'deleted') {
      logger.info({ installationId }, 'Ignoring repository event for deleted installation');
      return c.json({ received: true, skipped: 'Installation deleted' }, 200);
    }

    if (action === 'added' && repositories_added && repositories_added.length > 0) {
      const repos = repositories_added.map((repo) => ({
        repositoryId: String(repo.id),
        repositoryName: repo.name,
        repositoryFullName: repo.full_name,
        private: repo.private,
      }));

      const added = await addRepositories(runDbClient)({
        installationId: existing.id,
        repositories: repos,
      });

      logger.info(
        { installationId, addedCount: added.length, requestedCount: repos.length },
        'Added repositories to installation'
      );
    }

    if (action === 'removed' && repositories_removed && repositories_removed.length > 0) {
      const repoIds = repositories_removed.map((repo) => String(repo.id));

      const removedCount = await removeRepositories(runDbClient)({
        installationId: existing.id,
        repositoryIds: repoIds,
      });

      logger.info(
        { installationId, removedCount, requestedCount: repoIds.length },
        'Removed repositories from installation'
      );
    }

    return c.json({ received: true, action }, 200);
  } catch (error) {
    logger.error(
      { error, action, installationId, deliveryId },
      'Failed to process installation_repositories event'
    );
    // Return 200 to acknowledge receipt - GitHub will retry on 5xx
    return c.json({ received: true, error: 'Processing failed' }, 200);
  }
}

export default app;
