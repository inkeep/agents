import { getWorkflowMetadata, sleep } from 'workflow';
import { z } from 'zod';
import { deliverWebhookStep, logStep } from '../steps/webhookDeliverySteps';

export const WebhookDeliveryPayloadSchema = z.object({
  destinationUrl: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  agentId: z.string(),
  webhookDestinationId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type WebhookDeliveryPayload = z.infer<typeof WebhookDeliveryPayloadSchema>;

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 2_000;

async function _webhookDeliveryWorkflow(deliveryPayload: WebhookDeliveryPayload) {
  'use workflow';

  const { destinationUrl, tenantId, projectId, agentId, webhookDestinationId, payload } =
    deliveryPayload;

  const metadata = getWorkflowMetadata();

  await logStep('Starting webhook delivery workflow', {
    tenantId,
    projectId,
    agentId,
    webhookDestinationId,
    destinationUrl,
    eventType: payload.type as string,
    workflowRunId: metadata.workflowRunId,
  });

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await deliverWebhookStep({
      destinationUrl,
      payload,
    });

    if (result.success) {
      await logStep('Webhook delivered successfully', {
        webhookDestinationId,
        attempt,
        statusCode: result.statusCode,
      });
      return { status: 'delivered', attempt, statusCode: result.statusCode };
    }

    lastError = result.error;

    const nonRetryableStatus =
      result.statusCode &&
      result.statusCode >= 400 &&
      result.statusCode < 500 &&
      result.statusCode !== 408 &&
      result.statusCode !== 429;

    if (nonRetryableStatus || result.blocked) {
      await logStep('Webhook delivery failed with non-retryable status', {
        webhookDestinationId,
        attempt,
        statusCode: result.statusCode,
        error: lastError,
      });
      return { status: 'failed', attempt, statusCode: result.statusCode, error: lastError };
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * 0.3;
      await sleep(backoffMs * (1 + jitter));
    }
  }

  await logStep('Webhook delivery exhausted all retries', {
    webhookDestinationId,
    maxAttempts: MAX_ATTEMPTS,
    error: lastError,
  });

  return { status: 'failed', attempt: MAX_ATTEMPTS, error: lastError };
}

export const webhookDeliveryWorkflow = Object.assign(_webhookDeliveryWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/webhookDelivery//_webhookDeliveryWorkflow',
});
