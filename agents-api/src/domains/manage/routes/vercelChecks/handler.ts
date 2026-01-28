import { Hono } from 'hono';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { createCheck, updateCheck, type VercelChecksClientConfig } from './client';
import { VercelWebhookEventSchema, type VercelWebhookEvent } from './schemas';
import { validateVercelSignature } from './signature';

const logger = getLogger('vercel-checks-webhook');

function getVercelChecksConfig() {
  return {
    VERCEL_CHECKS_ENABLED: env.VERCEL_CHECKS_ENABLED,
    VERCEL_INTEGRATION_SECRET: env.VERCEL_INTEGRATION_SECRET,
    VERCEL_CHECKS_TOKEN: env.VERCEL_CHECKS_TOKEN,
    VERCEL_TEAM_ID: env.VERCEL_TEAM_ID,
  };
}

function isVercelChecksEnabled(): boolean {
  const config = getVercelChecksConfig();
  return config.VERCEL_CHECKS_ENABLED === true;
}

function getClientConfig(): VercelChecksClientConfig | null {
  const config = getVercelChecksConfig();
  if (!config.VERCEL_CHECKS_TOKEN) {
    return null;
  }
  return {
    token: config.VERCEL_CHECKS_TOKEN,
    teamId: config.VERCEL_TEAM_ID,
  };
}

async function performReadinessCheck(deploymentUrl: string): Promise<boolean> {
  try {
    const url = `https://${deploymentUrl}/ready`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch (error) {
    logger.error({ error, deploymentUrl }, 'Failed to perform readiness check');
    return false;
  }
}

async function handleDeploymentCreated(event: VercelWebhookEvent): Promise<void> {
  if (event.type !== 'deployment.created') return;

  const { deployment } = event.payload;
  const clientConfig = getClientConfig();

  if (!clientConfig) {
    logger.error({}, 'VERCEL_CHECKS_TOKEN is not configured');
    return;
  }

  logger.info(
    { deploymentId: deployment.id, deploymentUrl: deployment.url },
    'Registering blocking check for new deployment'
  );

  try {
    const check = await createCheck(
      deployment.id,
      {
        name: 'Readiness Check',
        blocking: true,
        rerequestable: true,
      },
      clientConfig
    );

    logger.info(
      { deploymentId: deployment.id, checkId: check.id },
      'Successfully registered blocking check'
    );
  } catch (error) {
    logger.error({ error, deploymentId: deployment.id }, 'Failed to register blocking check');
  }
}

async function handleDeploymentReady(event: VercelWebhookEvent): Promise<void> {
  if (event.type !== 'deployment.ready') return;

  const { deployment } = event.payload;
  const clientConfig = getClientConfig();

  if (!clientConfig) {
    logger.error({}, 'VERCEL_CHECKS_TOKEN is not configured');
    return;
  }

  logger.info(
    { deploymentId: deployment.id, deploymentUrl: deployment.url },
    'Deployment ready, performing readiness check'
  );

  const isReady = await performReadinessCheck(deployment.url);

  try {
    const response = await fetch(
      `https://api.vercel.com/v1/deployments/${deployment.id}/checks${clientConfig.teamId ? `?teamId=${clientConfig.teamId}` : ''}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${clientConfig.token}`,
        },
      }
    );

    if (!response.ok) {
      logger.error(
        { deploymentId: deployment.id, status: response.status },
        'Failed to fetch checks for deployment'
      );
      return;
    }

    const checksData = (await response.json()) as { checks: Array<{ id: string; name: string }> };
    const readinessCheck = checksData.checks?.find((c) => c.name === 'Readiness Check');

    if (!readinessCheck) {
      logger.warn({ deploymentId: deployment.id }, 'No readiness check found for deployment');
      return;
    }

    await updateCheck(
      deployment.id,
      readinessCheck.id,
      {
        conclusion: isReady ? 'succeeded' : 'failed',
      },
      clientConfig
    );

    logger.info(
      {
        deploymentId: deployment.id,
        checkId: readinessCheck.id,
        conclusion: isReady ? 'succeeded' : 'failed',
      },
      'Updated check conclusion'
    );
  } catch (error) {
    logger.error({ error, deploymentId: deployment.id }, 'Failed to update check conclusion');
  }
}

async function handleCheckRerequested(event: VercelWebhookEvent): Promise<void> {
  if (event.type !== 'deployment.check-rerequested') return;

  const { deployment, check } = event.payload;
  const clientConfig = getClientConfig();

  if (!clientConfig) {
    logger.error({}, 'VERCEL_CHECKS_TOKEN is not configured');
    return;
  }

  if (!check?.id) {
    logger.warn({ deploymentId: deployment.id }, 'No check ID in rerun request');
    return;
  }

  logger.info(
    { deploymentId: deployment.id, checkId: check.id },
    'Re-running readiness check'
  );

  const isReady = await performReadinessCheck(deployment.url);

  try {
    await updateCheck(
      deployment.id,
      check.id,
      {
        conclusion: isReady ? 'succeeded' : 'failed',
      },
      clientConfig
    );

    logger.info(
      {
        deploymentId: deployment.id,
        checkId: check.id,
        conclusion: isReady ? 'succeeded' : 'failed',
      },
      'Updated check conclusion after rerun'
    );
  } catch (error) {
    logger.error({ error, deploymentId: deployment.id, checkId: check.id }, 'Failed to update check after rerun');
  }
}

export const vercelChecksWebhookHandler = new Hono();

vercelChecksWebhookHandler.post('/checks-webhook', async (c) => {
  if (!isVercelChecksEnabled()) {
    return c.json({ error: 'Not Found' }, 404);
  }

  const config = getVercelChecksConfig();
  const signature = c.req.header('x-vercel-signature');

  if (!signature || !config.VERCEL_INTEGRATION_SECRET) {
    logger.warn({}, 'Missing signature or integration secret');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const rawBody = await c.req.text();

  if (!validateVercelSignature(rawBody, signature, config.VERCEL_INTEGRATION_SECRET)) {
    logger.warn({}, 'Invalid webhook signature');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn({}, 'Invalid JSON payload');
    return c.json({ error: 'Bad Request' }, 400);
  }

  const parseResult = VercelWebhookEventSchema.safeParse(payload);

  if (!parseResult.success) {
    logger.warn({ errors: parseResult.error.issues }, 'Invalid webhook payload');
    return c.json({ error: 'Bad Request', details: parseResult.error.issues }, 400);
  }

  const event = parseResult.data;

  logger.info({ type: event.type, eventId: event.id }, 'Processing Vercel webhook event');

  switch (event.type) {
    case 'deployment.created':
      await handleDeploymentCreated(event);
      break;
    case 'deployment.ready':
      await handleDeploymentReady(event);
      break;
    case 'deployment.check-rerequested':
      await handleCheckRerequested(event);
      break;
  }

  return c.json({ received: true }, 200);
});
