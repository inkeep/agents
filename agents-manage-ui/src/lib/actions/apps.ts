'use server';

import { revalidatePath } from 'next/cache';
import { type App, type AppCreateResponse, createApp, deleteApp, updateApp } from '../api/apps';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function createAppAction(
  tenantId: string,
  projectId: string,
  appData: Record<string, unknown>
): Promise<ActionResult<AppCreateResponse>> {
  try {
    const result = await createApp(tenantId, projectId, appData);
    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
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

export async function updateAppAction(
  tenantId: string,
  projectId: string,
  appId: string,
  appData: Record<string, unknown>
): Promise<ActionResult<App>> {
  try {
    const result = await updateApp(tenantId, projectId, appId, appData);
    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
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

export async function deleteAppAction(
  tenantId: string,
  projectId: string,
  appId: string
): Promise<ActionResult<void>> {
  try {
    await deleteApp(tenantId, projectId, appId);
    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
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
