import { handleCallback } from '@vercel/queue';
import { FileSecurityError } from '../domains/run/services/blob-storage/file-security-errors';
import {
  type WebhookDeliveryPayload,
  WebhookDeliveryPayloadSchema,
} from '../domains/run/workflow/functions/webhookDelivery';
import { getLogger } from '../logger';
import { fetchWithSsrfProtection, WebhookUrlSecurityError } from '../utils/webhook-url-security';

const logger = getLogger('webhook-delivery-consumer');

class RetryableDeliveryError extends Error {}

export async function deliverWebhook(payload: WebhookDeliveryPayload): Promise<void> {
  const { destinationUrl, webhookDestinationId } = payload;

  try {
    const response = await fetchWithSsrfProtection(destinationUrl, {
      method: 'POST',
      headers: {
        ...payload.headers,
        'Content-Type': 'application/json',
        'User-Agent': 'Inkeep-Webhooks/1.0',
      },
      body: JSON.stringify(payload.payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      logger.info(
        { webhookDestinationId, statusCode: response.status },
        'Webhook delivered successfully'
      );
      return;
    }

    const responseText = await response.text().catch(() => '');
    logger.warn(
      {
        webhookDestinationId,
        statusCode: response.status,
        responseBody: responseText.slice(0, 500),
      },
      'Webhook delivery received non-2xx response'
    );

    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      return;
    }

    throw new RetryableDeliveryError(
      `Webhook delivery to ${webhookDestinationId} failed with status ${response.status}`
    );
  } catch (err) {
    if (err instanceof RetryableDeliveryError) {
      throw err;
    }
    if (err instanceof WebhookUrlSecurityError || err instanceof FileSecurityError) {
      logger.warn(
        { webhookDestinationId, error: (err as Error).message },
        'Webhook delivery blocked by SSRF protection'
      );
      return;
    }
    logger.error(
      { webhookDestinationId, error: err instanceof Error ? err.message : String(err) },
      'Webhook delivery failed'
    );
    throw err;
  }
}

export async function handleWebhookMessage(message: unknown, metadata: { messageId: string }) {
  const parsed = WebhookDeliveryPayloadSchema.safeParse(message);
  if (!parsed.success) {
    logger.error(
      { error: parsed.error.message, messageId: metadata.messageId },
      'Webhook delivery queue message failed schema validation'
    );
    return;
  }

  await deliverWebhook(parsed.data);
}

export const POST = handleCallback(handleWebhookMessage);
