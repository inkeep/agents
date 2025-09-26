/**
 * Server actions for credential operations with path revalidation
 */

'use server';

import { revalidatePath } from 'next/cache';
import { type Credential, deleteCredential, fetchCredentials } from '../api/credentials';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

/**
 * Delete a credential
 */
export async function deleteCredentialAction(
  tenantId: string,
  projectId: string,
  credentialId: string
): Promise<ActionResult<void>> {
  try {
    await deleteCredential(tenantId, projectId, credentialId);
    revalidatePath(`/${tenantId}/projects/${projectId}/credentials`);
    revalidatePath(`/${tenantId}/projects/${projectId}/credentials/${credentialId}`);
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

/**
 * Fetch all credentials
 */
export async function fetchCredentialsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Credential[]>> {
  try {
    const result = await fetchCredentials(tenantId, projectId);
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
