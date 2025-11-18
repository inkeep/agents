'use server';

import { revalidatePath } from 'next/cache';
import { createEvaluationSuiteConfig } from '../api/evaluation-suite-configs';
import type { ActionResult } from './types';

export async function createEvaluationSuiteConfigAction(
  tenantId: string,
  projectId: string,
  data: Parameters<typeof createEvaluationSuiteConfig>[2]
): Promise<ActionResult<{ id: string }>> {
  try {
    const created = await createEvaluationSuiteConfig(tenantId, projectId, data);
    revalidatePath(`/${tenantId}/projects/${projectId}/evaluations`);
    return { success: true, data: { id: created.id } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create evaluation suite config',
    };
  }
}
