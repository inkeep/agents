'use server';

import { revalidatePath } from 'next/cache';
import { createFeedback, deleteFeedback, type Feedback, type FeedbackCreate } from '../api/feedback';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function createFeedbackAction(
  tenantId: string,
  projectId: string,
  feedbackData: FeedbackCreate
): Promise<ActionResult<Feedback>> {
  try {
    const feedback = await createFeedback(tenantId, projectId, feedbackData);
    revalidatePath(`/${tenantId}/projects/${projectId}/feedback`);
    return {
      success: true,
      data: feedback,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function deleteFeedbackAction(
  tenantId: string,
  projectId: string,
  feedbackId: string
): Promise<ActionResult<void>> {
  try {
    await deleteFeedback(tenantId, projectId, feedbackId);
    revalidatePath(`/${tenantId}/projects/${projectId}/feedback`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.error.code,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

