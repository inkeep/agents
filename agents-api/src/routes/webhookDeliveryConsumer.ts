import { FileSecurityError } from '../domains/run/services/blob-storage/file-security-errors';
import {
  type WebhookDeliveryPayload,
  WebhookDeliveryPayloadSchema,
} from '../domains/run/workflow/functions/webhookDelivery';
import { getLogger } from '../logger';
import { fetchWithSsrfProtection, WebhookUrlSecurityError } from '../utils/webhook-url-security';

const logger = getLogger('webhook-delivery-consumer');

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Webhook delivery queue message has invalid JSON; dropping'
    );
    return new Response('OK', { status: 200 });
  }

  const parsed = WebhookDeliveryPayloadSchema.safeParse((body as { data?: unknown } | null)?.data);
  if (!parsed.success) {
    logger.error(
      { error: parsed.error.message },
      'Webhook delivery queue message failed schema validation; dropping (poison-pill protection)'
    );
    return new Response('OK', { status: 200 });
  }
  const payload: WebhookDeliveryPayload = parsed.data;

  const { destinationUrl, webhookDestinationId } = payload;

  try {
    const response = await fetchWithSsrfProtection(destinationUrl, {
      method: 'POST',
      headers: {
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
      return new Response('OK', { status: 200 });
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
      return new Response('OK', { status: 200 });
    }

    return new Response('Retry', { status: 500 });
  } catch (err) {
    if (err instanceof WebhookUrlSecurityError || err instanceof FileSecurityError) {
      logger.warn(
        { webhookDestinationId, error: (err as Error).message },
        'Webhook delivery blocked by SSRF protection'
      );
      return new Response('OK', { status: 200 });
    }
    logger.error(
      { webhookDestinationId, error: err instanceof Error ? err.message : String(err) },
      'Webhook delivery failed'
    );
    return new Response('Retry', { status: 500 });
  }
}
