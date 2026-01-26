import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { getLogger } from '../../../logger';
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

  logger.info({ eventType, deliveryId }, 'Received unhandled event type, acknowledging');
  return c.json({ received: true }, 200);
});

export default app;
