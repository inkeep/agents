'use server';

import { revalidatePath } from 'next/cache';
import {
  createEvaluationRunConfig,
  deleteEvaluationRunConfig,
  updateEvaluationRunConfig,
} from '../api/evaluation-run-configs';
import type { ActionResult } from './types';

export async function createEvaluationRunConfigAction(
  tenantId: string,
  projectId: string,
  data: Parameters<typeof createEvaluationRunConfig>[2]
): Promise<ActionResult<Awaited<ReturnType<typeof createEvaluationRunConfig>>>> {
  try {
    const created = await createEvaluationRunConfig(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true, data: created };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create evaluation run config',
    };
  }
}

export async function updateEvaluationRunConfigAction(
  tenantId: string,
  projectId: string,
  configId: string,
  data: Parameters<typeof updateEvaluationRunConfig>[3]
): Promise<ActionResult<Awaited<ReturnType<typeof updateEvaluationRunConfig>>>> {
  try {
    const updated = await updateEvaluationRunConfig(tenantId, projectId, configId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update evaluation run config',
    };
  }
}

export async function deleteEvaluationRunConfigAction(
  tenantId: string,
  projectId: string,
  configId: string
): Promise<ActionResult<void>> {
  try {
    await deleteEvaluationRunConfig(tenantId, projectId, configId);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete evaluation run config',
    };
  }
}
