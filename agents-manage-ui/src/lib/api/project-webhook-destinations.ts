'use server';

import type { WebhookDestination } from './webhook-destinations';
import { fetchWebhookDestinations } from './webhook-destinations';

export async function fetchProjectWebhookDestinations(
  tenantId: string,
  projectId: string,
  agentId?: string
): Promise<WebhookDestination[]> {
  const { data } = await fetchWebhookDestinations(tenantId, projectId, agentId);
  return data;
}
