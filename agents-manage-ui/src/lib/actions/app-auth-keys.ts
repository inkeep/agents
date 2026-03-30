'use server';

import { revalidatePath } from 'next/cache';
import {
  addAppAuthKey,
  deleteAppAuthKey,
  fetchAppAuthKeys,
  type PublicKeyConfig,
} from '../api/app-auth-keys';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchAppAuthKeysAction(
  tenantId: string,
  projectId: string,
  appId: string
): Promise<ActionResult<PublicKeyConfig[]>> {
  try {
    const keys = await fetchAppAuthKeys(tenantId, projectId, appId);
    return { success: true, data: keys };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function addAppAuthKeyAction(
  tenantId: string,
  projectId: string,
  appId: string,
  body: { kid: string; publicKey: string; algorithm: string }
): Promise<ActionResult<PublicKeyConfig>> {
  try {
    const key = await addAppAuthKey(tenantId, projectId, appId, body);
    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
    return { success: true, data: key };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}

export async function deleteAppAuthKeyAction(
  tenantId: string,
  projectId: string,
  appId: string,
  kid: string
): Promise<ActionResult<void>> {
  try {
    await deleteAppAuthKey(tenantId, projectId, appId, kid);
    revalidatePath(`/${tenantId}/projects/${projectId}/apps`);
    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      code: 'unknown_error',
    };
  }
}
