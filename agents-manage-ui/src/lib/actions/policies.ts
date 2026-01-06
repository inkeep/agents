'use server';

import type { PolicyApiInsert, PolicyApiUpdate } from '@inkeep/agents-core';
import { revalidatePath } from 'next/cache';
import {
  createPolicy,
  deletePolicy,
  fetchPolicies,
  fetchPolicy,
  type Policy,
  updatePolicy,
} from '@/lib/api/policies';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchPoliciesAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Policy[]>> {
  try {
    const data = await fetchPolicies(tenantId, projectId);
    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch policies',
    };
  }
}

export async function fetchPolicyAction(
  tenantId: string,
  projectId: string,
  policyId: string
): Promise<ActionResult<Policy>> {
  try {
    const data = await fetchPolicy(tenantId, projectId, policyId);
    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch policy',
    };
  }
}

export async function createPolicyAction(
  tenantId: string,
  projectId: string,
  policy: PolicyApiInsert
): Promise<ActionResult<Policy>> {
  try {
    const data = await createPolicy(tenantId, projectId, policy);
    revalidatePath(`/${tenantId}/projects/${projectId}/policies`);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create policy',
    };
  }
}

export async function updatePolicyAction(
  tenantId: string,
  projectId: string,
  policy: PolicyApiUpdate & { id: string }
): Promise<ActionResult<Policy>> {
  try {
    const data = await updatePolicy(tenantId, projectId, policy.id, policy);
    revalidatePath(`/${tenantId}/projects/${projectId}/policies`);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update policy',
    };
  }
}

export async function deletePolicyAction(
  tenantId: string,
  projectId: string,
  policyId: string
): Promise<ActionResult<null>> {
  try {
    await deletePolicy(tenantId, projectId, policyId);
    revalidatePath(`/${tenantId}/projects/${projectId}/policies`);
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete policy',
    };
  }
}
