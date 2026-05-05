'use server';

import { revalidatePath } from 'next/cache';
import {
  type CreateWebhookDestinationInput,
  createWebhookDestination,
  deleteWebhookDestination,
  testWebhookDestination,
  type UpdateWebhookDestinationInput,
  updateWebhookDestination,
  type WebhookDestination,
} from '../api/webhook-destinations';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function createWebhookDestinationAction(
  tenantId: string,
  projectId: string,
  data: CreateWebhookDestinationInput
): Promise<ActionResult<WebhookDestination>> {
  try {
    const result = await createWebhookDestination(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/webhook-destinations`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create outbound webhook',
      code: 'unknown_error',
    };
  }
}

export async function updateWebhookDestinationAction(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string,
  data: UpdateWebhookDestinationInput
): Promise<ActionResult<WebhookDestination>> {
  try {
    const result = await updateWebhookDestination(tenantId, projectId, webhookDestinationId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/webhook-destinations`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update outbound webhook',
      code: 'unknown_error',
    };
  }
}

export async function updateWebhookDestinationEnabledAction(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string,
  enabled: boolean
): Promise<ActionResult<WebhookDestination>> {
  try {
    const result = await updateWebhookDestination(tenantId, projectId, webhookDestinationId, {
      enabled,
    });
    revalidatePath(`/${tenantId}/projects/${projectId}/webhook-destinations`);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle outbound webhook',
      code: 'unknown_error',
    };
  }
}

export async function deleteWebhookDestinationAction(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string
): Promise<ActionResult<void>> {
  try {
    await deleteWebhookDestination(tenantId, projectId, webhookDestinationId);
    revalidatePath(`/${tenantId}/projects/${projectId}/webhook-destinations`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete outbound webhook',
      code: 'unknown_error',
    };
  }
}

export async function testWebhookDestinationAction(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string
): Promise<ActionResult<{ success: boolean; statusCode?: number; error?: string }>> {
  try {
    const result = await testWebhookDestination(tenantId, projectId, webhookDestinationId);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test outbound webhook',
      code: 'unknown_error',
    };
  }
}
