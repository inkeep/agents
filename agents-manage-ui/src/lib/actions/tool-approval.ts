/**
 * Tool Approval Server Actions
 *
 * ⚠️ SECURITY: This file uses 'use server' directive - all functions execute server-side only.
 *
 * Client components should ONLY import fetchToolApprovalDiff() - never import the internal
 * utility functions directly from client code.
 *
 * The internal functions are exported for testing purposes only.
 */
'use server';

import { computeDiff, extractFieldsToUpdate, fetchCurrentEntityState } from './tool-approval.utils';
import type { ActionResult } from './types';

interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

interface FetchToolApprovalDiffParams {
  toolName: string;
  input: Record<string, any>;
  tenantId: string;
  projectId: string;
}

export async function fetchToolApprovalDiff(
  params: FetchToolApprovalDiffParams
): Promise<ActionResult<FieldDiff[]> & { entityData?: Record<string, any> }> {
  try {
    const { toolName, input, tenantId, projectId } = params;

    const currentState = await fetchCurrentEntityState({
      toolName,
      input,
      tenantId,
      projectId,
    });

    if (toolName.includes('delete') && currentState) {
      return {
        success: true,
        data: [],
        entityData: currentState,
      };
    }

    const newValues = extractFieldsToUpdate(input);
    const diffs = computeDiff(currentState, newValues);

    return {
      success: true,
      data: diffs,
    };
  } catch (error) {
    console.error('Failed to fetch tool approval diff:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch entity state',
      code: 'fetch_failed',
    };
  }
}

export type { FieldDiff };
