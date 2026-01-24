'use server';

import { deleteSkill, fetchSkills, type Skill } from '@/lib/api/skills';
import { ApiError } from '../types/errors';
import type { ActionResult } from './types';

export async function fetchSkillsAction(
  tenantId: string,
  projectId: string
): Promise<ActionResult<Skill[]>> {
  try {
    const data = await fetchSkills(tenantId, projectId);
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
      error: error instanceof Error ? error.message : 'Failed to fetch agent skills',
    };
  }
}

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
