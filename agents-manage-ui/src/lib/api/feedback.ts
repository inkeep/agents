import type {
  FeedbackApiInsertSchema,
  FeedbackListResponse as FeedbackListResponseSchema,
} from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';
import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

export type Feedback = z.infer<typeof FeedbackListResponseSchema>['data'][number] & {
  agentId?: string | null;
};
export type FeedbackCreate = z.infer<typeof FeedbackApiInsertSchema>;
export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>;

export async function createFeedback(
  tenantId: string,
  projectId: string,
  feedbackData: FeedbackCreate
): Promise<Feedback> {
  const response = await makeManagementApiRequest<SingleResponse<Feedback>>(
    `tenants/${tenantId}/projects/${projectId}/feedback`,
    {
      method: 'POST',
      body: JSON.stringify(feedbackData),
    }
  );

  return response.data;
}

export async function fetchFeedback(
  tenantId: string,
  projectId: string,
  options?: {
    conversationId?: string;
    messageId?: string;
    agentId?: string;
    type?: 'positive' | 'negative';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }
): Promise<FeedbackListResponse> {
  const params = new URLSearchParams();
  if (options?.conversationId) params.set('conversationId', options.conversationId);
  if (options?.messageId) params.set('messageId', options.messageId);
  if (options?.agentId) params.set('agentId', options.agentId);
  if (options?.type) params.set('type', options.type);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const suffix = params.size ? `?${params.toString()}` : '';

  return makeManagementApiRequest<FeedbackListResponse>(
    `tenants/${tenantId}/projects/${projectId}/feedback${suffix}`
  );
}

export async function deleteFeedback(
  tenantId: string,
  projectId: string,
  feedbackId: string
): Promise<void> {
  await makeManagementApiRequest<{ success: boolean }>(
    `tenants/${tenantId}/projects/${projectId}/feedback/${feedbackId}`,
    {
      method: 'DELETE',
    }
  );
}
