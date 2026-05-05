import type { WebhookDeliveryPayload } from '../workflow/functions/webhookDelivery';

export const WEBHOOK_DELIVERY_TOPIC = 'webhook-delivery';

export async function dispatchViaQueue(payload: WebhookDeliveryPayload): Promise<void> {
  const { send } = await import('@vercel/queue');
  await send(WEBHOOK_DELIVERY_TOPIC, payload);
}
