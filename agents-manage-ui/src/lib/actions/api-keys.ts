'use server';

import { revalidatePath } from 'next/cache';
import {
  type ApiKey,
  type ApiKeyCreateResponse,
  createApiKey,
  deleteApiKey,
  fetchApiKeys,
  updateApiKey,
} from '../api/api-keys';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Fetch all API keys
 */
export async function fetchApiKeysAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<ApiKey[]>> {
  try {
    const result = await fetchApiKeys(tenantId, projectId);
    return {
      success: true,
      data: result.data,
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

export async function createApiKeyAction(
  tenantId: string,
  projectId: string,
  apiKeyData: Partial<ApiKey>
): Promise<ActionResult<ApiKeyCreateResponse>> {
  try {
    const result = await createApiKey(tenantId, projectId, apiKeyData);
    revalidatePath(`/${tenantId}/projects/${projectId}/api-keys`);
    return {
      success: true,
      data: result,
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

export async function deleteApiKeyAction(
  tenantId: string,
  projectId: string,
  apiKeyId: string
): Promise<ActionResult<void>> {
  try {
    await deleteApiKey(tenantId, projectId, apiKeyId);
    revalidatePath(`/${tenantId}/projects/${projectId}/api-keys`);
    return {
      success: true,
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

export async function updateApiKeyAction(
  tenantId: string,
  projectId: string,
  apiKeyData: Partial<ApiKey>
): Promise<ActionResult<ApiKey>> {
  try {
    const result = await updateApiKey(tenantId, projectId, apiKeyData);
    revalidatePath(`/${tenantId}/projects/${projectId}/api-keys`);
    return {
      success: true,
      data: result,
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
