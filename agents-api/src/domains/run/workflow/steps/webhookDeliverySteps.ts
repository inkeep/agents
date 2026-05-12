import { getLogger } from '../../../../logger';
import {
  fetchWithSsrfProtection,
  WebhookUrlSecurityError,
} from '../../../../utils/webhook-url-security';
import { FileSecurityError } from '../../../run/services/blob-storage/file-security-errors';

const logger = getLogger('workflow-webhook-delivery-steps');

export async function logStep(message: string, data: Record<string, unknown>) {
  'use step';
  logger.info(data, message);
}

export interface WebhookDeliveryAttemptResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  blocked?: boolean;
}

export async function deliverWebhookStep(params: {
  destinationUrl: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string> | null;
}): Promise<WebhookDeliveryAttemptResult> {
  'use step';

  const { destinationUrl, payload, headers } = params;

  const body = JSON.stringify(payload);

  try {
    const response = await fetchWithSsrfProtection(destinationUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'User-Agent': 'Inkeep-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      return { success: true, statusCode: response.status };
    }

    const responseText = await response.text().catch(() => '');
    logger.warn(
      {
        destinationUrl,
        statusCode: response.status,
        responseBody: responseText.slice(0, 500),
      },
      'Webhook delivery received non-2xx response'
    );
    return { success: false, statusCode: response.status, error: `HTTP ${response.status}` };
  } catch (err) {
    if (err instanceof WebhookUrlSecurityError || err instanceof FileSecurityError) {
      logger.warn(
        { destinationUrl, error: err.message },
        'Webhook delivery blocked by SSRF protection'
      );
      return { success: false, blocked: true, error: 'Destination URL blocked' };
    }
    logger.warn(
      { destinationUrl, error: err instanceof Error ? err.message : String(err) },
      'Webhook delivery network error'
    );
    return { success: false, error: 'Network error delivering webhook' };
  }
}
