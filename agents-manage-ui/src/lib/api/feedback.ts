/**
 * API Client for Feedback Operations
 */

'use server';

import { FeedbackApiInsertSchema, FeedbackApiSelectSchema } from '@inkeep/agents-core/client-exports';
import type { z } from 'zod';
import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export type Feedback = z.infer<typeof FeedbackApiSelectSchema>;
export type FeedbackCreate = z.infer<typeof FeedbackApiInsertSchema>;

export interface FeedbackListResponse {
  data: Feedback[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function createFeedback(
  tenantId: string,
  projectId: string,
  feedbackData: FeedbackCreate
): Promise<Feedback> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

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
    page?: number;
    limit?: number;
  }
): Promise<FeedbackListResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams();
  if (options?.conversationId) params.set('conversationId', options.conversationId);
  if (options?.messageId) params.set('messageId', options.messageId);
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
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<{ success: boolean }>(
    `tenants/${tenantId}/projects/${projectId}/feedback/${feedbackId}`,
    {
      method: 'DELETE',
    }
  );
}

