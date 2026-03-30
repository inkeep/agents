'use server';

import { deleteSkill } from '@/lib/api/skills';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function deleteSkillAction(
  tenantId: string,
  projectId: string,
  skillId: string
): Promise<ActionResult<null>> {
  try {
    await deleteSkill(tenantId, projectId, skillId);
    return { success: true, data: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message, code: error.error.code };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete skill',
    };
  }
}
