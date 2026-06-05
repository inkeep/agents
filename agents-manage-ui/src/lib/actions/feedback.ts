'use server';

import { revalidatePath } from 'next/cache';
import {
  createFeedback,
  createFeedbackBulk,
  deleteFeedback,
  type Feedback,
  type FeedbackCreate,
  fetchFeedback,
} from '../api/feedback';
import type { ParsedFeedbackItem } from '../csv/feedback-csv';
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

export async function hasConversationFeedbackAction(
  tenantId: string,
  projectId: string,
  conversationId: string
): Promise<boolean> {
  try {
    const result = await fetchFeedback(tenantId, projectId, { conversationId, limit: 1 });
    return result.data.length > 0;
  } catch {
    return false;
  }
}

export interface BulkFeedbackRowError {
  rowIndex: number;
  conversationId: string;
  message: string;
}

export interface BulkFeedbackResult {
  created: number;
  failed: number;
  errors: BulkFeedbackRowError[];
}

export async function createFeedbackBulkAction(
  tenantId: string,
  projectId: string,
  items: ParsedFeedbackItem[]
): Promise<ActionResult<BulkFeedbackResult>> {
  try {
    const response = await createFeedbackBulk(
      tenantId,
      projectId,
      items.map((item) => ({
        conversationId: item.conversationId,
        type: item.type,
        messageId: item.messageId,
        details: item.details,
      }))
    );

    const errors: BulkFeedbackRowError[] = response.errors.map((err) => ({
      rowIndex: err.index,
      conversationId: err.conversationId,
      message: err.message,
    }));

    revalidatePath(`/${tenantId}/projects/${projectId}/feedback`);
    return {
      success: true,
      data: {
        created: response.data.length,
        failed: errors.length,
        errors,
      },
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
